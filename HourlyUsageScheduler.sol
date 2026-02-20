// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title HourlyUsageScheduler
 * @notice Reads electricity usage from MockElectricityOracle every hour using
 *         the Hedera Schedule Service (HSS) precompile at 0x16b.
 *
 * @dev The contract is self-perpetuating: each execution of `fetchAndStoreUsage()`
 *      creates a new Hedera scheduled transaction targeting itself one hour in
 *      the future, chaining indefinitely with no off-chain trigger required after
 *      the initial `bootstrapSchedule()` call.
 *
 * Hedera Schedule Service (IHRC-1215) interaction
 * ───────────────────────────────────────────────
 *   Precompile : 0x000000000000000000000000000000000000016b
 *   Function   : scheduleCall(address to,
 *                             uint256 expirySecond,
 *                             uint256 gasLimit,
 *                             uint64  value,
 *                             bytes   callData)
 *                → (int64 responseCode, address scheduleAddress)
 *   SUCCESS    : responseCode == 22
 *
 * Oracle encoding
 * ───────────────
 *   All kWh values from MockElectricityOracle are scaled × 1000:
 *     750  → 0.750 kWh
 *     1500 → 1.500 kWh
 */
contract HourlyUsageScheduler {

    // ── Constants ─────────────────────────────────────────────────────────────

    /// @dev Hedera Schedule Service precompile (IHRC-1215).
    address constant HSS = address(0x16b);

    /// @dev Hedera SUCCESS response code.
    int64 constant HEDERA_SUCCESS = 22;

    /// @dev One hour in seconds — the scheduling interval.
    uint256 constant HOUR = 3_600;

    /// @dev Gas budget forwarded to the scheduled `fetchAndStoreUsage` call.
    uint256 constant SCHEDULE_GAS = 300_000;

    // ── Oracle interface (inline to avoid external import) ────────────────────

    /// @dev Mirror of MockElectricityOracle.UsagePeriod so we can decode the struct.
    enum UsagePeriod { LOW, MEDIUM, HIGH }

    /// @dev Mirror of MockElectricityOracle.MeterReading.
    struct MeterReading {
        uint80      roundId;
        uint256     cumulativeKWh;
        uint256     hourlyKWh;
        uint256     timestamp;
        uint8       hour;
        UsagePeriod period;
    }

    // ── Immutables ────────────────────────────────────────────────────────────

    /// @notice Address of the MockElectricityOracle contract.
    address public immutable oracle;

    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice Round ID of the most recently fetched oracle reading.
    uint80 public lastFetchedRoundId;

    /// @notice Hourly kWh from the most recently fetched oracle reading (scaled × 1000).
    ///         Example: 750 → 0.750 kWh consumed this hour.
    uint256 public lastFetchedHourlyKWh;

    /// @notice Block timestamp when the last oracle fetch occurred.
    uint256 public lastFetchTimestamp;

    /// @notice Address of the currently active Hedera scheduled transaction.
    address public activeSchedule;

    // ── Events ────────────────────────────────────────────────────────────────

    /// @notice Emitted each time usage data is successfully read from the oracle.
    event UsageFetched(
        uint80  indexed roundId,
        uint256 hourlyKWh,
        uint256 timestamp
    );

    /// @notice Emitted each time a new hourly Hedera schedule is registered.
    event HourlyUpdateScheduled(
        address indexed scheduleAddress,
        uint256 executeAt
    );

    // ── Errors ────────────────────────────────────────────────────────────────

    error ScheduleFailed(int64 responseCode);
    error OracleNoData();

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address _oracle) {
        require(_oracle != address(0), "HourlyUsageScheduler: zero oracle");
        oracle = _oracle;
    }

    // ── External ──────────────────────────────────────────────────────────────

    /**
     * @notice Starts the self-perpetuating hourly schedule.
     * @dev    Call this exactly once after deployment.  Every subsequent
     *         invocation is triggered automatically by the Hedera Schedule Service.
     */
    function bootstrapSchedule() external {
        _scheduleNextHourlyUpdate();
    }

    /**
     * @notice Fetches the latest kWh reading from the oracle and immediately
     *         schedules the next invocation for one hour from now.
     * @dev    Invoked by the Hedera Schedule Service on each expiry.
     *         Reverts with `OracleNoData` if the oracle has never been written to.
     */
    function fetchAndStoreUsage() external {
        MeterReading memory r = _readOracle();
        if (r.roundId == 0) revert OracleNoData();

        lastFetchedRoundId   = r.roundId;
        lastFetchedHourlyKWh = r.hourlyKWh;
        lastFetchTimestamp   = block.timestamp;

        emit UsageFetched(r.roundId, r.hourlyKWh, block.timestamp);

        // Chain the next hourly fetch.
        _scheduleNextHourlyUpdate();
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /**
     * @notice Returns the most recently stored kWh reading and its timestamp.
     * @return kWh       Hourly usage, scaled × 1000 (e.g. 750 = 0.750 kWh).
     * @return timestamp Block timestamp of the last fetch.
     */
    function getLatestKWh() external view returns (uint256 kWh, uint256 timestamp) {
        return (lastFetchedHourlyKWh, lastFetchTimestamp);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /**
     * @dev Reads the latest meter reading from MockElectricityOracle via
     *      `latestReading()` and decodes it into a local `MeterReading` struct.
     */
    function _readOracle() internal view returns (MeterReading memory r) {
        (bool ok, bytes memory data) = oracle.staticcall(
            abi.encodeWithSignature("latestReading()")
        );
        if (!ok || data.length == 0) return r; // roundId == 0 signals no data
        r = abi.decode(data, (MeterReading));
    }

    /**
     * @dev Creates a Hedera scheduled call targeting `fetchAndStoreUsage()`
     *      on this contract, expiring exactly one hour from now.
     *
     *      Uses a direct low-level call to the HSS precompile instead of
     *      inheriting `HederaScheduleService` in order to avoid pulling in the
     *      full Hedera SDK import chain (HederaResponseCodes, IHederaTokenService…).
     */
    function _scheduleNextHourlyUpdate() internal {
        uint256 expiryAt = block.timestamp + HOUR;
        bytes memory callData = abi.encodeWithSelector(
            this.fetchAndStoreUsage.selector
        );

        (int64 code, address scheduleAddr) = _hssScheduleCall(
            address(this),
            expiryAt,
            SCHEDULE_GAS,
            0,          // no tinybar transfer
            callData
        );

        if (code != HEDERA_SUCCESS) revert ScheduleFailed(code);

        activeSchedule = scheduleAddr;
        emit HourlyUpdateScheduled(scheduleAddr, expiryAt);
    }

    /**
     * @dev Low-level call to the HSS precompile for IHRC-1215 `scheduleCall`.
     *      Selector: keccak256("scheduleCall(address,uint256,uint256,uint64,bytes)")[:4]
     *      Returns:  (int64 responseCode, address scheduleAddress)
     */
    function _hssScheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64  value,
        bytes memory callData
    ) internal returns (int64 responseCode, address scheduleAddress) {
        bytes4 selector = bytes4(
            keccak256("scheduleCall(address,uint256,uint256,uint64,bytes)")
        );
        (bool success, bytes memory result) = HSS.call(
            abi.encodeWithSelector(selector, to, expirySecond, gasLimit, value, callData)
        );
        if (success && result.length >= 64) {
            (responseCode, scheduleAddress) = abi.decode(result, (int64, address));
        } else {
            responseCode    = 21; // UNKNOWN — mirrors HederaResponseCodes.UNKNOWN
            scheduleAddress = address(0);
        }
    }
}
