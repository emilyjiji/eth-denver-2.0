/**
 * @file topUpAndSettle.ts
 * @notice Fund customer's deposit then trigger settlement to create PAID receivable
 *
 * Usage: STREAM_ID=2 npm run top-up-settle
 */

import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Top Up Customer & Trigger Settlement ===\n");

  const streamAddress = process.env.HEDERA_STREAM_ADDRESS!;
  const streamId = process.env.STREAM_ID || "2";

  const [signer] = await ethers.getSigners();
  const contract = await ethers.getContractAt("ElectricityPaymentStream", streamAddress, signer);

  // Get stream info
  const stream = await contract.streams(streamId);

  console.log(`Stream ${streamId}:`);
  console.log("  Customer:", stream.payer);
  console.log("  Current Deposit:", ethers.formatEther(stream.depositBalance), "HBAR");
  console.log("  Accrued (owed):", ethers.formatEther(stream.accruedAmount), "HBAR");
  console.log();

  // Calculate how much to add
  const needed = stream.accruedAmount - stream.depositBalance;

  if (needed <= 0n) {
    console.log("✓ Customer already has enough balance!");
  } else {
    console.log("💰 Customer needs:", ethers.formatEther(needed), "HBAR more");
    console.log("   Adding 1 HBAR to be safe...\n");

    // Top up (anyone can top up!)
    const topUpTx = await contract.topUpDeposit(streamId, {
      value: ethers.parseEther("1")
    });

    console.log("  Top-up TX sent:", topUpTx.hash);
    await topUpTx.wait();
    console.log("  ✓ Customer deposit increased!\n");
  }

  // Now trigger settlement
  console.log("Triggering settlement...");

  const settleTx = await contract.settle(streamId);
  console.log("  TX sent:", settleTx.hash);

  const receipt = await settleTx.wait();
  console.log("  ✓ Confirmed in block:", receipt.blockNumber);

  // Check events
  console.log("\nEvents emitted:");
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed) {
        console.log("  -", parsed.name);

        if (parsed.name === "SettlementExecuted") {
          console.log("    ✅ SUCCESS! Customer paid!");
          console.log("    Amount:", ethers.formatEther(parsed.args.amountPaid), "HBAR");
          console.log("    → Your relay will mint PAID receivable on ADI");
        }
      }
    } catch {}
  }

  console.log("\n=== Complete ===");
  console.log("HashScan:", `https://hashscan.io/testnet/transaction/${settleTx.hash}`);
  console.log("\nCheck relay - should mint PAID receivable!");
}

main().catch(console.error);
