# Electricity Payment Streaming Architecture

## System Overview

This app demonstrates **self-running, contract-driven payment streaming** for electricity using Hedera's blockchain infrastructure and Schedule Service. **No off-chain servers trigger payments** - the smart contract deterministically creates schedules based on usage data, and Hedera executes them automatically.

**Built for Hedera Schedule Service Bounty**: Contract-initiated scheduling with full lifecycle tracking and edge case handling.

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND DASHBOARD (Reads from On-Chain Oracle Contract)    │
│   Shows: Usage, Pricing, Schedule Status, Payment History   │
└────────────────┬─────────────────────────────────────────────┘
                 │ Direct contract reads
                 │ (no WebSocket)
┌────────────────▼──────────────────────────────────────────┐
│         ON-CHAIN ORACLE CONTRACT                          │
│    (PriceAndUsageOracle.sol)                              │
│                                                           │
│  Stores latest:                                           │
│  - Current usage (KWh)                                    │
│  - Current price ($/KWh)                                  │
│  - Timestamp                                              │
│  - Historical data                                        │
└────────────────┬──────────────────────────────────────────┘
                 │ Reads from
┌────────────────▼──────────────────────────────────────────┐
│      PAYMENT SCHEDULER CONTRACT                           │
│  (ElectricityPaymentScheduler.sol)                         │
│                                                           │
│  1. Reads current usage from Oracle                       │
│  2. Reads current price from Oracle                       │
│  3. Calculates payment: usage × rate                      │
│  4. Creates ScheduleCreate transaction                    │
│  5. Hedera auto-executes payment                          │
│  6. Emits events on-chain                                 │
└────────────────┬──────────────────────────────────────────┘
                 │
         ┌───────▼──────────────────┐
         │ HEDERA SCHEDULE SERVICE  │
         │ Auto-executes at time    │
         └───────────────────────────┘

KEY: All data lives on-chain via Oracle contract.
     Frontend queries Oracle directly (no WebSocket needed).
     Contract reads from Oracle for deterministic decisions.
     NO off-chain servers for critical operations.
```

---

## Component Breakdown

### 1. FRONTEND (Next.js Dashboard)

**Location**: `./client` (Next.js 14+ with TypeScript)

**Purpose**: Real-time visualization of electricity usage and costs

**Key Pages**:
- `/dashboard` - Main display with live usage graph, current price, projected cost
- `/history` - Payment transaction history
- `/settings` - User configuration (price limits, alert thresholds)

**Tech Stack**:
- Next.js (React framework with built-in API routes)
- TypeScript for type safety
- TailwindCSS for styling
- Recharts for real-time charts
- ethers.js or Hedera SDK for contract interaction
- SWR (React hook for data fetching)

**Real-time Features**:
- Direct contract reads from Oracle (no WebSocket dependency)
- Polling Oracle contract every 5-10 seconds for updates
- Live chart rendering showing last 24 hours of usage
- Current KWh rate and projected hourly cost
- Transaction notifications when payments are scheduled
- All data verifiable on Hedera explorer

---

### 2. BACKEND (Express.js API Server)

**Location**: `./src` (TypeScript Node.js)

**Purpose**: Orchestrates simulator, pricing, Hedera integration, and serves frontend

**Architecture Layers**:

#### a) **Express Server** (`server.ts`)
- REST API endpoints for dashboard data
- Oracle contract writer (updates usage/price on-chain)
- CORS for frontend communication
- Static file serving for production
- Health check endpoints

#### b) **Hedera Integration Service** (`services/hedera.ts`)

**Key Responsibilities**:
- Initialize Hedera client with testnet credentials
- Deploy/interact with smart contracts
- Use Hedera Schedule Service to schedule hourly payments

**How Schedule Service Works**:
1. User starts electricity account
2. We create a Hedera scheduled transaction (ScheduleCreate)
3. Transaction: Deduct payment amount from user's HTS token balance
4. Schedule it to execute every hour at a specific time
5. Each hour, Hedera automatically executes the transaction (no manual trigger needed)

**Example Flow**:
```
Hour 1: Usage = 2.5 KWh, Price = $0.12/KWh → Cost = $0.30
        → Schedule payment of $0.30 in HBAR to provider
        
Hour 2: Usage = 3.1 KWh, Price = $0.18/KWh (peak) → Cost = $0.558
        → Schedule payment of $0.558
        
Hedera automatically executes these scheduled transactions
```

#### c) **Usage Simulator** (`simulator/usageSimulator.ts`)

**Generates Realistic Electricity Usage**:
- Base load: 0.5-1.5 KWh per hour (refrigerator, always-on devices)
- Time-of-day variance:
  - Morning (6-9 AM): +1 KWh (coffee, shower, morning routine)
  - Peak hours (5-9 PM): +2-3 KWh (cooking, heating/cooling, entertainment)
  - Night (10 PM-6 AM): -0.5 KWh (sleeping, fewer devices)
- Random spikes: 0.5-2 KWh at random times (AC kick-in, charging devices)
- Gaussian distribution for realistic variability

**Output**: Hourly usage in KWh written to Oracle contract on-chain

#### d) **Pricing Engine** (`services/pricingEngine.ts`)

**Dynamic Pricing Rules**:
```
Base Price: $0.12 per KWh
Peak Hours: 5 PM - 9 PM → 1.5x multiplier → $0.18/KWh
Off-Peak: 9 PM - 6 AM → 0.8x multiplier → $0.096/KWh
Day Rate: 6 AM - 5 PM → 1.0x multiplier → $0.12/KWh

Additionally:
- High Usage Surcharge: If hourly usage > 4 KWh → +$0.02 per KWh
- Time-of-Year: Winter months +10%, Summer months -5%
```

**Calculation**: `act (ElectricityPaymentScheduler.sol)

**Location**: `./src/contracts/ElectricityPaymentScheduler.sol`

**Core Responsibility**: Contract-initiated, deterministic payment scheduling

#### Key Functions:

```solidity
contract ElectricityPaymentScheduler {
  // Called by backend with hourly usage data
  function schedulePayment(
    address user,
    uint256 usageKwh,
    uint256 hourlyRateInUSD,
    uint256 nextExecutionTime
  ) external onlyBackend {
    // 1. Calculate payment: usage × rate
    uint256 paymentAmount = calculateCost(usageKwh, hourlyRateInUSD);
    
    // 2. Create scheduled transaction via Hedera Schedule Service
    ScheduleID scheduleId = HederaScheduleService.schedulePayment(
      user,                    // payer
      UTILITY_PROVIDER,        // recipient
      paymentAmount,           // amount in ELECTRIC tokens
      nextExecutionTime        // execution time (next hour)
    );
    
    // 3. Store schedule metadata
    schedules[scheduleId] = PaymentSchedule({
      user: user,
      amount: paymentAmount,
      status: Status.CREATED,
      createdAt: block.timestamp,
      scheduledFor: nextExecutionTime
    });
    
    // 4. Emit event for dashboard
    emit PaymentScheduled(scheduleId, user, paymentAmount, nextExecutionTime);
  }
  
  // Handles payment failures, retries, insufficient balance
  function handleScheduleFailure(ScheduleID scheduleId) external {
    PaymentSchedule schedule = schedules[scheduleId];
    schedule.status = Status.FAILED;
    
    // Implement retry logic or notification
    emit ScheduleFailed(scheduleId, schedule.user, "Insufficient balance");
  }
  
  // Query schedule status
  function getScheduleStatus(ScheduleID scheduleId) 
    external view returns (Status) 
  {
    return schedules[scheduleId].status;
  }
}
```

#### Why Contract-Driven Scheduling?

**Traditional Approach** (Problematic):
```
Backend Timer → Every Hour → Backend Script Calls schedulePayment()
→ Central Point of Failure ❌
→ Requires Always-On Server ❌
→ Off-chain logic ❌
```

**Our Approach** (Bounty-Aligned):
```
Backend Reports Usage → Smart Contract Deterministically Decides
→ Contract Creates Schedule via Hedera HSS ✅
→ Hedera Validators Execute Automatically ✅
→ No Off-Chain Servers ✅
→ Contract Logic is Source of Truth ✅
```

#### HTS (Hedera Token Service) Integration
- User receives 10,000 "ELECTRIC" tokens (ERC20-like)
- 1 ELECTRIC = $0.01 value
- When schedule executes, Hedera automatically transfers tokens from user to utility provider
- Contract tracks all transfersmart Contract Concept** (pseudo-code):
```
When Hour Passes:
  1. Calculate: hours_usage × current_rate = payment_amount
  2. Create ScheduleTransaction {
       type: CRYPTOTRANSFER,
       from: user_account,
       to: utility_provider_account,
       amount: payment_amount in tokens,
       execute_time: next_hour_mark
     }
  3. Submit to Hedera - it queues and auto-executes
```

---

### 4. ORACLE CONTRACT (PriceAndUsageOracle.sol)

**Location**: `./src/contracts/PriceAndUsageOracle.sol`

**Core Responsibility**: On-chain data store for usage and pricing

#### Key Functions:

```solidity
contract PriceAndUsageOracle {
  struct OracleData {
    uint256 usageKwh;           // Current KWh usage
    uint256 pricePerKwh;        // Current price per KWh
    uint256 pricingTier;        // 0=off-peak, 1=standard, 2=peak
    uint256 timestamp;          // When data was updated
    uint256 dailyProjectedCost; // Projected cost for day
  }
  
  OracleData public latestData;
  mapping(uint256 => OracleData) public historicalData; // timestamp => data
  
  // Called by authorized backend to update usage/price
  function updateUsageAndPrice(
    uint256 usageKwh,
    uint256 pricePerKwh,
    uint256 pricingTier,
    uint256 dailyProjectedCost
  ) external onlyAuthorized {
    latestData = OracleData({
      usageKwh: usageKwh,
      pricePerKwh: pricePerKwh,
      pricingTier: pricingTier,
      timestamp: block.timestamp,
      dailyProjectedCost: dailyProjectedCost
    });
    
    historicalData[block.timestamp] = latestData;
    emit OracleUpdated(usageKwh, pricePerKwh, block.timestamp);
  }
  
  // Anyone can query latest data
  function getLatestData() external view returns (OracleData memory) {
    return latestData;
  }
  
  // Query historical data
  function getHistoricalData(uint256 timestamp) 
    external view returns (OracleData memory) 
  {
    return historicalData[timestamp];
  }
}
```

#### Why On-Chain Oracle?

✅ **No WebSocket dependency** - All data lives on-chain  
✅ **Decentralized reads** - Frontend queries directly from contract  
✅ **Verifiable** - All data on Hedera explorer  
✅ **Self-running** - Schedule contract reads from oracle, not backend  
✅ **Permanent record** - Complete history stored on-chain  

---

### 5. OBSERVABILITY & SCHEDULE LIFECYCLE

**Dashboard shows complete schedule lifecycle**:

```
USER CREATES ACCOUNT
        ↓
BACKEND CALCULATES USAGE & PRICE
        ↓
BACKEND WRITES TO ORACLE CONTRACT
        ↓
SCHEDULE CONTRACT READS FROM ORACLE
        ↓
[CREATED] Schedule transaction created in Hedera
        ↓
[PENDING] Waiting for scheduled execution time
        ↓
[EXECUTED] ✅ Payment successfully transferred
        ↓
[FAILED] ❌ Edge case: Insufficient balance
        ↓
[RETRY_QUEUED] Retry scheduled for 2 hours later
        ↓
[PARTIAL_PAID] Paid what was available, difference rolled to next period
```

**Dashboard Tracks**:
- Schedule ID (Hedera transaction hash)
- Status (created/pending/executed/failed)
- Amount (in ELECTRIC tokens)
- Scheduled Execution Time
- Actual Execution Time
- User Readable: "Next payment scheduled for 3:00 PM EST on Feb 19"

#### Edge Cases Handled

| Scenario | Solution | Contract Responsibility |
|----------|----------|------------------------|
| **Insufficient Balance** | Retry with reduced amount | `handleInsufficientFunds()` |
| **Expired Schedule** | Reschedule for next available slot | `rescheduleExpired()` |
| **Network Congestion** | Hedera handles retry automatically | N/A (Hedera HSS feature) |
| **User Cancels Subscription** | `cancelSchedule()` deletes pending schedules | Store cancellation flag |
| **Price Update Mid-Hour** | Use price at schedule creation time | Record price at creation |
| **Schedule Execution Failure** | Emit event, dashboard shows failure + reason | `onScheduleFailure()` callback |

---

### 6. DATA FLOW DIAGRAM (Oracle-Based Architecture)

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                         │
│  Dashboard shows: Usage graph, Current rate, Schedule List   │
│                   Reads directly from Oracle contract         │
└────────────────┬───────────────────────────────────────────┘
                 │ Direct contract reads (every 5-10s)
                 │ No WebSocket needed
                 │
┌────────────────▼───────────────────────────────────────────┐
│          ORACLE CONTRACT (On-Chain Data)                    │
│          (PriceAndUsageOracle.sol)                          │
│                                                             │
│  Stores:                                                    │
│  - Latest usage (KWh)                                       │
│  - Latest price ($/KWh)                                     │
│  - Pricing tier (off-peak/standard/peak)                    │
│  - Daily projection                                         │
│  - Historical data by timestamp                             │
│                                                             │
│  Events emitted on each update                              │
└────────────────┬───────────────────────────────────────────┘
                 │
         ┌───────┴────────────────────┐
         │                            │
         ▼                            ▼
    ┌─────────────────┐       ┌──────────────────────┐
    │ PAYMENT         │       │ BACKEND              │
    │ SCHEDULER       │       │ (Express)            │
    │ CONTRACT        │       │                      │
    │                 │       │ Usage Simulator ────→│
    │ Reads Oracle    │       │ Pricing Engine    ──→│
    │ Creates         │       │                      │
    │ schedules       │       │ Updates Oracle ──────│
    │                 │       │ (hourly)             │
    │ Calls HSS       │       │                      │
    └────────┬────────┘       └──────────────────────┘
             │
             ├─→ ScheduleCreate Transaction
             │
    ┌────────▼────────────────────────────┐
    │ HEDERA SCHEDULE SERVICE             │
    │ (Auto-Execution)                    │
    │                                     │
    │ At scheduled time:                  │
    │ Execute CryptoTransfer              │
    │ (User → Provider)                   │
    │                                     │
    │ Result: Emit Success/Failure event  │
    └────────┬─────────────────────────────┘
             │
             └─→ Events queryable by frontend
                 Dashboard shows status update
```

---

### 7. ORACLE UPDATE FLOW (Backend)

```typescript
// Every hour:
1. Simulator generates usage (2.5 KWh)
2. Pricing engine calculates rate ($0.12/KWh)
3. Backend calls Oracle contract:
   
   updateUsageAndPrice(
     usageKwh: 2.5,
     pricePerKwh: 0.12,
     pricingTier: 1,  // 0=off-peak, 1=std, 2=peak
     dailyProjectedCost: 8.45
   )

4. Oracle stores data on-chain
5. Oracle emits OracleUpdated event
6. Frontend polls Oracle, reads new data
```

---

## Technology Choices Explained

### Why On-Chain Oracle Instead of WebSocket?
1. **Decentralized**: Data lives on Hedera, not on a server
2. **No Server Dependency**: Frontend never needs backend to be running
3. **Verifiable**: All data visible on Hedera explorer
4. **Scalable**: Multiple frontends can read same oracle
5. **Self-Running**: Schedule contract reads from oracle directly
6. **Better for Bounty**: Shows deep blockchain integration

### Why Hedera?
1. **Schedule Service**: Handles recurring payments automatically - no backend cron needed
2. **Lower Fees**: $0.0001 per transaction (vs Ethereum's $1-10)
3. **Deterministic**: Transactions always succeed with same execution
4. **HTS**: Native token service without smart contract complexity

### Why Next.js for Frontend?
1. **Full-stack capability**: API routes in same codebase
2. **Real-time ready**: Works seamlessly with WebSockets
3. **Performance**: Built-in optimization and streaming
4. **TypeScript**: Type safety across frontend and backend
5. **Deployment**: Easy to deploy on Vercel

### Why Express Backend?
1. **Simplicity**: Minimal setup for API + WebSocket
2. **Real-time**: Easy WebSocket integration
3. **Flexibility**: Full control over scheduling and Hedera integration
4. **Lightweight**: Fast startup and execution

---

## Setup Steps

1. **Project Structure**: Create directory layout (done)
2. **Backend Setup**: Initialize Express, Hedera SDK, database
3. **Simulator Engine**: Build realistic usage patterns
4. **Pricing Calculation**: Implement dynamic pricing
5. **Frontend Dashboard**: Next.js app with real-time updates
6. **Hedera Integration**: Schedule service setup
7. **Testing**: Simulate full payment cycle

---

## Deployment Architecture

```
Local Development:
  Next.js Frontend (localhost:3000)
           ↓
  Express Backend (localhost:3001)
           ↓
  Hedera Testnet

Production:
  Vercel (Next.js Frontend)
           ↓
  Railway/Render (Express Backend)
           ↓
  Hedera Mainnet
```

---

## Key Metrics Displayed on Dashboard

- **Current Usage**: KWh right now
- **Hourly Cost**: $ per hour based on current rate
- **Daily Projection**: Estimated $ for the full day
- **Peak Hours Notice**: Alert when entering peak pricing period
- **Total Monthly Cost**: Running total
- **Usage History**: 24-hour graph with spikes
- **Pricing Tier**: Current multiplier (off-peak, standard, peak)
