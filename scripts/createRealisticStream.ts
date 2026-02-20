/**
 * Creates a new stream with realistic electricity rates and a large deposit.
 *
 * Rate context (HBAR ≈ $0.07, US avg ~$0.17/kWh per EIA Feb 2026):
 *   baseRatePerUnit = 200 000 tinybar/unit (STANDARD ≈ $0.14/kWh)
 *   maxPayPerInterval = 20 HBAR (~$1.40 cap per 15-min settlement)
 *   deposit = 200 HBAR (~$14) → covers ~66 settlement periods (~16 hours)
 *
 * Funded from the oracle wallet (1 000+ HBAR on testnet).
 *
 * Run:
 *   npx hardhat run scripts/createRealisticStream.ts --network hederaTestnet
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const oracleSigner = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY!, ethers.provider);
  const deployment   = JSON.parse(fs.readFileSync("scripts/deployment.json", "utf8"));
  const eps = await ethers.getContractAt("ElectricityPaymentStream", deployment.epsAddr, oracleSigner);

  console.log("Oracle (payer):", oracleSigner.address);
  console.log("Oracle balance:", ethers.formatEther(await ethers.provider.getBalance(oracleSigner.address)), "HBAR");
  console.log("Contract:      ", deployment.epsAddr);
  console.log("");
  console.log("Creating stream:");
  console.log("  baseRatePerUnit    = 200 000 tinybar/unit (~$0.14/kWh at HBAR $0.07)");
  console.log("  maxPayPerInterval  = 20 HBAR per settlement");
  console.log("  settlementInterval = 15 minutes (900 s)");
  console.log("  deposit            = 200 HBAR (~16 hours of coverage)");
  console.log("");

  const tx = await eps.createStream(
    oracleSigner.address,       // payee  (pays back to self for demo)
    200_000n,                   // baseRatePerUnit — STANDARD tier, realistic scale
    ethers.parseEther("20"),    // maxPayPerInterval — 20 HBAR cap per settlement
    900n,                       // settlementIntervalSecs — 15 minutes
    oracleSigner.address,       // authorizedOracle
    oracleSigner.address,       // schedulePayer
    false,
    { value: ethers.parseEther("200") }, // 200 HBAR deposit
  );
  const receipt = await tx.wait();
  console.log("Tx hash :", receipt?.hash);
  console.log("HashScan:", "https://hashscan.io/testnet/transaction/" + receipt?.hash);

  let streamId = "unknown";
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = eps.interface.parseLog(log);
      if (parsed?.name === "StreamCreated") streamId = parsed.args[0].toString();
    } catch { /* skip */ }
  }
  console.log("\nNew stream ID:", streamId);

  const info = await eps.getStreamInfo(BigInt(streamId));
  console.log("Active:          ", info[2]);
  console.log("Deposit:         ", (Number(info[3]) / 1e8).toFixed(2), "HBAR");
  console.log("Next settlement: ", new Date(Number(info[7]) * 1000).toISOString());

  const updated = { ...deployment, activeStreamId: streamId };
  fs.writeFileSync("scripts/deployment.json", JSON.stringify(updated, null, 2));
  console.log("\nSaved activeStreamId →", streamId, "to scripts/deployment.json");
  console.log("\n⚠️  Also update STREAM_ID in:");
  console.log("  frontend/my-app/src/hooks/useOnChainUsage.js");
  console.log("  frontend/my-app/src/hooks/useHederaContract.js");
}

main().catch((err) => { console.error(err); process.exit(1); });
