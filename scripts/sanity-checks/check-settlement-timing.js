const { ethers } = require('ethers');

async function check() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const contract = new ethers.Contract(
    '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692',
    ["function streams(uint256) external view returns (tuple(uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce))"],
    provider
  );

  console.log("Settlement Timing Analysis:\n");

  for (let streamId = 0; streamId < 4; streamId++) {
    try {
      const stream = await contract.streams(streamId);

      const intervalSec = Number(stream.settlementIntervalSecs);
      const intervalMin = intervalSec / 60;
      const intervalHr = intervalSec / 3600;

      console.log(`Stream ${streamId}:`);
      console.log(`  Settlement Interval: ${intervalSec} seconds`);
      console.log(`                     = ${intervalMin} minutes`);
      console.log(`                     = ${intervalHr} hours`);
      console.log(`  Last Settlement: ${new Date(Number(stream.lastSettlementTime) * 1000).toLocaleString()}`);
      console.log(`  Next Settlement: ${new Date(Number(stream.nextSettlementTime) * 1000).toLocaleString()}`);
      console.log(`  Settlement Count: ${stream.settlementCount.toString()}`);

      const now = Math.floor(Date.now() / 1000);
      const next = Number(stream.nextSettlementTime);

      if (next > 0) {
        if (next > now) {
          const minsUntil = Math.floor((next - now) / 60);
          console.log(`  ⏰ Next in: ${minsUntil} minutes`);
        } else {
          const minsOverdue = Math.floor((now - next) / 60);
          console.log(`  ⚠️  OVERDUE by: ${minsOverdue} minutes`);
        }
      }

      console.log();

    } catch (error) {
      break;
    }
  }
}

check();
