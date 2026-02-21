const { ethers } = require('ethers');

// Calculate event signature hashes
const events = [
  "SettlementExecuted(uint256,uint256,uint256,uint256,uint256,uint256)",
  "SettlementScheduled(uint256,uint256,uint256,address)",
  "UsageReported(uint256,uint256,uint256,uint256,uint256)",
  "PricingUpdated(uint256,uint256,uint256,uint256)",
  "StreamCreated(uint256,address,address,uint256,uint256)",
  "SettlementFailed(uint256,string,uint256,uint256)"
];

console.log("Event Signature Hashes:\n");
for (const sig of events) {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(sig));
  console.log(sig);
  console.log("  ", hash);
  console.log();
}

console.log("\n\nYour transaction had:");
console.log("Topic 0 Event 1:", "0xb8a21d4673df42e3b2f67ef580a86f3f5fd56e8515c41c3b9438f3cffd89db02");
console.log("Topic 0 Event 2:", "0x10391582be13a09a314521d7735c10a4c30864aa5ae7191a62b6d443d723fd38");
