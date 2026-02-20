// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.4.9 <0.9.0;
pragma experimental ABIEncoderV2;

/**
 * @notice Minimal stub of IHederaTokenService required to compile
 *         hedera-schedule-service/IHederaScheduleService.sol locally.
 *
 *         Only the struct types referenced by HederaScheduleService.sol are
 *         defined here.  On Hedera mainnet/testnet the full SDK is available.
 */
interface IHederaTokenService {

    struct KeyValue {
        bool inheritAccountKey;
        address contractId;
        bytes ed25519;
        bytes ECDSA_secp256k1;
        address delegatableContractId;
    }

    struct TokenKey {
        uint keyType;
        KeyValue key;
    }

    struct Expiry {
        uint32  second;
        address autoRenewAccount;
        uint32  autoRenewPeriod;
    }

    struct HederaToken {
        string   name;
        string   symbol;
        address  treasury;
        string   memo;
        bool     tokenSupplyType;
        uint32   maxSupply;
        bool     freezeDefault;
        TokenKey[] tokenKeys;
        Expiry   expiry;
    }

    struct FixedFee {
        uint32  amount;
        address tokenId;
        bool    useHbarsForPayment;
        bool    useCurrentTokenForPayment;
        address feeCollector;
    }

    struct FractionalFee {
        uint32  numerator;
        uint32  denominator;
        uint32  minimumAmount;
        uint32  maximumAmount;
        bool    netOfTransfers;
        address feeCollector;
    }

    struct RoyaltyFee {
        uint32  numerator;
        uint32  denominator;
        uint32  amount;
        address tokenId;
        bool    useHbarsForPayment;
        address feeCollector;
    }

    struct TokenInfo {
        HederaToken token;
        uint32      totalSupply;
        bool        deleted;
        bool        defaultKycStatus;
        bool        pauseStatus;
        FixedFee[]    fixedFees;
        FractionalFee[] fractionalFees;
        RoyaltyFee[]  royaltyFees;
        string      ledgerId;
    }

    struct FungibleTokenInfo {
        TokenInfo tokenInfo;
        uint32    decimals;
    }

    struct NonFungibleTokenInfo {
        TokenInfo tokenInfo;
        int64     serialNumber;
        address   ownerId;
        int64     creationTime;
        bytes     metadata;
        address   spenderId;
    }
}
