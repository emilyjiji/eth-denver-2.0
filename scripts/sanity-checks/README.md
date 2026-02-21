# Sanity Check Scripts

**Development and debugging tools for StreamGrid multi-chain system**

These are helper scripts created during development to debug and verify the Hedera → ADI integration.

---

## Hedera Chain Checks

### `check-settlement-timing.js`
**What it does:** Shows settlement intervals and timing for all streams
**Usage:** `node scripts/sanity-checks/check-settlement-timing.js`
**Shows:**
- Settlement interval (15 min, 1 hour, etc.)
- Last settlement time
- Next settlement time
- How overdue settlements are

---

### `check-settlement-status.js`
**What it does:** Detailed status of a specific stream
**Usage:** `node scripts/sanity-checks/check-settlement-status.js`
**Shows:**
- Payer, payee, active status
- Deposit balance vs accrued amount
- When next settlement is due

---

### `check-contract-balance.js`
**What it does:** Check Hedera contract HBAR balance
**Usage:** `node scripts/sanity-checks/check-contract-balance.js`
**Why:** Contract needs HBAR to pay for Schedule Service gas

---

### `check-past-events.js`
**What it does:** Search for settlement events in recent blocks
**Usage:** `node scripts/sanity-checks/check-past-events.js`
**Finds:**
- SettlementExecuted events (successful payments)
- SettlementFailed events (insufficient balance)

---

### `check-scheduled-events.js`
**What it does:** Find all SettlementScheduled events
**Usage:** `node scripts/sanity-checks/check-scheduled-events.js`
**Shows:**
- When schedules were created
- What time they're set to execute
- Schedule addresses on Hedera

---

### `check-schedule-address.js`
**What it does:** Check if a schedule was actually created
**Usage:** `node scripts/sanity-checks/check-schedule-address.js`
**Verifies:**
- lastScheduleAddress is not 0x0000...
- Schedule exists on Hedera

---

### `check-payer-scheduling.js` & `check-schedule-payer.js`
**What they do:** Check scheduling configuration
**Usage:** `node scripts/sanity-checks/check-payer-scheduling.js`
**Shows:**
- usePayerScheduling (true/false)
- Who pays for schedule execution
- Whether signatures are needed

---

### `decode-events.js`
**What it does:** Decode Hedera event topic hashes
**Usage:** `node scripts/sanity-checks/decode-events.js`
**Helps:**
- Identify which event type was emitted
- Compare topic hashes to event signatures

---

### `check-hedera-tx.js`
**What it does:** Decode a specific Hedera transaction
**Usage:** Edit tx hash in file, then run
**Shows:**
- What function was called
- What events were emitted

---

### `find-larger-stream.js`
**What it does:** Find streams with meaningful accrued amounts
**Usage:** `node scripts/sanity-checks/find-larger-stream.js`
**Why:** Tiny amounts (< $0.01) cause rounding errors

---

## ADI Chain Checks

### `check-adi-receivable.js`
**What it does:** Query ALL receivables on ADI contract
**Usage:** `node scripts/sanity-checks/check-adi-receivable.js`
**Shows:**
- Total receivables count
- Each NFT's data (amount, status, owner)
- Total outstanding vs total paid
- Who owns which NFTs

---

### `check-nft-metadata.js`
**What it does:** Detailed view of a specific NFT
**Usage:** `node scripts/sanity-checks/check-nft-metadata.js`
**Shows:**
- Full on-chain metadata
- Proves it's an ERC-721-like NFT
- Status interpretation (OUTSTANDING vs PAID)
- RWA value explanation

---

## Quick Reference

**To check if relay should be seeing events:**
```bash
node scripts/sanity-checks/check-past-events.js
```

**To see current state of all streams:**
```bash
node scripts/sanity-checks/check-settlement-timing.js
```

**To verify ADI receivables minted:**
```bash
node scripts/sanity-checks/check-adi-receivable.js
```

**To find which stream to test with:**
```bash
node scripts/sanity-checks/find-larger-stream.js
```

---

## Note

These scripts were created for development and debugging. They're not part of the production system - just helpful tools for understanding what's happening on both chains during development.

For production, you'd build proper monitoring dashboards that query these same contract functions.
