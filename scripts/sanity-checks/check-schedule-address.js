const { ethers } = require('ethers');

async function checkSchedule() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const contractAddress = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
  
  const abi = [
    "function streams(uint256) external view returns (tuple(uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce))"
  ];
  
  const contract = new ethers.Contract(contractAddress, abi, provider);
  const stream = await contract.streams(0);
  
  console.log("Schedule Status:");
  console.log("  lastScheduleAddress:", stream.lastScheduleAddress);
  console.log("  nextSettlementTime:", new Date(Number(stream.nextSettlementTime) * 1000).toLocaleString());
  console.log("  settlementCount:", stream.settlementCount.toString());
  console.log();
  
  if (stream.lastScheduleAddress === ethers.ZeroAddress) {
    console.log("⚠️  NO SCHEDULE CREATED!");
    console.log("    lastScheduleAddress is 0x0000...");
    console.log("    This means _scheduleNextSettlement was never called successfully");
    console.log();
    console.log("Possible reasons:");
    console.log("  1. createStream() was never called (stream created differently)");
    console.log("  2. _scheduleNextSettlement failed (HSS precompile issue)");
    console.log("  3. Initial schedule creation reverted");
  } else {
    console.log("✓ Schedule WAS created at:", stream.lastScheduleAddress);
    console.log();
    console.log("If schedule exists but isn't executing:");
    console.log("  - Schedule might have expired");
    console.log("  - Schedule might have been deleted");
    console.log("  - HSS capacity issues");
    console.log("  - Schedule waiting for payer signature (if usePayerScheduling)");
  }
}

checkSchedule();
