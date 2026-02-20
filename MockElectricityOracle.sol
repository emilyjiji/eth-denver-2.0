// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockElectricityOracle
 * @notice Chainlink AggregatorV3-compatible mock oracle for electricity meter data.
 *
 * @dev Tracks CUMULATIVE kWh to:
 *        - Prevent replay attacks (old readings are always lower)
 *        - Let callers compute deltas: usageSinceLastBill = newTotal - oldTotal
 *        - Match how real utility meters work
 *
 *      All kWh values use 3-decimal fixed-point (scaled × 1000):
 *        500  → 0.500 kWh
 *        1500 → 1.500 kWh
 *
 *      The Chainlink-compatible `latestRoundData()` / `getRoundData()` return
 *      `answer` scaled to 8 decimals (× 1e5 on top of the internal × 1000 scale),
 *      matching the Chainlink price-feed convention.
 *
 * Time-of-day usage bands (mirrors oracle-simulator.ts):
 *   LOW    00:00–06:00  sleeping          base × ~0.35
 *   MEDIUM 06:00–17:00  lights/appliances base × ~1.00
 *   HIGH   17:00–22:00  cooking/AC/TV     base × ~1.70
 *   MEDIUM 22:00–24:00  winding down      base × ~0.55
 */
contract MockElectricityOracle {

    // ── Types ─────────────────────────────────────────────────────────────────

    /// @notice Broad time-of-day classification stored with each reading.
    enum UsagePeriod { LOW, MEDIUM, HIGH }

    /// @notice Full meter reading stored per Chainlink round.
    struct MeterReading {
        uint80      roundId;
        uint256     cumulativeKWh;  // running total, scaled × 1000
        uint256     hourlyKWh;      // this hour's usage, scaled × 1000
        uint256     timestamp;      // block.timestamp when submitted
        uint8       hour;           // 0–23 derived from timestamp
        UsagePeriod period;
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    /// @notice The address allowed to submit readings (simulates a Chainlink node).
    address public oracleOperator;

    /// @notice Current (latest) round identifier.
    uint80 public latestRoundId;

    /// @notice roundId → MeterReading
    mapping(uint80 => MeterReading) public readings;

    // ── Events ────────────────────────────────────────────────────────────────

    event MeterReadingUpdated(
        uint80      indexed roundId,
        uint256     cumulativeKWh,
        uint256     hourlyKWh,
        uint8       hour,
        UsagePeriod period,
        uint256     timestamp
    );

    event OperatorTransferred(address indexed from, address indexed to);

    // ── Errors ────────────────────────────────────────────────────────────────

    error NotOperator();
    error CumulativeNotIncreasing(uint256 given, uint256 current);
    error ZeroAddress();
    error RoundDoesNotExist(uint80 roundId);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address _operator) {
        if (_operator == address(0)) revert ZeroAddress();
        oracleOperator = _operator;
        emit OperatorTransferred(address(0), _operator);
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOperator() {
        if (msg.sender != oracleOperator) revert NotOperator();
        _;
    }

    // ── Oracle update (called by off-chain simulator) ─────────────────────────

    /**
     * @notice Submit a new meter reading.
     * @dev Called by the oracle-simulator.ts process (or a Chainlink node in prod).
     *      Reverts if cumulativeKWh does not strictly increase — prevents replays.
     *
     * @param cumulativeKWh  Running meter total since installation (× 1000).
     *                       Example: 1500 = 1.500 kWh accumulated so far.
     * @param hourlyKWh      Usage in the last hour (× 1000).
     *                       Example: 500 = 0.500 kWh this hour.
     */
    function updateReading(uint256 cumulativeKWh, uint256 hourlyKWh) external onlyOperator {
        // Enforce strictly increasing cumulative total
        if (latestRoundId > 0 && cumulativeKWh <= readings[latestRoundId].cumulativeKWh) {
            revert CumulativeNotIncreasing(cumulativeKWh, readings[latestRoundId].cumulativeKWh);
        }

        uint80 roundId = ++latestRoundId;
        uint8  hour    = uint8((block.timestamp / 3600) % 24);
        UsagePeriod period = _classifyHour(hour);

        readings[roundId] = MeterReading({
            roundId:       roundId,
            cumulativeKWh: cumulativeKWh,
            hourlyKWh:     hourlyKWh,
            timestamp:     block.timestamp,
            hour:          hour,
            period:        period
        });

        emit MeterReadingUpdated(roundId, cumulativeKWh, hourlyKWh, hour, period, block.timestamp);
    }

    // ── Chainlink AggregatorV3Interface ───────────────────────────────────────
    //
    //  Consumers (e.g. ElectricityPaymentScheduler.sol) can read this oracle
    //  exactly as they would any Chainlink price feed:
    //
    //      (,int256 answer,,,) = oracle.latestRoundData();
    //      uint256 kWh = uint256(answer) / 1e8;  // back to whole kWh
    //
    //  answer encoding:
    //      cumulativeKWh (stored × 1000) × 1e5  =  kWh × 1e8  (8-decimal Chainlink fmt)

    /// @notice Returns latest reading in Chainlink AggregatorV3Interface format.
    function latestRoundData()
        external
        view
        returns (
            uint80  roundId,
            int256  answer,      // cumulativeKWh × 1e8
            uint256 startedAt,
            uint256 updatedAt,
            uint80  answeredInRound
        )
    {
        MeterReading storage r = readings[latestRoundId];
        return (
            r.roundId,
            int256(r.cumulativeKWh * 1e5),   // ×1000 stored × 1e5 = ×1e8 total
            r.timestamp,
            r.timestamp,
            r.roundId
        );
    }

    /// @notice Returns historical reading in Chainlink AggregatorV3Interface format.
    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80  roundId,
            int256  answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80  answeredInRound
        )
    {
        if (_roundId == 0 || _roundId > latestRoundId) revert RoundDoesNotExist(_roundId);
        MeterReading storage r = readings[_roundId];
        return (
            r.roundId,
            int256(r.cumulativeKWh * 1e5),
            r.timestamp,
            r.timestamp,
            r.roundId
        );
    }

    /// @notice Number of decimal places in `answer` (matches Chainlink convention).
    function decimals() external pure returns (uint8) { return 8; }

    /// @notice Human-readable feed description.
    function description() external pure returns (string memory) {
        return "Mock Electricity Meter — cumulative kWh";
    }

    /// @notice Interface version.
    function version() external pure returns (uint256) { return 1; }

    // ── Convenience views ─────────────────────────────────────────────────────

    /// @notice Returns the full MeterReading struct for the latest round.
    function latestReading() external view returns (MeterReading memory) {
        return readings[latestRoundId];
    }

    /**
     * @notice Compute kWh consumed between two rounds — useful for billing.
     * @dev    delta = readings[toRound].cumulativeKWh - readings[fromRound].cumulativeKWh
     *         Result is scaled × 1000 (same units as cumulativeKWh).
     */
    function usageBetween(uint80 fromRound, uint80 toRound)
        external
        view
        returns (uint256 deltaKWh)
    {
        if (toRound <= fromRound)         revert RoundDoesNotExist(toRound);
        if (toRound   > latestRoundId)    revert RoundDoesNotExist(toRound);
        return readings[toRound].cumulativeKWh - readings[fromRound].cumulativeKWh;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Transfer the oracle operator role (e.g. rotate Chainlink node key).
    function transferOperator(address newOperator) external onlyOperator {
        if (newOperator == address(0)) revert ZeroAddress();
        emit OperatorTransferred(oracleOperator, newOperator);
        oracleOperator = newOperator;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /**
     * @dev Classify an hour (0–23) into a usage period.
     *      Must stay in sync with getHourConfig() in oracle-simulator.ts.
     */
    function _classifyHour(uint8 h) internal pure returns (UsagePeriod) {
        if (h < 6)  return UsagePeriod.LOW;     // 00:00–06:00  sleeping
        if (h < 17) return UsagePeriod.MEDIUM;  // 06:00–17:00  lights / appliances
        if (h < 22) return UsagePeriod.HIGH;    // 17:00–22:00  cooking / AC / TV
        return UsagePeriod.MEDIUM;              // 22:00–24:00  winding down
    }
}
