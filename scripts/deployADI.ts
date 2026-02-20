import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy UtilityReceivable contract to ADI testnet
 *
 * Usage:
 *   npx hardhat run scripts/deployADI.ts --network adiTestnet
 *
 * This script was used to deploy: 0x2f78CC8Bccc8dfed1544bf5feF4108dA78C6A8fD
 */

async function main() {
    console.log("\n=== Deploying UtilityReceivable to ADI Testnet ===\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    // Get balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ADI");

    if (balance === 0n) {
        console.error("\nError: Insufficient balance. Please fund your account with ADI tokens.");
        console.error("Get testnet ADI from: https://faucet.adi.network");
        process.exit(1);
    }

    console.log("\nDeploying UtilityReceivable...");

    // Deploy contract
    const UtilityReceivable = await ethers.getContractFactory("UtilityReceivable");
    const utilityReceivable = await UtilityReceivable.deploy();

    await utilityReceivable.waitForDeployment();

    const contractAddress = await utilityReceivable.getAddress();

    console.log("\n=== Deployment Successful ===");
    console.log("UtilityReceivable deployed to:", contractAddress);

    // Verify contract state
    console.log("\nVerifying contract state...");
    const owner = await utilityReceivable.owner();
    const relayer = await utilityReceivable.relayer();
    const adiPrice = await utilityReceivable.ADI_PRICE_USD();
    const totalReceivables = await utilityReceivable.totalReceivables();
    const totalOutstanding = await utilityReceivable.totalOutstanding();
    const totalPaid = await utilityReceivable.totalPaid();

    console.log("Owner:", owner);
    console.log("Relayer:", relayer);
    console.log("ADI Price:", ethers.formatUnits(adiPrice, 6), "USD");
    console.log("Total Receivables:", totalReceivables.toString());
    console.log("Total Outstanding:", ethers.formatEther(totalOutstanding), "ADI");
    console.log("Total Paid:", ethers.formatEther(totalPaid), "ADI");

    // Save deployment info
    const deployment = {
        network: "adiTestnet",
        contractName: "UtilityReceivable",
        address: contractAddress,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        blockNumber: await ethers.provider.getBlockNumber(),
        owner: owner,
        relayer: relayer,
        adiPriceUSD: ethers.formatUnits(adiPrice, 6),
        chainId: (await ethers.provider.getNetwork()).chainId.toString(),
        state: {
            totalReceivables: totalReceivables.toString(),
            totalOutstanding: ethers.formatEther(totalOutstanding),
            totalPaid: ethers.formatEther(totalPaid)
        }
    };

    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const deploymentFile = path.join(deploymentsDir, "adi-testnet.json");
    fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

    console.log("\nDeployment info saved to:", deploymentFile);

    // Print usage instructions
    console.log("\n=== Next Steps ===");
    console.log("\n1. Update .env file with:");
    console.log(`   ADI_RECEIVABLE_CONTRACT=${contractAddress}`);
    console.log("\n2. If needed, set a different relayer:");
    console.log(`   await contract.setRelayer("0x...")`);
    console.log("\n3. Start the relay:");
    console.log("   npm run relay");
    console.log("\n4. Run tests:");
    console.log("   npm run test:adi");
    console.log("\n5. Verify on ADI Explorer:");
    console.log(`   https://explorer.ab.testnet.adifoundation.ai/address/${contractAddress}`);

    console.log("\n=== Deployment Complete ===\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\nDeployment failed:", error);
        process.exit(1);
    });
