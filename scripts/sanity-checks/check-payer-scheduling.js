const { ethers } = require('ethers');

async function check() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const contractAddress = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
  
  const abi = [
    "function streams(uint256) external view returns (tuple(uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce))"
  ];
  
  const contract = new ethers.Contract(contractAddress, abi, provider);
  const stream = await contract.streams(0);
  
  console.log("Scheduling Configuration:");
  console.log("  usePayerScheduling:", stream.usePayerScheduling);
  console.log("  schedulePayer:", stream.schedulePayer);
  console.log();
  
  if (stream.usePayerScheduling) {
    console.log("⚠️  FOUND THE PROBLEM!");
    console.log("    usePayerScheduling = true");
    console.log("    This means the schedule is waiting for payer signature!");
    console.log("    The scheduled transaction won't execute until:");
    console.log("    1. The schedulePayer signs the transaction");
    console.log("    2. OR you switch to scheduleCall (usePayerScheduling = false)");
    console.log();
    console.log("This is why settlements are stuck!");
  } else {
    console.log("✓ Using scheduleCall (no payer signature needed)");
    console.log("  Schedule should execute automatically...");
    console.log("  Something else is wrong");
  }
}

check();
