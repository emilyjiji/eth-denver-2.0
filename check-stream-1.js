const { ethers } = require('ethers');

async function check() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const contract = new ethers.Contract(
    '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692',
    ["function streams(uint256) external view returns (tuple(uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce))"],
    provider
  );
  
  const stream = await contract.streams(1);
  
  console.log("Stream 1:");
  console.log("  Customer:", stream.payer);
  console.log("  Deposit:", ethers.formatEther(stream.depositBalance), "HBAR");
  console.log("  Accrued:", ethers.formatEther(stream.accruedAmount), "HBAR");
  console.log("  Rate:", ethers.formatEther(stream.baseRatePerUnit), "HBAR/unit");
  console.log("  Total Usage:", Number(stream.totalUsageUnits) / 1000, "kWh");
  console.log("  Active:", stream.active);
  
  const accruedUSD = Number(ethers.formatEther(stream.accruedAmount)) * 0.05;
  console.log("  Accrued USD: $" + accruedUSD.toFixed(6));
  
  if (accruedUSD >= 0.01) {
    console.log("  ✅ Good amount for testing!");
  } else {
    console.log("  ⚠️  Too small (will round to $0.00)");
  }
}

check();
