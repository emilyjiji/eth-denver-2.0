/**
 * Deploy MockElectricityOracle and ElectricityPaymentStream to Hedera testnet.
 * Usage: npx hardhat run scripts/deploy.ts --network hederaTestnet
 */
import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=== Deploying to Hedera Testnet ===");
  console.log("Deployer:", deployer.address);
  console.log("Balance: ", ethers.formatEther(balance), "HBAR");

  if (balance === 0n) {
    throw new Error("Deployer has no HBAR. Fund it at https://portal.hedera.com");
  }

  // 1. Deploy MockElectricityOracle
  console.log("\n[1/2] Deploying MockElectricityOracle...");
  const Oracle = await ethers.getContractFactory("MockElectricityOracle");
  const oracle = await Oracle.deploy(deployer.address); // operator = deployer
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log("      MockElectricityOracle:", oracleAddr);
  console.log("      HashScan: https://hashscan.io/testnet/contract/" + oracleAddr);

  // 2. Deploy ElectricityPaymentStream
  console.log("\n[2/2] Deploying ElectricityPaymentStream...");
  const EPS = await ethers.getContractFactory("ElectricityPaymentStream");
  const eps = await EPS.deploy();
  await eps.waitForDeployment();
  const epsAddr = await eps.getAddress();
  console.log("      ElectricityPaymentStream:", epsAddr);
  console.log("      HashScan: https://hashscan.io/testnet/contract/" + epsAddr);

  // 3. Save addresses for the interact script
  const deployment = { oracleAddr, epsAddr, deployedAt: new Date().toISOString() };
  fs.writeFileSync("scripts/deployment.json", JSON.stringify(deployment, null, 2));
  console.log("\n=== Addresses saved to scripts/deployment.json ===");
}

main().catch((err) => { console.error(err); process.exit(1); });
