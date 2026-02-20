// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.4.9 <0.9.0;

/**
 * @notice Minimal stub of HederaResponseCodes required to compile
 *         hedera-schedule-service/HederaScheduleService.sol locally.
 *
 *         Only the constants actually referenced in this repo are defined.
 *         On Hedera mainnet/testnet the full SDK library is available natively.
 */
library HederaResponseCodes {
    int64 constant public OK      = 0;
    int64 constant public SUCCESS = 22;
    int64 constant public UNKNOWN = 21;
}
