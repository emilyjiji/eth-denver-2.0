const { ethers } = require('ethers');

async function check() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const contract = new ethers.Contract(
    '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692',
    ["function streams(uint256) external view returns (tuple(uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce))"],
    provider
  );

  const now = Math.floor(Date.now() / 1000);

  console.log("Checking which streams can be settled NOW...\n");

  for (let streamId = 0; streamId < 5; streamId++) {
    try {
      const stream = await contract.streams(streamId);

      const earliest = Number(stream.lastSettlementTime) + Number(stream.settlementIntervalSecs);
      const canSettle = now >= earliest;
      const minutesUntil = Math.floor((earliest - now) / 60);

      console.log(`Stream ${streamId}:`);
      console.log(`  Active: ${stream.active}`);
      console.log(`  Interval: ${Number(stream.settlementIntervalSecs) / 60} min`);

      if (canSettle && stream.active) {
        console.log(`  ✅ CAN SETTLE NOW!`);
      } else if (!stream.active) {
        console.log(`  ⏸️  Paused`);
      } else {
        console.log(`  ⏰ Wait ${minutesUntil} more minutes`);
      }

      console.log();
    } catch {
      break;
    }
  }
}

check();
