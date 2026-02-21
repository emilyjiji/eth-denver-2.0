const { ethers } = require('ethers');

async function check() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hashio.io/api');
  const contract = new ethers.Contract(
    '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692',
    ["function streams(uint256) external view returns (tuple(uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce))"],
    provider
  );
  
  const stream = await contract.streams(0);
  const contractAddress = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
  
  console.log("Schedule Payer Configuration:");
  console.log("  schedulePayer:", stream.schedulePayer);
  console.log("  Contract address:", contractAddress);
  console.log("  usePayerScheduling:", stream.usePayerScheduling);
  console.log();
  
  if (stream.usePayerScheduling === false) {
    console.log("✓ Using scheduleCall (contract pays for itself)");
    console.log("  Contract should have HBAR for gas: ✓ (has 269 HBAR)");
    console.log();
    
    // Check contract balance
    const balance = await provider.getBalance(contractAddress);
    console.log("  Contract balance:", ethers.formatEther(balance), "HBAR");
    
    if (balance > ethers.parseEther("1")) {
      console.log("  ✓ Plenty of HBAR for scheduled transactions");
    }
  } else {
    console.log("Using scheduleCallWithPayer");
    console.log("  Payer must be:", stream.schedulePayer);
    
    if (stream.schedulePayer === contractAddress) {
      console.log("  ✓ Payer is contract itself");
    } else {
      console.log("  ⚠️  Payer is external address!");
      console.log("     This might need authorization!");
    }
  }
}

check();
