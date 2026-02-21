const { ethers } = require('ethers');
require('dotenv').config();

async function checkTx() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  
  const txHash = '0x91982ea138931a7bb6bcda1304963...'; // Your tx hash
  const receipt = await provider.getTransactionReceipt(txHash);
  
  console.log('Transaction details:');
  console.log('  Block:', receipt.blockNumber);
  console.log('  To:', receipt.to);
  console.log('  Logs (events):', receipt.logs.length);
  
  // Check what function was called
  const tx = await provider.getTransaction(txHash);
  console.log('  Function selector:', tx.data.slice(0, 10));
  
  // Decode events
  const streamAbi = [
    "event UsageReported(...)",
    "event SettlementExecuted(...)",
    "event SettlementFailed(...)"
  ];
  
  const iface = new ethers.Interface(streamAbi);
  
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      console.log('  Event found:', parsed.name);
    } catch {}
  }
}

checkTx();
