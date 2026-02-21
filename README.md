# gimme.money
Emily, Simran & Hannah — ETH Denver 2025

Cross-chain electricity payment streams: swap ETH → USDC on Base via Uniswap, relay converts to HBAR, and funds a self-scheduling Hedera payment stream using the Hedera Schedule Service (HSS).

---

## Architecture

```
User (MetaMask)
    │  ETH
    ▼
Uniswap API (Base Sepolia)
    │  USDC
    ▼
Base→Hedera Relay (localhost:3001)
    │  HBAR  topUpDeposit()
    ▼
ElectricityPaymentStream (Hedera Testnet)
    │  HSS auto-schedules settle()
    ▼
Energy Provider
```

---

## Setup

### Prerequisites
- Node.js 18+
- Chrome + MetaMask extension
- Base Sepolia ETH (see faucets below)

### 1. Clone & install

```bash
git clone https://github.com/emilyjiji/eth-denver-2.0.git
cd eth-denver-2.0
npm install
cd frontend/my-app && npm install && cd ../..
```

### 2. Create `frontend/my-app/.env.local`

```env
REACT_APP_UNISWAP_API_KEY=<your Uniswap API key>
REACT_APP_CHAIN_ID=84532
REACT_APP_RELAY_URL=http://localhost:3001
REACT_APP_STREAM_ID=3
RELAY_PRIVATE_KEY=<hedera testnet wallet private key — must be stream payer>
```

> **Never commit `.env.local`** — it's gitignored.

Get a Uniswap API key at https://developer.uniswap.org
Get a Hedera testnet account at https://portal.hedera.com

### 3. Get Base Sepolia ETH

- https://faucet.quicknode.com/base/sepolia
- https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

### 4. Start the relay

```bash
npm run relay:base
# Listening on http://localhost:3001
```

### 5. Start the frontend

```bash
cd frontend/my-app
npm start
# Opens http://localhost:3000
```

---

## Testing the Deposit Flow

1. Open http://localhost:3000 in Chrome
2. Go to the **Deposit** tab
3. Connect MetaMask — MetaMask will prompt you to switch to Base Sepolia
4. Enter an ETH amount (e.g. `0.001`)
5. Wait for the Uniswap quote to appear
6. Click **Swap & Fund Stream** and approve the prompts in MetaMask:
   - Wrap ETH → WETH
   - Sign Permit2 approval
   - Confirm swap transaction
7. The relay automatically converts the USDC output to HBAR and calls `topUpDeposit()` on Hedera testnet
8. Success screen shows links to Basescan (swap tx) and Hashscan (Hedera tx)

---

## Scripts

| Command | Description |
|---|---|
| `npm run relay:base` | Start Base→Hedera relay |
| `npm run relay` | Start Hedera→ADI relay |
| `npm run compile` | Compile Solidity contracts |
| `npm run test` | Run Hardhat tests |
| `npm run settle` | Manually trigger settlement |
| `npm run settle:success` | Top up + settle |

---

## Contracts (Hedera Testnet)

| Contract | Address |
|---|---|
| ElectricityPaymentStream | `0xc4A1Ef40bC4771D8c2f5352429A737a980B40692` |

---

## Bounties

- **Uniswap API** — ETH→USDC swap on Base Sepolia using the Uniswap Trading API with auto WETH wrapping and Permit2
- **Hedera HSS** — Self-perpetuating payment streams via the Hedera Schedule Service; `settle()` re-schedules itself on each execution
