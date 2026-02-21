/**
 * @file manualSettle.ts
 * @notice Manually trigger a settlement on Hedera (for testing when Schedule Service isn't executing)
 *
 * Usage: npx hardhat run scripts/manualSettle.ts --network hederaTestnet
 */

import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Manually Triggering Hedera Settlement ===\n");

  const streamAddress = process.env.HEDERA_STREAM_ADDRESS;
  if (!streamAddress) {
    console.error("Error: HEDERA_STREAM_ADDRESS not set in .env");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  console.log("Triggering with account:", signer.address);

  // Get contract
  const streamContract = await ethers.getContractAt(
    "ElectricityPaymentStream",
    streamAddress,
    signer
  );

  // Ask which stream to settle
  const streamId = process.env.STREAM_ID || "0";
  console.log("Stream ID:", streamId);

  // Get stream info first
  const stream = await streamContract.streams(streamId);

  console.log("\nStream Info:");
  console.log("  Active:", stream.active);
  console.log("  Deposit:", ethers.formatEther(stream.depositBalance), "HBAR");
  console.log("  Accrued:", ethers.formatEther(stream.accruedAmount), "HBAR");
  console.log("  Interval:", Number(stream.settlementIntervalSecs) / 60, "minutes");
  console.log("  Last Settlement:", new Date(Number(stream.lastSettlementTime) * 1000).toLocaleString());
  console.log("  Settlement Count:", stream.settlementCount.toString());

  // Check if customer can pay
  const canPay = stream.depositBalance >= stream.accruedAmount;

  console.log("\nExpected outcome:");
  if (canPay) {
    console.log("  ✓ Customer has balance → SettlementExecuted (PAID receivable)");
  } else {
    console.log("  ⚠️  Customer lacks balance → SettlementFailed (OUTSTANDING receivable)");
    console.log("     Needed:", ethers.formatEther(stream.accruedAmount), "HBAR");
    console.log("     Has:", ethers.formatEther(stream.depositBalance), "HBAR");
  }

  // Confirm
  console.log("\nCalling settle()...");

  try {
    const tx = await streamContract.settle(streamId);
    console.log("  TX sent:", tx.hash);
    console.log("  Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("  ✓ Confirmed in block:", receipt.blockNumber);

    // Check events
    console.log("\nEvents emitted:");
    for (const log of receipt.logs) {
      try {
        const parsed = streamContract.interface.parseLog(log);
        if (parsed) {
          console.log("  -", parsed.name);

          if (parsed.name === "SettlementExecuted") {
            console.log("    Stream ID:", parsed.args.streamId.toString());
            console.log("    Amount Paid:", ethers.formatEther(parsed.args.amountPaid), "HBAR");
            console.log("    ✅ Your relay should catch this and mint PAID receivable on ADI!");
          }

          if (parsed.name === "SettlementFailed") {
            console.log("    Stream ID:", parsed.args.streamId.toString());
            console.log("    Reason:", parsed.args.reason);
            console.log("    Needed:", ethers.formatEther(parsed.args.needed), "HBAR");
            console.log("    ✅ Your relay should catch this and mint OUTSTANDING receivable on ADI!");
          }
        }
      } catch {}
    }

    console.log("\n=== Settlement Complete ===");
    console.log("View on HashScan:");
    console.log(`https://hashscan.io/testnet/transaction/${tx.hash}`);
    console.log("\nCheck your relay terminal - it should process this event!");

  } catch (error: any) {
    console.error("\n✗ Settlement failed:", error.message);

    if (error.message.includes("TooEarlyToSettle")) {
      console.log("\nℹ️  Too early - must wait for settlement interval to pass");
      const earliest = Number(stream.lastSettlementTime) + Number(stream.settlementIntervalSecs);
      console.log("   Earliest:", new Date(earliest * 1000).toLocaleString());
    } else if (error.message.includes("StreamNotActive")) {
      console.log("\nℹ️  Stream is paused (probably ran out of balance earlier)");
      console.log("   Customer needs to topUpDeposit() to resume");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
