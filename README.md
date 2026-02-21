# gimme.money
**Emily, Simran & Hannah — ETH Denver 2025**

Real-world asset tokenization of utility receivables with cross-chain payment streaming. Automated electricity metering on Hedera (using Schedule Service) mints NFT receivables on ADI Chain for factoring and liquidity.

---

## What It Does

Cross-chain utility payment infrastructure demonstrating:
1. **Hedera**: Self-perpetuating payment streams using Schedule Service (HSS) for hourly electricity metering
2. **ADI Chain**: RWA tokenization of utility receivables as NFTs with native $ADI payment support
3. **Cross-chain relay**: Listens to Hedera settlement events, mints corresponding receivables on ADI
4. **Dual frontends**: Customer dashboard (React) + Merchant dashboard (Vite)

**Live Demo**: 1 OUTSTANDING receivable NFT successfully minted cross-chain

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  HEDERA TESTNET                                             │
│  ElectricityPaymentStream.sol                               │
│  - Oracle reports usage + pricing every 5 min               │
│  - HSS auto-schedules settle() every hour                   │
│  - Emits: SettlementExecuted, SettlementFailed              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Cross-chain relay (hederaToADI.ts)
                 │ Polls events every 12s
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  ADI TESTNET                                                │
│  UtilityReceivable.sol                                      │
│  - Mints NFTs: OUTSTANDING (failed) or PAID (success)       │
│  - Custom ERC721-like with native $ADI @ $3.10              │
│  - Status: OUTSTANDING, FACTORED, PARTIAL, PAID, DEFAULTED  │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- MetaMask with Hedera & ADI testnet configured

### 1. Install dependencies

```bash
git clone https://github.com/emilyjiji/eth-denver-2.0.git
cd eth-denver-2.0
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in:

```bash
# Hedera
HEDERA_RPC=https://testnet.hashio.io/api
DEPLOYER_PRIVATE_KEY=0x...
HEDERA_STREAM_ADDRESS=0xc4A1Ef40bC4771D8c2f5352429A737a980B40692

# ADI
ADI_RPC=https://rpc.ab.testnet.adifoundation.ai
ADI_CHAIN_ID=99999
RELAY_PRIVATE_KEY=0x...
ADI_CERTIFICATE_ADDRESS=0x31246c37f75cC7fe6f669651c66d27E6708De1b1
```

### 3. Run tests (161 passing)

```bash
npm test                    # All tests (Hedera + ADI)
npm run test:adi            # ADI UtilityReceivable tests only
```

### 4. Start cross-chain relay

```bash
npm run relay               # Hedera → ADI relay
```

### 5. Launch frontends

**Customer Dashboard** (React):
```bash
cd frontend/my-app
npm install
npm start                   # http://localhost:3000
```

**Merchant Dashboard** (Vite):
```bash
cd frontend/merchant-app
npm install
npm run dev                 # http://localhost:5173
```

---

## Key Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests (161 passing) |
| `npm run compile` | Compile Solidity contracts |
| `npm run relay` | Start Hedera→ADI event listener |
| `npm run relay:base` | Start Base→Hedera deposit relay |
| `npm run settle` | Manually trigger settlement |
| `npm run deploy:adi` | Deploy UtilityReceivable to ADI |
| `npm run start:oracle` | Start usage/pricing oracle |

---

## Deployed Contracts

**Hedera Testnet**:
- `ElectricityPaymentStream`: [`0xc4A1Ef40bC4771D8c2f5352429A737a980B40692`](https://hashscan.io/testnet/contract/0xc4A1Ef40bC4771D8c2f5352429A737a980B40692)

**ADI Testnet**:
- `UtilityReceivable`: [`0x31246c37f75cC7fe6f669651c66d27E6708De1b1`](https://scan.ab.testnet.adifoundation.ai/address/0x31246c37f75cC7fe6f669651c66d27E6708De1b1)

---

## Project Structure

```
contracts/
  ElectricityPaymentStream.sol    # Hedera: HSS-powered payment streams
  adi/UtilityReceivable.sol        # ADI: RWA NFT receivables
  MockElectricityOracle.sol        # On-chain oracle for testing
  MockHSSPrecompile.sol            # Hedera Schedule Service mock

relay/
  hederaToADI.ts                   # Cross-chain event relay
  baseToHedera.ts                  # Base→Hedera deposit bridge

frontend/
  my-app/                          # Customer dashboard (React)
  merchant-app/                    # Merchant/provider dashboard (Vite)

test/
  ElectricityPaymentStream.test.ts # 27 Hedera contract tests
  UtilityReceivable.test.ts        # 61 ADI contract tests
  oraclePricing.test.ts            # 73 oracle simulation tests

oracle/
  run.ts                           # Usage/pricing data simulator
```

---

## Bounties Targeted

**Hedera Schedule Service ($5,000)**:
- Self-perpetuating payment streams using HSS (IHRC-1215)
- `settle()` automatically re-schedules itself each execution
- Dynamic congestion-based pricing with PRNG capacity probing
- 27 passing tests covering schedule lifecycle

**ADI RWA/DePIN ($10,000-$19,000)**:
- Utility receivables tokenized as NFTs on ADI Chain
- Native $ADI payments with hardcoded $3.10 price
- Custom ERC721-like implementation (no OpenZeppelin)
- Cross-chain minting from Hedera settlement events
- 61 passing tests with full status lifecycle (OUTSTANDING → FACTORED → PAID)

---

## How to Demo

1. **View deployed contracts** on block explorers (links above)
2. **Run tests**: `npm test` shows 161 passing
3. **Start relay**: `npm run relay` - monitors Hedera, mints on ADI
4. **Customer UI**: Shows stream balance, usage, deposit flow
5. **Merchant UI**: Manages receivables, customers, factoring

---

## Technical Highlights

- **Hedera Schedule Service**: True contract-initiated scheduling, no external cron jobs
- **ADI Native Integration**: Direct $ADI token handling with price conversion
- **Custom NFT**: Gas-optimized receivable NFTs without OpenZeppelin overhead
- **Cross-chain Events**: Reliable event polling with deduplication
- **Comprehensive Tests**: 161 tests covering edge cases, reentrancy, access control
