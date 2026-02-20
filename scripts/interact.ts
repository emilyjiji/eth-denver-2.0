/**
 * Create a stream, push an oracle usage report, and print HashScan links.
 * Usage: npx hardhat run scripts/interact.ts --network hederaTestnet
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const deployment = JSON.parse(fs.readFileSync("scripts/deployment.json", "utf8"));
  const { oracleAddr, epsAddr } = deployment;

  const [deployer] = await ethers.getSigners();
  const oracleSigner = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY!, ethers.provider);

  console.log("=== Interacting with Hedera Testnet ===");
  console.log("Deployer (payer):  ", deployer.address);
  console.log("Oracle signer:     ", oracleSigner.address);
  console.log("MockElectricityOracle:", oracleAddr);
  console.log("ElectricityPaymentStream:", epsAddr);

  const eps = await ethers.getContractAt("ElectricityPaymentStream", epsAddr, deployer);
  const oracle = await ethers.getContractAt("MockElectricityOracle", oracleAddr, deployer);

  // ── Step 1: Push a reading to the oracle so it has data ──────────────
  console.log("\n[1] Pushing initial kWh reading to MockElectricityOracle...");
  const tx0 = await oracle.updateReading(1000n, 1000n); // cumulative 1.000 kWh, hourly 1.000 kWh
  const r0 = await tx0.wait();
  console.log("    tx:", r0?.hash);
  console.log("    HashScan: https://hashscan.io/testnet/transaction/" + r0?.hash);

  // ── Step 2: Create a stream ───────────────────────────────────────────
  console.log("\n[2] Creating payment stream...");
  const payee            = deployer.address; // send to self for demo
  const baseRatePerUnit  = 150_000_000_000_000n; // 0.15 HBAR per kWh-unit (STANDARD)
  const maxPayPerInterval = ethers.parseEther("5");   // cap 5 HBAR per settlement
  const intervalSecs     = 3600n;                      // 1 hour
  const deposit          = ethers.parseEther("10");    // 10 HBAR deposit

  const tx1 = await eps.createStream(
    payee,
    baseRatePerUnit,
    maxPayPerInterval,
    intervalSecs,
    oracleSigner.address, // authorized oracle signer
    deployer.address,      // schedulePayer
    false,                 // usePayerScheduling
    { value: deposit },
  );
  const r1 = await tx1.wait();
  console.log("    tx:", r1?.hash);
  console.log("    HashScan: https://hashscan.io/testnet/transaction/" + r1?.hash);

  // Parse the StreamCreated event to get streamId
  const iface = eps.interface;
  let streamId = 0n;
  for (const log of r1?.logs ?? []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "StreamCreated") {
        streamId = parsed.args[0];
        console.log("    Stream ID:", streamId.toString());
      }
    } catch { /* non-EPS log */ }
  }

  // ── Step 3: Oracle signs + reports usage ─────────────────────────────
  console.log("\n[3] Oracle reporting usage...");
  const newTotalUsage    = 1_500n;          // 1.500 kWh (delta = 1.500 kWh)
  const baseRate         = 150_000_000_000_000n;
  const congestionFactor = 13_000n;         // 1.3× (moderate congestion)
  const timestamp        = BigInt(Math.floor(Date.now() / 1000));
  const nonce            = 1n;              // first report

  const hash = ethers.solidityPackedKeccak256(
    ["uint256","uint256","uint256","uint256","uint256","uint256"],
    [streamId, newTotalUsage, baseRate, congestionFactor, timestamp, nonce],
  );
  const signature = await oracleSigner.signMessage(ethers.getBytes(hash));

  const tx2 = await eps.reportUsageWithPricing(
    streamId,
    newTotalUsage,
    timestamp,
    nonce,
    baseRate,
    congestionFactor,
    signature,
  );
  const r2 = await tx2.wait();
  console.log("    tx:", r2?.hash);
  console.log("    HashScan: https://hashscan.io/testnet/transaction/" + r2?.hash);

  // Parse UsageReported event
  for (const log of r2?.logs ?? []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "UsageReported") {
        const [sid, delta, cost] = parsed.args;
        console.log("    UsageReported → delta:", delta.toString(), "units | cost:", ethers.formatEther(cost), "HBAR");
      }
    } catch { /* skip */ }
  }

  // ── Step 4: Read contract state ───────────────────────────────────────
  console.log("\n[4] Reading stream state...");
  const info = await eps.getStreamInfo(streamId);
  console.log("    payer:             ", info[0]);
  console.log("    payee:             ", info[1]);
  console.log("    active:            ", info[2]);
  console.log("    depositBalance:    ", ethers.formatEther(info[3]), "HBAR");
  console.log("    accruedAmount:     ", ethers.formatEther(info[4]), "HBAR");
  console.log("    totalUsageUnits:   ", info[5].toString(), "(×0.001 kWh)");
  console.log("    lastSettlementTime:", new Date(Number(info[6]) * 1000).toISOString());
  console.log("    nextSettlementTime:", new Date(Number(info[7]) * 1000).toISOString());
  console.log("    settlementCount:   ", info[8].toString());

  console.log("\n=== Summary Links ===");
  console.log("MockElectricityOracle: https://hashscan.io/testnet/contract/" + oracleAddr);
  console.log("ElectricityPaymentStream: https://hashscan.io/testnet/contract/" + epsAddr);
}

main().catch((err) => { console.error(err); process.exit(1); });
