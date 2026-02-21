const { ethers } = require('ethers');

async function check() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const contract = new ethers.Contract(
    '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692',
    ["function streams(uint256) external view returns (tuple(uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce))"],
    provider
  );

  console.log("Finding stream with larger accrued amount...\n");

  for (let streamId = 0; streamId < 5; streamId++) {
    try {
      const stream = await contract.streams(streamId);
      const accruedHBAR = Number(ethers.formatEther(stream.accruedAmount));
      const accruedUSD = accruedHBAR * 0.05;

      console.log(`Stream ${streamId}:`);
      console.log(`  Accrued: ${accruedHBAR.toFixed(6)} HBAR = $${accruedUSD.toFixed(6)} USD`);
      console.log(`  Deposit: ${ethers.formatEther(stream.depositBalance)} HBAR`);
      console.log(`  Active: ${stream.active}`);

      if (accruedUSD >= 0.01) {
        console.log(`  ✅ Good amount! Use this stream`);
      } else if (accruedUSD > 0) {
        console.log(`  ⚠️  Too small (will round to $0.00)`);
      }
      console.log();
    } catch {
      break;
    }
  }
}

check();
