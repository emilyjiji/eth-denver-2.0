/**
 * Creates a fresh stream with a 15-minute settlement interval.
 *
 * What this does:
 *   1. Calls createStream() on ElectricityPaymentStream with:
 *        - settlementIntervalSecs = 900  (15 minutes)
 *        - baseRatePerUnit = 150         (tinybar per kWh-unit, STANDARD tier)
 *        - deposit = 30 HBAR
 *   2. The contract immediately schedules the first settle() call via
 *      the Hedera Schedule Service (HSS) precompile, set to fire in 15 min.
 *   3. Saves the new stream ID to scripts/deployment.json.
 *
 * Run:
 *   npx hardhat run scripts/resetStream15min.ts --network hederaTestnet
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const [deployer]   = await ethers.getSigners();
  const oracleSigner = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY!, ethers.provider);
  const deployment   = JSON.parse(fs.readFileSync("scripts/deployment.json", "utf8"));
  const eps = await ethers.getContractAt("ElectricityPaymentStream", deployment.epsAddr, deployer);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance: ", ethers.formatEther(balance), "HBAR");
  console.log("Contract:", deployment.epsAddr);
  console.log("");

  console.log("Creating stream with 15-min settlement interval and 30 HBAR deposit...");
  const tx = await eps.createStream(
    deployer.address,        // payee  (pays back to self for demo)
    150n,                    // baseRatePerUnit — 150 tinybar/unit (STANDARD, tinybar scale)
    ethers.parseEther("5"),  // maxPayPerInterval — effectively uncapped vs accrued amounts
    900n,                    // settlementIntervalSecs — 15 minutes
    oracleSigner.address,    // authorizedOracle
    deployer.address,        // schedulePayer (who pays the HSS scheduling fee)
    false,
    { value: ethers.parseEther("30") }, // 30 HBAR deposit
  );
  const receipt = await tx.wait();
  console.log("Tx hash :", receipt?.hash);
  console.log("HashScan:", "https://hashscan.io/testnet/transaction/" + receipt?.hash);

  // Parse stream ID from StreamCreated event
  let streamId = "unknown";
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = eps.interface.parseLog(log);
      if (parsed?.name === "StreamCreated") streamId = parsed.args[0].toString();
    } catch { /* skip non-matching logs */ }
  }
  console.log("\nNew stream ID:", streamId);

  // Read back the stream state
  const info = await eps.getStreamInfo(BigInt(streamId));
  console.log("Active         :", info[2]);
  console.log("Deposit        :", ethers.formatEther(info[3]), "HBAR (displayed — actual stored in tinybar)");
  console.log("Next settlement:", new Date(Number(info[7]) * 1000).toISOString());

  // Persist
  const updated = { ...deployment, activeStreamId: streamId };
  fs.writeFileSync("scripts/deployment.json", JSON.stringify(updated, null, 2));
  console.log("\nSaved activeStreamId →", streamId, "to scripts/deployment.json");

  console.log("\n=== Links ===");
  console.log("Contract: https://hashscan.io/testnet/contract/" + deployment.epsAddr);
}

main().catch((err) => { console.error(err); process.exit(1); });
