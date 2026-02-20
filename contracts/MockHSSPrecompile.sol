// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockHSSPrecompile
 * @notice Mock of the Hedera Schedule Service precompile (0x16b) for local Hardhat tests.
 *
 * @dev Deploy this contract, then copy its runtime bytecode to 0x16b via
 *      `hardhat_setCode`.  After that, create an ethers Contract at 0x16b using
 *      this contract's ABI to inspect what the scheduler called.
 *
 *      The function signatures match IHRC-1215 exactly so the 4-byte selector
 *      sent by HourlyUsageScheduler._hssScheduleCall() is correctly dispatched.
 *
 *      Storage layout (important — must stay stable so hardhat_setCode works):
 *        slot 0: lastScheduledTo      (address)
 *        slot 1: lastExpirySecond     (uint256)
 *        slot 2: lastGasLimit         (uint256)
 *        slot 3: lastValue            (uint64)
 *        slot 4: lastCallData         (bytes — dynamic, stored via pointer)
 *        slot 5: scheduleCount        (uint256)
 *        slot 6: lastDeletedSchedule  (address)
 *        slot 7: deleteCount          (uint256)
 *
 *      When resetting storage between tests, zero slots 0–7.
 */
contract MockHSSPrecompile {

    int64 constant SUCCESS = 22;

    // Recorded parameters from the most recent scheduleCall invocation.
    address public lastScheduledTo;
    uint256 public lastExpirySecond;
    uint256 public lastGasLimit;
    uint64  public lastValue;
    bytes   public lastCallData;
    uint256 public scheduleCount;

    // Recorded parameters from the most recent deleteSchedule invocation.
    address public lastDeletedSchedule;
    uint256 public deleteCount;

    event MockScheduleCreated(
        address indexed to,
        uint256 expirySecond,
        address scheduleAddress
    );
    event MockScheduleDeleted(address indexed scheduleAddress);

    /**
     * @notice Mirrors IHRC1215.scheduleCall — same selector, same return ABI.
     * @dev    Returns SUCCESS (22) and a deterministic non-zero address derived
     *         from the call parameters so tests can assert address != address(0).
     */
    function scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64  value,
        bytes calldata callData
    ) external returns (int64 responseCode, address scheduleAddress) {
        lastScheduledTo  = to;
        lastExpirySecond = expirySecond;
        lastGasLimit     = gasLimit;
        lastValue        = value;
        lastCallData     = callData;
        scheduleCount++;

        // Produce a unique, non-zero fake schedule address.
        scheduleAddress = address(uint160(uint256(keccak256(
            abi.encode(scheduleCount, to, expirySecond, block.timestamp)
        ))));

        emit MockScheduleCreated(to, expirySecond, scheduleAddress);
        return (SUCCESS, scheduleAddress);
    }

    /// @notice Mirrors IHRC1215.hasScheduleCapacity — always returns true for tests.
    function hasScheduleCapacity(uint256, uint256) external pure returns (bool) {
        return true;
    }

    /**
     * @notice Mirrors IHRC1215.deleteSchedule — records the deletion and returns SUCCESS.
     * @dev    Called by ElectricityPaymentStream._hssDeleteSchedule().
     */
    function deleteSchedule(address scheduleAddress) external returns (int64 responseCode) {
        lastDeletedSchedule = scheduleAddress;
        deleteCount++;
        emit MockScheduleDeleted(scheduleAddress);
        return SUCCESS;
    }
}
