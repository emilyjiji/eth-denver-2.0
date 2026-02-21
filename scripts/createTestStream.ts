/**
 * Create a test stream with SHORT interval for fast testing
 * Usage: npm run create-stream
 */

import { ethers } from "hardhat";

async function main() {
  const streamAddress = process.env.HEDERA_STREAM_ADDRESS!;
  const [signer] = await ethers.getSigners();

  console.log("Creating test stream...");
  console.log("  Customer (you):", signer.address);

  const contract = await ethers.getContractAt("ElectricityPaymentStream", streamAddress, signer);

  // Create stream with YOU as customer
  const tx = await contract.createStream(
    signer.address,                  // payee: you (utility)
    ethers.parseEther("0.00015"),    // baseRatePerUnit: same as stream 0
    ethers.parseEther("100"),        // maxPayPerInterval: 100 HBAR max
    300,                              // intervalSecs: 5 MINUTES!
    signer.address,                  // oracle: you (or use teammate's oracle)
    streamAddress,                   // schedulePayer: contract
    false,                           // usePayerScheduling: false
    { value: ethers.parseEther("10") }  // deposit: 10 HBAR
  );

  console.log("  TX sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("  ✓ Stream created!");

  // Find StreamCreated event to get ID
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "StreamCreated") {
        const streamId = parsed.args.streamId;
        console.log("\n✅ Stream ID:", streamId.toString());
        console.log("   Settlement Interval: 5 minutes");
        console.log("   YOU are the customer (can top up!)");
        console.log("\nAdd to .env:");
        console.log(`STREAM_IDS=${streamId}`);
      }
    } catch {}
  }
}

main().catch(console.error);
