import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Cross-chain relay: Hedera -> ADI Chain
 *
 * Listens to Hedera events and mints corresponding receivables on ADI:
 * - SettlementExecuted (PAID) -> Mint with status PAID
 * - SettlementFailed (OUTSTANDING) -> Mint with status OUTSTANDING
 *
 * Deployed ADI Contract: 0x2f78CC8Bccc8dfed1544bf5feF4108dA78C6A8fD
 */

// ============ Configuration ============

const HEDERA_RPC = process.env.HEDERA_RPC || "https://testnet.hashio.io/api";
const ADI_RPC = process.env.ADI_RPC || "https://rpc.ab.testnet.adifoundation.ai";
const PRIVATE_KEY = process.env.RELAY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

const HEDERA_PAYMENT_CONTRACT = process.env.HEDERA_STREAM_ADDRESS || "";
const ADI_RECEIVABLE_CONTRACT = process.env.ADI_CERTIFICATE_ADDRESS || "0x31246c37f75cC7fe6f669651c66d27E6708De1b1";

const POLL_INTERVAL = 12000; // 12 seconds

// ============ ABIs ============

const PAYMENT_STREAM_ABI = [
    "event SettlementExecuted(bytes32 indexed scheduleId, address indexed customer, address indexed provider, uint256 amount, uint256 timestamp)",
    "event SettlementFailed(bytes32 indexed scheduleId, address indexed customer, uint256 scheduledAmount, string reason)"
];

const UTILITY_RECEIVABLE_ABI = [
    "function mintReceivable(address utilityProvider, address customer, uint256 amountUSD, uint256 dueDate, uint8 status, bytes32 hederaTxHash) external returns (uint256)",
    "function processedHederaTx(bytes32) external view returns (bool)",
    "function relayer() external view returns (address)",
    "function owner() external view returns (address)",
    "function totalReceivables() external view returns (uint256)",
    "function totalOutstanding() external view returns (uint256)",
    "function totalPaid() external view returns (uint256)",
    "function ADI_PRICE_USD() external view returns (uint256)",
    "event ReceivableMinted(uint256 indexed tokenId, address indexed utilityProvider, address indexed customer, uint256 amountUSD, uint256 amountADI, uint8 status, bytes32 hederaTxHash)"
];

// ============ Enums ============

enum ReceivableStatus {
    OUTSTANDING = 0,
    FACTORED = 1,
    PARTIAL = 2,
    PAID = 3,
    DEFAULTED = 4
}

// ============ Interfaces ============

interface SettlementExecutedEvent {
    scheduleId: string;
    customer: string;
    provider: string;
    amount: bigint;
    timestamp: bigint;
    transactionHash: string;
    blockNumber: number;
}

interface SettlementFailedEvent {
    scheduleId: string;
    customer: string;
    scheduledAmount: bigint;
    reason: string;
    transactionHash: string;
    blockNumber: number;
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
        // Initialize providers
        this.hederaProvider = new ethers.JsonRpcProvider(HEDERA_RPC);
        this.adiProvider = new ethers.JsonRpcProvider(ADI_RPC);

        // Initialize wallet
        if (!PRIVATE_KEY) {
            throw new Error("PRIVATE_KEY not set in .env");
        }
        this.adiWallet = new ethers.Wallet(PRIVATE_KEY, this.adiProvider);

        // Initialize contracts
        this.hederaContract = new ethers.Contract(
            HEDERA_PAYMENT_CONTRACT,
            PAYMENT_STREAM_ABI,
            this.hederaProvider
        );

        this.adiContract = new ethers.Contract(
            ADI_RECEIVABLE_CONTRACT,
            UTILITY_RECEIVABLE_ABI,
            this.adiWallet
        );

        console.log("Relay initialized");
        console.log("Hedera contract:", HEDERA_PAYMENT_CONTRACT);
        console.log("ADI contract:", ADI_RECEIVABLE_CONTRACT);
        console.log("Relayer address:", this.adiWallet.address);
    }

    /**
     * Start the relay service
     */
    async start() {
        console.log("\n=== Starting Hedera -> ADI Relay ===\n");

        try {
            // Verify contract deployment
            const owner = await this.adiContract.owner();
            const relayer = await this.adiContract.relayer();
            const adiPrice = await this.adiContract.ADI_PRICE_USD();
            const totalReceivables = await this.adiContract.totalReceivables();

            console.log("Contract verification:");
            console.log("  Owner:", owner);
            console.log("  Relayer:", relayer);
            console.log("  ADI Price:", ethers.formatUnits(adiPrice, 6), "USD");
            console.log("  Total Receivables:", totalReceivables.toString());

            if (relayer.toLowerCase() !== this.adiWallet.address.toLowerCase()) {
                console.warn("\nWARNING: Your address is not set as relayer!");
                console.warn(`Expected: ${this.adiWallet.address}`);
                console.warn(`Actual: ${relayer}`);
            }

        } catch (error) {
            console.error("Failed to verify contract:", error);
            throw error;
        }

        // Get starting block
        this.lastProcessedBlock = await this.hederaProvider.getBlockNumber();
        console.log(`\nStarting from block: ${this.lastProcessedBlock}\n`);

        // Start polling loop
        this.pollEvents();
    }

    /**
     * Poll for new events
     */
    private async pollEvents() {
        while (true) {
            try {
                const currentBlock = await this.hederaProvider.getBlockNumber();

                if (currentBlock > this.lastProcessedBlock) {
                    console.log(`\nChecking blocks ${this.lastProcessedBlock + 1} to ${currentBlock}...`);

                    // Query events in range
                    await this.processSettlementExecutedEvents(this.lastProcessedBlock + 1, currentBlock);
                    await this.processSettlementFailedEvents(this.lastProcessedBlock + 1, currentBlock);

                    this.lastProcessedBlock = currentBlock;
                }

                // Wait before next poll
                await this.sleep(POLL_INTERVAL);

            } catch (error) {
                console.error("Error in polling loop:", error);
                await this.sleep(POLL_INTERVAL);
            }
        }
    }

    /**
     * Process SettlementExecuted events -> Mint PAID receivables
     */
    private async processSettlementExecutedEvents(fromBlock: number, toBlock: number) {
        const filter = this.hederaContract.filters.SettlementExecuted();
        const events = await this.hederaContract.queryFilter(filter, fromBlock, toBlock);

        if (events.length === 0) return;

        console.log(`\nFound ${events.length} SettlementExecuted event(s)`);

        for (const event of events) {
            try {
                if (!('args' in event)) continue;
                const parsed = event.args as any;

                const settlementEvent: SettlementExecutedEvent = {
                    scheduleId: parsed.scheduleId,
                    customer: parsed.customer,
                    provider: parsed.provider,
                    amount: parsed.amount,
                    timestamp: parsed.timestamp,
                    transactionHash: event.transactionHash,
                    blockNumber: event.blockNumber
                };

                await this.mintPaidReceivable(settlementEvent);

            } catch (error) {
                console.error(`Error processing SettlementExecuted event:`, error);
            }
        }
    }

    /**
     * Process SettlementFailed events -> Mint OUTSTANDING receivables
     */
    private async processSettlementFailedEvents(fromBlock: number, toBlock: number) {
        const filter = this.hederaContract.filters.SettlementFailed();
        const events = await this.hederaContract.queryFilter(filter, fromBlock, toBlock);

        if (events.length === 0) return;

        console.log(`\nFound ${events.length} SettlementFailed event(s)`);

        for (const event of events) {
            try {
                if (!('args' in event)) continue;
                const parsed = event.args as any;

                const settlementEvent: SettlementFailedEvent = {
                    scheduleId: parsed.scheduleId,
                    customer: parsed.customer,
                    scheduledAmount: parsed.scheduledAmount,
                    reason: parsed.reason,
                    transactionHash: event.transactionHash,
                    blockNumber: event.blockNumber
                };

                await this.mintOutstandingReceivable(settlementEvent);

            } catch (error) {
                console.error(`Error processing SettlementFailed event:`, error);
            }
        }
    }

    /**
     * Mint PAID receivable on ADI
     */
    private async mintPaidReceivable(event: SettlementExecutedEvent) {
        console.log(`\n--- Processing PAID Receivable ---`);
        console.log(`Customer: ${event.customer}`);
        console.log(`Provider: ${event.provider}`);
        console.log(`Amount: ${ethers.formatUnits(event.amount, 6)} USD`);
        console.log(`Hedera TX: ${event.transactionHash}`);

        const hederaTxHash = ethers.keccak256(ethers.toUtf8Bytes(event.transactionHash));

        // Check if already processed
        const processed = await this.adiContract.processedHederaTx(hederaTxHash);
        if (processed) {
            console.log(`Already processed, skipping`);
            return;
        }

        try {
            // Mint as PAID
            const tx = await this.adiContract.mintReceivable(
                event.provider,      // utilityProvider
                event.customer,      // customer
                event.amount,        // amountUSD (6 decimals)
                event.timestamp + BigInt(30 * 24 * 3600), // dueDate (30 days from settlement)
                ReceivableStatus.PAID,  // status
                hederaTxHash         // hederaTxHash
            );

            console.log(`Minting TX sent: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`Minted PAID receivable at block ${receipt.blockNumber}`);

            // Find the token ID from events
            const mintEvent = receipt.logs.find((log: any) => {
                try {
                    const parsed = this.adiContract.interface.parseLog(log);
                    return parsed?.name === "ReceivableMinted";
                } catch {
                    return false;
                }
            });

            if (mintEvent) {
                const parsed = this.adiContract.interface.parseLog(mintEvent);
                console.log(`Token ID: ${parsed?.args.tokenId}`);
                console.log(`ADI Amount: ${ethers.formatEther(parsed?.args.amountADI)} ADI`);
            }

            // Log updated totals
            const totalPaid = await this.adiContract.totalPaid();
            const totalReceivables = await this.adiContract.totalReceivables();
            console.log(`Total Receivables: ${totalReceivables}`);
            console.log(`Total Paid: ${ethers.formatEther(totalPaid)} ADI`);

        } catch (error: any) {
            console.error(`Failed to mint PAID receivable:`, error.message);
        }
    }

    /**
     * Mint OUTSTANDING receivable on ADI
     */
    private async mintOutstandingReceivable(event: SettlementFailedEvent) {
        console.log(`\n--- Processing OUTSTANDING Receivable ---`);
        console.log(`Customer: ${event.customer}`);
        console.log(`Amount: ${ethers.formatUnits(event.scheduledAmount, 6)} USD`);
        console.log(`Reason: ${event.reason}`);
        console.log(`Hedera TX: ${event.transactionHash}`);

        const hederaTxHash = ethers.keccak256(ethers.toUtf8Bytes(event.transactionHash));

        // Check if already processed
        const processed = await this.adiContract.processedHederaTx(hederaTxHash);
        if (processed) {
            console.log(`Already processed, skipping`);
            return;
        }

        // Extract provider from scheduleId or use a default
        // In production, you'd have a mapping or extract from event data
        const provider = process.env.DEFAULT_UTILITY_PROVIDER || event.customer;

        try {
            const currentTime = BigInt(Math.floor(Date.now() / 1000));

            // Mint as OUTSTANDING
            const tx = await this.adiContract.mintReceivable(
                provider,            // utilityProvider
                event.customer,      // customer
                event.scheduledAmount, // amountUSD (6 decimals)
                currentTime + BigInt(30 * 24 * 3600), // dueDate (30 days from now)
                ReceivableStatus.OUTSTANDING, // status
                hederaTxHash         // hederaTxHash
            );

            console.log(`Minting TX sent: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`Minted OUTSTANDING receivable at block ${receipt.blockNumber}`);

            // Find the token ID from events
            const mintEvent = receipt.logs.find((log: any) => {
                try {
                    const parsed = this.adiContract.interface.parseLog(log);
                    return parsed?.name === "ReceivableMinted";
                } catch {
                    return false;
                }
            });

            if (mintEvent) {
                const parsed = this.adiContract.interface.parseLog(mintEvent);
                console.log(`Token ID: ${parsed?.args.tokenId}`);
                console.log(`ADI Amount: ${ethers.formatEther(parsed?.args.amountADI)} ADI`);
            }

            // Log updated totals
            const totalOutstanding = await this.adiContract.totalOutstanding();
            const totalReceivables = await this.adiContract.totalReceivables();
            console.log(`Total Receivables: ${totalReceivables}`);
            console.log(`Total Outstanding: ${ethers.formatEther(totalOutstanding)} ADI`);

        } catch (error: any) {
            console.error(`Failed to mint OUTSTANDING receivable:`, error.message);
        }
    }

    /**
     * Utility sleep function
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============ Entry Point ============

async function main() {
    try {
        const relay = new HederaToADIRelay();
        await relay.start();
    } catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}

export { HederaToADIRelay };
