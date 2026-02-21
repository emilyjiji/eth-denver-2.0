const { ethers } = require('ethers');
require('dotenv').config();

async function checkEvents() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const streamAddress = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
  
  const abi = [
    "event SettlementExecuted(uint256 indexed streamId, uint256 timestamp, uint256 count, uint256 amountPaid, uint256 remainingDeposit, uint256 remainingAccrued)",
    "event SettlementFailed(uint256 indexed streamId, string reason, uint256 needed, uint256 available)"
  ];
  
  const contract = new ethers.Contract(streamAddress, abi, provider);
  
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = currentBlock - 50000; // Last ~50k blocks (several hours)
  
  console.log("Searching for settlement events...");
  console.log("From block:", fromBlock);
  console.log("To block:", currentBlock);
  console.log();
  
  // Check SettlementExecuted
  const executedFilter = contract.filters.SettlementExecuted();
  const executedEvents = await contract.queryFilter(executedFilter, fromBlock, currentBlock);
  console.log("SettlementExecuted events:", executedEvents.length);
  
  // Check SettlementFailed
  const failedFilter = contract.filters.SettlementFailed();
  const failedEvents = await contract.queryFilter(failedFilter, fromBlock, currentBlock);
  console.log("SettlementFailed events:", failedEvents.length);
  
  if (failedEvents.length > 0) {
    console.log("\n--- SettlementFailed Events ---");
    for (const event of failedEvents) {
      console.log("\nBlock:", event.blockNumber);
      console.log("  Stream ID:", event.args[0].toString());
      console.log("  Reason:", event.args[1]);
      console.log("  Needed:", ethers.formatEther(event.args[2]), "HBAR");
      console.log("  Available:", ethers.formatEther(event.args[3]), "HBAR");
    }
  }
}

checkEvents();
