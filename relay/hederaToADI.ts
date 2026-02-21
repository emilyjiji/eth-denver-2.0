import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Cross-chain relay: Hedera ElectricityPaymentStream -> ADI UtilityReceivable
 *
 * CORRECTED to match ACTUAL Hedera contract events
 *
 * Listens to Hedera events and mints corresponding receivables on ADI:
 * - SettlementExecuted (PAID) -> Mint with status PAID
 * - SettlementFailed (OUTSTANDING) -> Mint with status OUTSTANDING
 *
 * Deployed ADI Contract: 0x31246c37f75cC7fe6f669651c66d27E6708De1b1
 */

// ============ Configuration ============

const HEDERA_RPC = process.env.HEDERA_RPC || "https://testnet.hashio.io/api";
const ADI_RPC = process.env.ADI_RPC || "https://rpc.ab.testnet.adifoundation.ai";
const PRIVATE_KEY = process.env.RELAY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

const HEDERA_STREAM_ADDRESS = process.env.HEDERA_STREAM_ADDRESS!;
const ADI_RECEIVABLE_ADDRESS = process.env.ADI_CERTIFICATE_ADDRESS!;

const POLL_INTERVAL = 12000; // 12 seconds
const HBAR_TO_USD = 0.05; // $0.05 per HBAR (for demo)

// ============ ACTUAL Hedera Contract ABI ============

const HEDERA_STREAM_ABI = [
    // Settlement events (what we need!)
    "event SettlementExecuted(uint256 indexed streamId, uint256 timestamp, uint256 count, uint256 amountPaid, uint256 remainingDeposit, uint256 remainingAccrued)",
    "event SettlementFailed(uint256 indexed streamId, string reason, uint256 needed, uint256 available)",
    "event SettlementScheduled(uint256 indexed streamId, uint256 scheduledTime, uint256 desiredTime, address scheduleAddress)",

    // Other events (for logging/debugging)
    "event UsageReported(uint256 indexed streamId, uint256 deltaUsage, uint256 effectiveRate, uint256 cost, uint256 totalAccrued)",
    "event PricingUpdated(uint256 indexed streamId, uint256 baseRate, uint256 congestionFactor, uint256 effectiveRate)",
    "event StreamCreated(uint256 indexed streamId, address indexed payer, address indexed payee, uint256 intervalSecs, uint256 baseRate)",

    // Functions
    "function streams(uint256) external view returns (tuple(uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce))"
];

const ADI_RECEIVABLE_ABI = [
    "function mintReceivable(address utilityProvider, address customer, uint256 amountUSD, uint256 dueDate, uint8 status, bytes32 hederaTxHash) external returns (uint256)",
    "function processedHederaTx(bytes32) external view returns (bool)",
    "function owner() external view returns (address)",
    "function relayer() external view returns (address)",
    "function totalReceivables() external view returns (uint256)",
    "event ReceivableMinted(uint256 indexed tokenId, address indexed utilityProvider, address indexed customer, uint256 amountUSD, uint256 amountADI, uint8 status, bytes32 hederaTxHash)"
];

enum ReceivableStatus {
    OUTSTANDING = 0,
    FACTORED = 1,
    PARTIAL = 2,
    PAID = 3,
    DEFAULTED = 4
}

// ============ Main Relay Class ============

class HederaToADIRelay {
    private hederaProvider: ethers.JsonRpcProvider;
    private adiProvider: ethers.JsonRpcProvider;
    private adiWallet: ethers.Wallet;
    private hederaContract: ethers.Contract;
    private adiContract: ethers.Contract;
    private lastProcessedBlock: number = 0;

    constructor() {
        console.log("Initializing relay...\n");

        this.hederaProvider = new ethers.JsonRpcProvider(HEDERA_RPC);
        this.adiProvider = new ethers.JsonRpcProvider(ADI_RPC);

        if (!PRIVATE_KEY) {
            throw new Error("PRIVATE_KEY not set in .env");
        }

        this.adiWallet = new ethers.Wallet(PRIVATE_KEY, this.adiProvider);

        this.hederaContract = new ethers.Contract(
            HEDERA_STREAM_ADDRESS,
            HEDERA_STREAM_ABI,
            this.hederaProvider
        );

        this.adiContract = new ethers.Contract(
            ADI_RECEIVABLE_ADDRESS,
            ADI_RECEIVABLE_ABI,
            this.adiWallet
        );

        console.log("Relay initialized:");
        console.log("  Hedera Stream:", HEDERA_STREAM_ADDRESS);
        console.log("  ADI Receivable:", ADI_RECEIVABLE_ADDRESS);
        console.log("  Relay Address:", this.adiWallet.address);
        console.log();
    }

    async start() {
        console.log("=== Starting Hedera -> ADI Relay ===\n");

        // Verify ADI contract
        const owner = await this.adiContract.owner();
        const relayer = await this.adiContract.relayer();
        const totalRecs = await this.adiContract.totalReceivables();

        console.log("ADI Contract verified:");
        console.log("  Owner:", owner);
        console.log("  Relayer:", relayer);
        console.log("  Total Receivables:", totalRecs.toString());
        console.log();

        if (relayer.toLowerCase() !== this.adiWallet.address.toLowerCase()) {
            console.warn("⚠️  WARNING: Relay address doesn't match contract relayer!");
            console.warn(`   Contract expects: ${relayer}`);
            console.warn(`   You are: ${this.adiWallet.address}\n`);
        }

        this.lastProcessedBlock = await this.hederaProvider.getBlockNumber();
        console.log(`Starting from Hedera block: ${this.lastProcessedBlock}\n`);

        // Start polling
        this.poll();
    }

    private async poll() {
        while (true) {
            try {
                const currentBlock = await this.hederaProvider.getBlockNumber();

                if (currentBlock > this.lastProcessedBlock) {
                    console.log(`Checking Hedera blocks ${this.lastProcessedBlock + 1} to ${currentBlock}...`);

                    await this.processEvents(this.lastProcessedBlock + 1, currentBlock);

                    this.lastProcessedBlock = currentBlock;
                }

                await new Promise(r => setTimeout(r, POLL_INTERVAL));

            } catch (error: any) {
                console.error("Error in poll loop:", error.message);
                await new Promise(r => setTimeout(r, POLL_INTERVAL));
            }
        }
    }

    private async processEvents(fromBlock: number, toBlock: number) {
        // Get ALL events to show relay is working
        const allFilter = {
            address: HEDERA_STREAM_ADDRESS,
            fromBlock: fromBlock,
            toBlock: toBlock
        };

        const allLogs = await this.hederaProvider.getLogs(allFilter);

        if (allLogs.length > 0) {
            console.log(`  📊 Found ${allLogs.length} total event(s) in these blocks:`);

            // Try to decode and identify events
            const iface = this.hederaContract.interface;
            const eventCounts: any = {};

            for (const log of allLogs) {
                try {
                    const parsed = iface.parseLog(log);
                    if (parsed) {
                        eventCounts[parsed.name] = (eventCounts[parsed.name] || 0) + 1;
                    }
                } catch {
                    eventCounts['Unknown'] = (eventCounts['Unknown'] || 0) + 1;
                }
            }

            for (const [name, count] of Object.entries(eventCounts)) {
                console.log(`     ${count}× ${name}`);
            }
            console.log();
        }

        // Listen for SettlementExecuted (customer paid on Hedera)
        await this.processSettlementExecuted(fromBlock, toBlock);

        // Listen for SettlementFailed (customer couldn't pay)
        await this.processSettlementFailed(fromBlock, toBlock);
    }

    private async processSettlementExecuted(fromBlock: number, toBlock: number) {
        const filter = this.hederaContract.filters.SettlementExecuted();
        const events = await this.hederaContract.queryFilter(filter, fromBlock, toBlock);

        if (events.length === 0) return;

        console.log(`\n✓ Found ${events.length} SettlementExecuted event(s)`);

        for (const event of events) {
            try {
                if (!('args' in event)) continue;

                const streamId = event.args[0]; // uint256 streamId
                const timestamp = event.args[1]; // uint256 timestamp
                const count = event.args[2]; // uint256 count
                const amountPaid = event.args[3]; // uint256 amountPaid (in HBAR wei)

                console.log(`\n--- Processing PAID Receivable (Stream ${streamId}) ---`);

                // Query stream data to get customer and utility addresses
                const streamData = await this.hederaContract.streams(streamId);
                const customer = streamData.payer;
                const utility = streamData.payee;
                const settlementInterval = streamData.settlementIntervalSecs;

                // Convert HBAR to USD
                const amountHBAR = Number(ethers.formatEther(amountPaid));
                const amountUSD = amountHBAR * HBAR_TO_USD;
                const amountUSD6Decimals = Math.floor(amountUSD * 1e6);

                console.log(`  Customer: ${customer}`);
                console.log(`  Utility: ${utility}`);
                console.log(`  Amount: ${amountHBAR.toFixed(4)} HBAR = $${amountUSD.toFixed(2)} USD`);

                // Create proof hash
                const hederaTxHash = ethers.keccak256(ethers.toUtf8Bytes(event.transactionHash));

                // Check if already processed
                const processed = await this.adiContract.processedHederaTx(hederaTxHash);
                if (processed) {
                    console.log(`  Already processed, skipping`);
                    continue;
                }

                // Calculate due date
                const dueDate = Number(timestamp) + 30 * 24 * 3600;

                // Mint PAID receivable on ADI
                const tx = await this.adiContract.mintReceivable(
                    utility,              // utilityProvider
                    customer,             // customer
                    amountUSD6Decimals,   // amountUSD (6 decimals)
                    dueDate,              // dueDate
                    ReceivableStatus.PAID, // status = 3
                    hederaTxHash          // proof
                );

                console.log(`  Minting TX sent: ${tx.hash}`);
                const receipt = await tx.wait();
                console.log(`  ✓ Minted PAID receivable at ADI block ${receipt.blockNumber}`);

            } catch (error: any) {
                console.error(`  ✗ Error processing event:`, error.message);
            }
        }
    }

    private async processSettlementFailed(fromBlock: number, toBlock: number) {
        const filter = this.hederaContract.filters.SettlementFailed();
        const events = await this.hederaContract.queryFilter(filter, fromBlock, toBlock);

        if (events.length === 0) return;

        console.log(`\n⚠️  Found ${events.length} SettlementFailed event(s)`);

        for (const event of events) {
            try {
                if (!('args' in event)) continue;

                const streamId = event.args[0]; // uint256 streamId
                const reason = event.args[1]; // string reason
                const needed = event.args[2]; // uint256 needed
                const available = event.args[3]; // uint256 available

                console.log(`\n--- Processing OUTSTANDING Receivable (Stream ${streamId}) ---`);
                console.log(`  Reason: ${reason}`);

                // Query stream data
                const streamData = await this.hederaContract.streams(streamId);
                const customer = streamData.payer;
                const utility = streamData.payee;

                // Convert HBAR to USD
                const neededHBAR = Number(ethers.formatEther(needed));
                const amountUSD = neededHBAR * HBAR_TO_USD;
                const amountUSD6Decimals = Math.floor(amountUSD * 1e6);

                console.log(`  Customer: ${customer}`);
                console.log(`  Utility: ${utility}`);
                console.log(`  Needed: ${neededHBAR.toFixed(4)} HBAR = $${amountUSD.toFixed(2)} USD`);

                const hederaTxHash = ethers.keccak256(ethers.toUtf8Bytes(event.transactionHash));

                const processed = await this.adiContract.processedHederaTx(hederaTxHash);
                if (processed) {
                    console.log(`  Already processed, skipping`);
                    continue;
                }

                const dueDate = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

                // Mint OUTSTANDING receivable
                const tx = await this.adiContract.mintReceivable(
                    utility,
                    customer,
                    amountUSD6Decimals,
                    dueDate,
                    ReceivableStatus.OUTSTANDING, // status = 0
                    hederaTxHash
                );

                console.log(`  Minting TX sent: ${tx.hash}`);
                const receipt = await tx.wait();
                console.log(`  ✓ Minted OUTSTANDING receivable at ADI block ${receipt.blockNumber}`);
                console.log(`  → Utility can now factor this receivable!`);

            } catch (error: any) {
                console.error(`  ✗ Error processing event:`, error.message);
            }
        }
    }
}

// ============ Entry Point ============

async function main() {
    try {
        const relay = new HederaToADIRelay();
        await relay.start();
    } catch (error: any) {
        console.error("Fatal error:", error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
