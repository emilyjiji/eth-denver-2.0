const { ethers } = require('ethers');
require('dotenv').config();

async function checkStream() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const streamAddress = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
  
  const abi = [
    "function streams(uint256) external view returns (tuple(uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce))"
  ];
  
  const contract = new ethers.Contract(streamAddress, abi, provider);
  
  console.log("Checking stream #0...\n");
  
  try {
    const stream = await contract.streams(0);
    
    console.log("Stream Info:");
    console.log("  Payer:", stream.payer);
    console.log("  Payee:", stream.payee);
    console.log("  Active:", stream.active);
    console.log("  Interval:", stream.settlementIntervalSecs.toString(), "sec =", Number(stream.settlementIntervalSecs) / 60, "min");
    console.log("  Last Settlement:", new Date(Number(stream.lastSettlementTime) * 1000).toLocaleString());
    console.log("  Next Settlement:", new Date(Number(stream.nextSettlementTime) * 1000).toLocaleString());
    console.log("  Count:", stream.settlementCount.toString());
    console.log("  Deposit:", ethers.formatEther(stream.depositBalance), "HBAR");
    console.log("  Accrued:", ethers.formatEther(stream.accruedAmount), "HBAR");
    
    const now = Math.floor(Date.now() / 1000);
    const next = Number(stream.nextSettlementTime);
    
    if (next > now) {
      console.log("\n⏰ Next settlement in:", Math.floor((next - now) / 60), "minutes");
    } else if (next > 0) {
      console.log("\n⚠️  OVERDUE by", Math.floor((now - next) / 60), "minutes!");
    } else {
      console.log("\n⚠️  No settlement scheduled!");
    }
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

checkStream();
