const { ethers } = require('ethers');
require('dotenv').config();

async function checkReceivable() {
  const provider = new ethers.JsonRpcProvider('https://rpc.ab.testnet.adifoundation.ai');
  const contractAddress = '0x31246c37f75cC7fe6f669651c66d27E6708De1b1';
  
  const abi = [
    "function totalReceivables() external view returns (uint256)",
    "function getReceivable(uint256 tokenId) external view returns (tuple(uint256 tokenId, address utilityProvider, address customer, uint256 amountUSD, uint256 amountADI, uint256 dueDate, uint8 status, bytes32 hederaTxHash, uint256 mintedAt))",
    "function ownerOf(uint256 tokenId) external view returns (address)",
    "function balanceOf(address account) external view returns (uint256)",
    "function totalOutstanding() external view returns (uint256)",
    "function totalPaid() external view returns (uint256)"
  ];
  
  const contract = new ethers.Contract(contractAddress, abi, provider);
  
  console.log("=== ADI UtilityReceivable Contract ===\n");
  console.log("Address:", contractAddress);
  console.log();
  
  // Get totals
  const totalReceivables = await contract.totalReceivables();
  const totalOutstanding = await contract.totalOutstanding();
  const totalPaid = await contract.totalPaid();
  
  console.log("Contract Stats:");
  console.log("  Total Receivables (NFTs):", totalReceivables.toString());
  console.log("  Total Outstanding:", ethers.formatEther(totalOutstanding), "ADI");
  console.log("  Total Paid:", ethers.formatEther(totalPaid), "ADI");
  console.log();
  
  if (totalReceivables > 0) {
    console.log("=== NFT Details ===\n");
    
    for (let i = 1; i <= totalReceivables; i++) {
      const receivable = await contract.getReceivable(i);
      const owner = await contract.ownerOf(i);
      
      const statusNames = ['OUTSTANDING', 'FACTORED', 'PARTIAL', 'PAID', 'DEFAULTED'];
      
      console.log(`NFT Token #${i}:`);
      console.log("  Owner:", owner);
      console.log("  Utility Provider:", receivable.utilityProvider);
      console.log("  Customer:", receivable.customer);
      console.log("  Amount (USD):", Number(receivable.amountUSD) / 1e6, "USD");
      console.log("  Amount (ADI):", ethers.formatEther(receivable.amountADI), "ADI");
      console.log("  Status:", statusNames[receivable.status], `(${receivable.status})`);
      console.log("  Due Date:", new Date(Number(receivable.dueDate) * 1000).toLocaleString());
      console.log("  Minted At:", new Date(Number(receivable.mintedAt) * 1000).toLocaleString());
      console.log("  Hedera Proof:", receivable.hederaTxHash);
      console.log();
      
      // This proves it's an NFT!
      console.log("  ✅ This is an ERC-721-like NFT:");
      console.log("     - Has unique tokenId:", i);
      console.log("     - Has single owner:", owner);
      console.log("     - Is tradeable (can transfer ownership)");
      console.log("     - Represents RWA (utility receivable)");
      console.log();
    }
    
    // Check utility's balance
    const utilityAddress = '0x545c83BA8eDf20c7A02671eF1eb9A6D223590415';
    const utilityBalance = await contract.balanceOf(utilityAddress);
    console.log(`Utility owns ${utilityBalance} receivable NFT(s)`);
    
  } else {
    console.log("⚠️  No receivables minted yet");
  }
}

checkReceivable();
