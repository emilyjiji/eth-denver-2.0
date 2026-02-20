// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ElectricityPaymentStream
 * @notice Self-perpetuating electricity payment streaming contract powered by the
 *         Hedera Schedule Service (HSS, IHRC-1215).
 *
 * @dev Architecture overview
 * ─────────────────────────
 *  1. User calls `createStream()` with an HBAR deposit.
 *  2. The contract immediately schedules the first `settle()` call via HSS.
 *  3. Every `settlementIntervalSecs` seconds, HSS calls `settle()` automatically:
 *       - Pays the utility provider the accrued amount (up to the safety cap).
 *       - Schedules the NEXT settlement, creating a perpetual loop.
 *  4. An off-chain oracle calls `reportUsageWithPricing()` every 5 minutes with
 *     a signed usage + pricing update that accrues cost on the stream.
 *
 * Unit conventions
 * ────────────────
 *  - Usage  : kWh × 1000 (integer).  500 → 0.500 kWh.  Matches MockElectricityOracle.
 *  - Rates  : wei per usage unit.  cost = usageDelta × effectiveRate.
 *  - Congestion factor: basis points.  10 000 = 1.0×,  25 000 = 2.5×.
 *
 * Hedera precompiles used (direct low-level calls — no SDK import needed)
 * ───────────────────────────────────────────────────────────────────────
 *  0x16b  Hedera Schedule Service  (IHRC-1215)
 *  0x169  Hedera PRNG              (jitter for capacity probing, falls back to block data)
 */
contract ElectricityPaymentStream {

    // ── Hedera precompile addresses ───────────────────────────────────────────

    address constant HSS  = address(0x16b);
    address constant PRNG = address(0x169);

    // ── Protocol constants ────────────────────────────────────────────────────

    int64   constant HEDERA_SUCCESS   = 22;
    uint256 constant SCHEDULE_GAS     = 1_000_000;
    uint256 constant MAX_PROBES       = 8;
    uint256 constant MIN_CONGESTION   = 5_000;   // 0.5× floor
    uint256 constant MAX_CONGESTION   = 50_000;  // 5.0× ceiling

    // ── Data structures ───────────────────────────────────────────────────────

    struct Stream {
        // Identity
        uint256 streamId;
        address payer;
        address payee;

        // Configuration
        uint256 baseRatePerUnit;        // wei per kWh-unit (1 unit = 0.001 kWh)
        uint256 maxPayPerInterval;      // safety cap in wei
        uint256 settlementIntervalSecs; // seconds between settlements
        address authorizedOracle;

        // Financial state
        uint256 depositBalance;  // prepaid native currency held in contract (wei)
        uint256 accruedAmount;   // amount owed since last settlement (wei)
        uint256 totalUsageUnits; // cumulative kWh × 1000

        // Lifecycle
        bool    active;
        uint256 lastSettlementTime;
        uint256 settlementCount;

        // Schedule state
        address lastScheduleAddress;
        uint256 nextSettlementTime;
        address schedulePayer;
        bool    usePayerScheduling;

        // Replay-protection
        uint256 oracleNonce;
    }

    struct PricingSnapshot {
        uint256 baseRate;
        uint256 congestionFactor;
        uint256 effectiveRate;
        uint256 timestamp;
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    uint256 public streamCount;
    mapping(uint256 => Stream) public streams;
    mapping(uint256 => PricingSnapshot[]) public pricingHistory;

    // ── Events ────────────────────────────────────────────────────────────────

    event StreamCreated(
        uint256 indexed streamId,
        address indexed payer,
        address indexed payee,
        uint256 intervalSecs,
        uint256 baseRate
    );
    event UsageReported(
        uint256 indexed streamId,
        uint256 deltaUsage,
        uint256 effectiveRate,
        uint256 cost,
        uint256 totalAccrued
    );
    event PricingUpdated(
        uint256 indexed streamId,
        uint256 baseRate,
        uint256 congestionFactor,
        uint256 effectiveRate
    );
    event SettlementExecuted(
        uint256 indexed streamId,
        uint256 timestamp,
        uint256 count,
        uint256 amountPaid,
        uint256 remainingDeposit,
        uint256 remainingAccrued
    );
    event SettlementFailed(
        uint256 indexed streamId,
        string  reason,
        uint256 needed,
        uint256 available
    );
    event SettlementScheduled(
        uint256 indexed streamId,
        uint256 scheduledTime,
        uint256 desiredTime,
        address scheduleAddress
    );
    event DepositAdded(uint256 indexed streamId, address indexed sender, uint256 amount);
    event StreamPaused(uint256 indexed streamId, string reason);
    event StreamResumed(uint256 indexed streamId);
    event LowBalanceWarning(
        uint256 indexed streamId,
        uint256 deposit,
        uint256 accrued,
        uint256 percentUsed
    );

    // ── Errors ────────────────────────────────────────────────────────────────

    error InvalidPayee();
    error InvalidInterval();
    error InvalidOracle();
    error NoDepositSent();
    error StreamNotActive(uint256 streamId);
    error InvalidNonce(uint256 submitted, uint256 expected);
    error InvalidCongestionFactor(uint256 factor);
    error InvalidOracleSignature();
    error UsageNotIncreasing(uint256 submitted, uint256 current);
    error OnlyPayer();
    error OnlyPayerOrPayee();
    error ScheduleCreationFailed(int64 responseCode);
    error NoCapacityFound();
    error TooEarlyToSettle(uint256 now_, uint256 earliest);

    // ── External: stream lifecycle ────────────────────────────────────────────

    /**
     * @notice Create a new payment stream.  Caller must send native currency as
     *         the initial deposit.
     *
     * @param payee               Utility provider address.
     * @param baseRatePerUnit     Default rate in wei per kWh-unit (0.001 kWh).
     * @param maxPayPerInterval   Safety cap: max wei paid per settlement.
     * @param intervalSecs        Seconds between automatic settlements.
     * @param oracle              Address whose signature is required on usage reports.
     * @param schedulePayer_      Account that pays HSS fees (ignored when !usePayerScheduling).
     * @param usePayerScheduling_ If true, use scheduleCallWithPayer; else scheduleCall.
     * @return streamId           Newly assigned stream identifier.
     */
    function createStream(
        address payee,
        uint256 baseRatePerUnit,
        uint256 maxPayPerInterval,
        uint256 intervalSecs,
        address oracle,
        address schedulePayer_,
        bool    usePayerScheduling_
    ) external payable returns (uint256 streamId) {
        if (payee  == address(0)) revert InvalidPayee();
        if (intervalSecs == 0)   revert InvalidInterval();
        if (oracle == address(0)) revert InvalidOracle();
        if (msg.value == 0)       revert NoDepositSent();

        streamId = streamCount++;

        Stream storage s = streams[streamId];
        s.streamId             = streamId;
        s.payer                = msg.sender;
        s.payee                = payee;
        s.baseRatePerUnit      = baseRatePerUnit;
        s.maxPayPerInterval    = maxPayPerInterval;
        s.settlementIntervalSecs = intervalSecs;
        s.authorizedOracle     = oracle;
        s.depositBalance       = msg.value;
        s.active               = true;
        s.lastSettlementTime   = block.timestamp;
        s.schedulePayer        = schedulePayer_;
        s.usePayerScheduling   = usePayerScheduling_;

        // Seed the pricing history with the initial base rate at 1× congestion.
        pricingHistory[streamId].push(PricingSnapshot({
            baseRate:         baseRatePerUnit,
            congestionFactor: 10_000,
            effectiveRate:    baseRatePerUnit,
            timestamp:        block.timestamp
        }));

        // Schedule the first settlement.
        _scheduleNextSettlement(streamId, block.timestamp + intervalSecs);

        emit StreamCreated(streamId, msg.sender, payee, intervalSecs, baseRatePerUnit);
    }

    /**
     * @notice Oracle submits a signed usage + pricing update.
     *         Called every ~5 minutes by the off-chain oracle service.
     *
     * @param streamId         Target stream.
     * @param newTotalUsage    New cumulative usage in kWh × 1000 (must be > current).
     * @param timestamp_       Unix timestamp of the meter reading.
     * @param nonce            Must equal oracleNonce + 1 (prevents replays).
     * @param baseRate         Rate in wei per kWh-unit for this interval.
     * @param congestionFactor Multiplier in basis points (5000–50000).
     * @param signature        ECDSA signature over keccak256(abi.encodePacked(
     *                           streamId, newTotalUsage, baseRate, congestionFactor,
     *                           timestamp_, nonce)) prefixed by "\x19Ethereum Signed Message:\n32".
     */
    function reportUsageWithPricing(
        uint256 streamId,
        uint256 newTotalUsage,
        uint256 timestamp_,
        uint256 nonce,
        uint256 baseRate,
        uint256 congestionFactor,
        bytes calldata signature
    ) external {
        Stream storage s = streams[streamId];
        if (!s.active)                              revert StreamNotActive(streamId);
        if (nonce != s.oracleNonce + 1)             revert InvalidNonce(nonce, s.oracleNonce + 1);
        if (newTotalUsage <= s.totalUsageUnits)     revert UsageNotIncreasing(newTotalUsage, s.totalUsageUnits);
        if (congestionFactor < MIN_CONGESTION ||
            congestionFactor > MAX_CONGESTION)      revert InvalidCongestionFactor(congestionFactor);

        // Verify ECDSA signature.
        bytes32 hash = keccak256(abi.encodePacked(
            streamId, newTotalUsage, baseRate, congestionFactor, timestamp_, nonce
        ));
        bytes32 ethHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32", hash
        ));
        if (_recoverSigner(ethHash, signature) != s.authorizedOracle)
            revert InvalidOracleSignature();

        // Calculate cost for this reporting interval.
        uint256 usageDelta   = newTotalUsage - s.totalUsageUnits;
        uint256 effectiveRate = (baseRate * congestionFactor) / 10_000;
        uint256 cost          = usageDelta * effectiveRate;

        // Update stream state.
        s.totalUsageUnits = newTotalUsage;
        s.accruedAmount  += cost;
        s.oracleNonce     = nonce;

        // Record pricing snapshot.
        pricingHistory[streamId].push(PricingSnapshot({
            baseRate:         baseRate,
            congestionFactor: congestionFactor,
            effectiveRate:    effectiveRate,
            timestamp:        block.timestamp
        }));

        emit UsageReported(streamId, usageDelta, effectiveRate, cost, s.accruedAmount);
        emit PricingUpdated(streamId, baseRate, congestionFactor, effectiveRate);

        // Warn when the deposit is 80 %+ consumed.
        if (s.depositBalance > 0) {
            uint256 pct = (s.accruedAmount * 100) / s.depositBalance;
            if (pct >= 80) {
                emit LowBalanceWarning(streamId, s.depositBalance, s.accruedAmount, pct);
            }
        }
    }

    /**
     * @notice Execute one settlement cycle.
     * @dev    On Hedera this is called automatically by the Schedule Service.
     *         The timing guard prevents premature execution.
     *         Follows Checks-Effects-Interactions: state updated BEFORE the transfer.
     *
     * @param streamId Target stream.
     */
    function settle(uint256 streamId) external {
        Stream storage s = streams[streamId];
        if (!s.active) revert StreamNotActive(streamId);

        uint256 earliest = s.lastSettlementTime + s.settlementIntervalSecs;
        if (block.timestamp < earliest)
            revert TooEarlyToSettle(block.timestamp, earliest);

        // Determine amount due (cap at safety limit).
        uint256 amountDue = s.accruedAmount > s.maxPayPerInterval
            ? s.maxPayPerInterval
            : s.accruedAmount;

        if (amountDue > 0) {
            // Pause stream if deposit is exhausted.
            if (s.depositBalance < amountDue) {
                emit SettlementFailed(
                    streamId, "INSUFFICIENT_BALANCE", amountDue, s.depositBalance
                );
                _pauseStream(streamId, "Insufficient balance");
                return;
            }

            // ── Checks-Effects-Interactions ──────────────────────────────────
            s.depositBalance -= amountDue;
            s.accruedAmount  -= amountDue;
        }

        s.lastSettlementTime = block.timestamp;
        s.settlementCount   += 1;

        emit SettlementExecuted(
            streamId,
            block.timestamp,
            s.settlementCount,
            amountDue,
            s.depositBalance,
            s.accruedAmount
        );

        // Transfer HBAR to the utility provider (after state is updated).
        if (amountDue > 0) {
            (bool ok,) = s.payee.call{value: amountDue}("");
            require(ok, "ElectricityPaymentStream: transfer failed");
        }

        // Chain the next settlement — this is what makes the loop perpetual.
        _scheduleNextSettlement(streamId, block.timestamp + s.settlementIntervalSecs);
    }

    /**
     * @notice Add native currency to a stream's deposit.
     *         Automatically resumes a paused stream if the deposit now covers accrued debt.
     *
     * @param streamId Target stream.
     */
    function topUpDeposit(uint256 streamId) external payable {
        Stream storage s = streams[streamId];
        if (msg.sender != s.payer) revert OnlyPayer();
        if (msg.value == 0)        revert NoDepositSent();

        s.depositBalance += msg.value;
        emit DepositAdded(streamId, msg.sender, msg.value);

        // Resume the perpetual loop if the stream was paused and is now solvent.
        if (!s.active && s.depositBalance >= s.accruedAmount) {
            s.active = true;
            _scheduleNextSettlement(streamId, block.timestamp + s.settlementIntervalSecs);
            emit StreamResumed(streamId);
        }
    }

    /**
     * @notice Manually stop a stream.  Either payer or payee may call this.
     *
     * @param streamId Target stream.
     */
    function stopStream(uint256 streamId) external {
        Stream storage s = streams[streamId];
        if (msg.sender != s.payer && msg.sender != s.payee)
            revert OnlyPayerOrPayee();
        _pauseStream(streamId, "Manually stopped");
    }

    // ── View ──────────────────────────────────────────────────────────────────

    /**
     * @notice Returns a summary of the stream's current state.
     */
    function getStreamInfo(uint256 streamId) external view returns (
        address payer,
        address payee,
        bool    active,
        uint256 depositBalance,
        uint256 accruedAmount,
        uint256 totalUsageUnits,
        uint256 lastSettlementTime,
        uint256 nextSettlementTime,
        uint256 settlementCount
    ) {
        Stream storage s = streams[streamId];
        return (
            s.payer,
            s.payee,
            s.active,
            s.depositBalance,
            s.accruedAmount,
            s.totalUsageUnits,
            s.lastSettlementTime,
            s.nextSettlementTime,
            s.settlementCount
        );
    }

    /**
     * @notice Returns the number of pricing snapshots recorded for a stream.
     */
    function pricingHistoryLength(uint256 streamId) external view returns (uint256) {
        return pricingHistory[streamId].length;
    }

    // ── Internal: settlement scheduling ──────────────────────────────────────

    /**
     * @dev Create a Hedera scheduled transaction that will call `settle(streamId)`
     *      at approximately `desiredTime`.  Uses exponential-backoff probing to
     *      find a second with available capacity if `desiredTime` is full.
     */
    function _scheduleNextSettlement(uint256 streamId, uint256 desiredTime) internal {
        Stream storage s = streams[streamId];

        uint256 chosenTime = _findAvailableSecond(desiredTime, SCHEDULE_GAS, MAX_PROBES);
        bytes memory callData = abi.encodeWithSelector(this.settle.selector, streamId);

        (int64 code, address scheduleAddr) = _hssScheduleCall(
            address(this),
            chosenTime,
            SCHEDULE_GAS,
            0,
            callData
        );
        if (code != HEDERA_SUCCESS) revert ScheduleCreationFailed(code);

        s.lastScheduleAddress = scheduleAddr;
        s.nextSettlementTime  = chosenTime;

        emit SettlementScheduled(streamId, chosenTime, desiredTime, scheduleAddr);
    }

    /**
     * @dev Find a second >= `expiry` where the HSS has capacity to schedule
     *      a transaction with `gasLimit` gas.
     *      Uses exponential backoff (1,2,4,8…) with random jitter from the PRNG
     *      precompile (fallback: block data) so competing contracts probe
     *      different slots.
     */
    function _findAvailableSecond(
        uint256 expiry,
        uint256 gasLimit,
        uint256 maxProbes
    ) internal view returns (uint256) {
        // Fast path: desired slot is available.
        if (_hssHasCapacity(expiry, gasLimit)) return expiry;

        // Jitter seed for probing.
        uint256 seed = _prngSeed() ^ uint256(keccak256(abi.encodePacked(expiry)));

        for (uint256 i = 0; i < maxProbes; i++) {
            uint256 baseDelay = 1 << i;                    // 1, 2, 4, 8, …
            uint256 jitter    = seed % (baseDelay + 1);
            seed = uint256(keccak256(abi.encodePacked(seed, i)));

            uint256 candidate = expiry + baseDelay + jitter;
            if (_hssHasCapacity(candidate, gasLimit)) return candidate;
        }
        revert NoCapacityFound();
    }

    /**
     * @dev Mark a stream inactive and attempt to delete its pending schedule.
     */
    function _pauseStream(uint256 streamId, string memory reason) internal {
        Stream storage s = streams[streamId];
        s.active = false;

        if (s.lastScheduleAddress != address(0)) {
            _hssDeleteSchedule(s.lastScheduleAddress); // best-effort
            s.lastScheduleAddress = address(0);
        }

        emit StreamPaused(streamId, reason);
    }

    // ── Internal: Hedera precompile wrappers ──────────────────────────────────

    /**
     * @dev IHRC-1215 scheduleCall → (int64 responseCode, address scheduleAddress)
     *      Selector: keccak256("scheduleCall(address,uint256,uint256,uint64,bytes)")[:4]
     */
    function _hssScheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64  value,
        bytes memory callData
    ) internal returns (int64 responseCode, address scheduleAddress) {
        bytes4 sel = bytes4(keccak256("scheduleCall(address,uint256,uint256,uint64,bytes)"));
        (bool ok, bytes memory res) = HSS.call(
            abi.encodeWithSelector(sel, to, expirySecond, gasLimit, value, callData)
        );
        if (ok && res.length >= 64) {
            (responseCode, scheduleAddress) = abi.decode(res, (int64, address));
        } else {
            responseCode    = 21; // UNKNOWN
            scheduleAddress = address(0);
        }
    }

    /**
     * @dev IHRC-1215 hasScheduleCapacity → bool
     *      Selector: keccak256("hasScheduleCapacity(uint256,uint256)")[:4]
     */
    function _hssHasCapacity(uint256 expirySecond, uint256 gasLimit) internal view returns (bool) {
        bytes4 sel = bytes4(keccak256("hasScheduleCapacity(uint256,uint256)"));
        (bool ok, bytes memory res) = HSS.staticcall(
            abi.encodeWithSelector(sel, expirySecond, gasLimit)
        );
        return ok && res.length > 0 && abi.decode(res, (bool));
    }

    /**
     * @dev IHRC-1215 deleteSchedule — best-effort, ignores response.
     *      Selector: keccak256("deleteSchedule(address)")[:4]
     */
    function _hssDeleteSchedule(address scheduleAddress) internal {
        bytes4 sel = bytes4(keccak256("deleteSchedule(address)"));
        HSS.call(abi.encodeWithSelector(sel, scheduleAddress));
    }

    /**
     * @dev Hedera PRNG precompile — returns a pseudo-random seed for jitter.
     *      Falls back to block-based entropy if the precompile is unavailable
     *      (e.g., on local Hardhat network).
     */
    function _prngSeed() internal view returns (uint256) {
        (bool ok, bytes memory res) = PRNG.staticcall(
            abi.encodeWithSignature("getPseudorandomSeed()")
        );
        if (ok && res.length >= 32) return abi.decode(res, (uint256));
        // Fallback.
        return uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao)));
    }

    /**
     * @dev Recover ECDSA signer from a pre-hashed (already prefixed) digest.
     */
    function _recoverSigner(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "ElectricityPaymentStream: bad sig length");
        bytes32 r;
        bytes32 s_;
        uint8   v;
        assembly {
            r  := calldataload(sig.offset)
            s_ := calldataload(add(sig.offset, 32))
            v  := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s_);
    }
}
