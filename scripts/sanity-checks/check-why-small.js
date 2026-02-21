const { ethers } = require('ethers');

async function check() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const contract = new ethers.Contract(
    '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692',
    ["function streams(uint256) external view returns (tuple(uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce))"],
    provider
  );

  console.log("Why are settlement amounts so small?\n");

  for (let streamId = 0; streamId < 5; streamId++) {
    try {
      const stream = await contract.streams(streamId);

      console.log(`Stream ${streamId}:`);
      console.log(`  Base Rate: ${ethers.formatEther(stream.baseRatePerUnit)} HBAR per unit`);
      console.log(`  Total Usage: ${Number(stream.totalUsageUnits) / 1000} kWh`);
      console.log(`  Accrued: ${ethers.formatEther(stream.accruedAmount)} HBAR`);
      console.log(`  Settlement Count: ${stream.settlementCount.toString()}`);
      console.log(`  Interval: ${Number(stream.settlementIntervalSecs) / 60} min`);

      const accruedUSD = Number(ethers.formatEther(stream.accruedAmount)) * 0.05;
      console.log(`  Accrued in USD: $${accruedUSD.toFixed(6)}`);

      if (accruedUSD < 0.000001) {
        console.log(`  ⚠️  This will round to $0.00 (too small!)`);
      }

      console.log();
    } catch {
      break;
    }
  }
}

check();
