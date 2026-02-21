const { ethers } = require('ethers');

async function checkBalance() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const contractAddress = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
  
  const balance = await provider.getBalance(contractAddress);
  
  console.log("ElectricityPaymentStream Contract Balance:");
  console.log("  Address:", contractAddress);
  console.log("  Balance:", ethers.formatEther(balance), "HBAR");
  console.log();
  
  if (balance === 0n) {
    console.log("⚠️  CONTRACT HAS NO HBAR!");
    console.log("    Schedule Service needs HBAR to pay for gas when executing settle()");
    console.log("    Contract must be funded for automated settlements to work");
  } else if (balance < ethers.parseEther("10")) {
    console.log("⚠️  Low balance - might run out soon");
  } else {
    console.log("✓ Balance looks OK for scheduled transactions");
  }
}

checkBalance();
