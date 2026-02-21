const { ethers } = require('ethers');

async function checkScheduledEvents() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const contractAddress = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
  
  const abi = [
    "event SettlementScheduled(uint256 indexed streamId, uint256 scheduledTime, uint256 desiredTime, address scheduleAddress)"
  ];
  
  const contract = new ethers.Contract(contractAddress, abi, provider);
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = currentBlock - 50000;
  
  console.log("Searching for SettlementScheduled events...");
  console.log("Blocks:", fromBlock, "to", currentBlock);
  console.log();
  
  const filter = contract.filters.SettlementScheduled();
  const events = await contract.queryFilter(filter, fromBlock, currentBlock);
  
  console.log("SettlementScheduled events found:", events.length);
  console.log();
  
  if (events.length > 0) {
    for (const event of events.slice(-5)) {  // Last 5
      console.log("Block:", event.blockNumber);
      console.log("  Stream ID:", event.args[0].toString());
      console.log("  Scheduled for:", new Date(Number(event.args[1]) * 1000).toLocaleString());
      console.log("  Schedule Address:", event.args[3]);
      console.log();
    }
  } else {
    console.log("⚠️  NO SettlementScheduled events found!");
    console.log("    This means:");
    console.log("    - createStream() was never called, OR");
    console.log("    - Stream was created before the searched block range, OR");
    console.log("    - Schedules were created but events weren't emitted");
  }
}

checkScheduledEvents();
