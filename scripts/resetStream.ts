/**
 * Creates a fresh stream with a healthy deposit.
 * Run: npx hardhat run scripts/resetStream.ts --network hederaTestnet
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
  console.log("Deployer balance:", ethers.formatEther(balance), "HBAR");

  // ── Create fresh stream ──────────────────────────────────────────────────
  console.log("\nCreating fresh stream (1 hr interval, 30 HBAR deposit)...");
  const tx = await eps.createStream(
    deployer.address,             // payee  (self for demo)
    150_000_000_000_000n,         // baseRatePerUnit — STANDARD tier
    ethers.parseEther("5"),       // maxPayPerInterval — 5 HBAR cap per settle
    3600n,                        // intervalSecs — 1 hour
    oracleSigner.address,         // authorizedOracle
    deployer.address,             // schedulePayer
    false,
    { value: ethers.parseEther("30") },  // 30 HBAR deposit
  );
  const receipt = await tx.wait();
  console.log("tx:", receipt?.hash);
  console.log("HashScan: https://hashscan.io/testnet/transaction/" + receipt?.hash);

  // ── Parse new stream ID ─────────────────────────────────────────────────
  let streamId = "unknown";
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = eps.interface.parseLog(log);
      if (parsed?.name === "StreamCreated") streamId = parsed.args[0].toString();
    } catch { /* skip */ }
  }
  console.log("\nNew stream ID:", streamId);

  // ── Read stream state ───────────────────────────────────────────────────
  const info = await eps.getStreamInfo(BigInt(streamId));
  console.log("depositBalance:    ", ethers.formatEther(info[3]), "HBAR");
  console.log("nextSettlementTime:", new Date(Number(info[7]) * 1000).toISOString());

  // ── Persist for other scripts ───────────────────────────────────────────
  const updated = { ...deployment, activeStreamId: streamId };
  fs.writeFileSync("scripts/deployment.json", JSON.stringify(updated, null, 2));
  console.log("\nSaved activeStreamId →", streamId, "to scripts/deployment.json");

  console.log("\n=== Contract ===");
  console.log("https://hashscan.io/testnet/contract/" + deployment.epsAddr);
}

main().catch((err) => { console.error(err); process.exit(1); });
