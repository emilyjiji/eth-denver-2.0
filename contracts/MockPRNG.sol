// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockPRNG
 * @notice Mock of the Hedera Pseudo-Random Number Generator precompile (0x169).
 *
 * @dev Deploy this contract, then copy its bytecode to 0x169 via `hardhat_setCode`
 *      in tests.  ElectricityPaymentStream._prngSeed() will call
 *      `getPseudorandomSeed()` on this contract to get jitter for schedule-slot probing.
 *
 *      Storage layout:
 *        slot 0: callCount (uint256)
 */
contract MockPRNG {

    uint256 public callCount;

    /**
     * @notice Returns a pseudo-random seed derived from block data.
     *         Matches the selector expected by ElectricityPaymentStream._prngSeed().
     */
    function getPseudorandomSeed() external returns (bytes32 seed) {
        callCount++;
        seed = keccak256(abi.encodePacked(
            block.timestamp,
            block.number,
            callCount
        ));
    }
}
