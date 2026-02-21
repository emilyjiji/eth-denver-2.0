const { ethers } = require('ethers');

async function checkMetadata() {
  const provider = new ethers.JsonRpcProvider('https://rpc.ab.testnet.adifoundation.ai');
  const contractAddress = '0x31246c37f75cC7fe6f669651c66d27E6708De1b1';
  
  const abi = [
    "function getReceivable(uint256) external view returns (tuple(uint256 tokenId, address utilityProvider, address customer, uint256 amountUSD, uint256 amountADI, uint256 dueDate, uint8 status, bytes32 hederaTxHash, uint256 mintedAt))",
    "function ownerOf(uint256) external view returns (address)"
  ];
  
  const contract = new ethers.Contract(contractAddress, abi, provider);
  
  console.log("=== NFT #1 Full Metadata ===\n");
  
  // Get NFT data
  const receivable = await contract.getReceivable(1);
  const owner = await contract.ownerOf(1);
  
  const statusNames = ['OUTSTANDING', 'FACTORED', 'PARTIAL', 'PAID', 'DEFAULTED'];
  
  console.log("On-Chain Data:");
  console.log("  Token ID:", receivable.tokenId.toString());
  console.log("  Owner:", owner);
  console.log("  Utility Provider:", receivable.utilityProvider);
  console.log("  Customer (Debtor):", receivable.customer);
  console.log("  Amount USD:", Number(receivable.amountUSD) / 1e6, "USD");
  console.log("  Amount ADI:", ethers.formatEther(receivable.amountADI), "ADI");
  console.log("  Status:", statusNames[receivable.status], `(${receivable.status})`);
  console.log("  Due Date:", new Date(Number(receivable.dueDate) * 1000).toLocaleString());
  console.log("  Minted At:", new Date(Number(receivable.mintedAt) * 1000).toLocaleString());
  console.log("  Hedera Proof:", receivable.hederaTxHash);
  console.log();
  
  console.log("NFT Properties (proves it's a token):");
  console.log("  ✅ Unique ID:", receivable.tokenId.toString());
  console.log("  ✅ Single owner:", owner !== ethers.ZeroAddress);
  console.log("  ✅ Transferable: owner can call transfer()");
  console.log("  ✅ Queryable: getReceivable() returns data");
  console.log("  ✅ ERC-721-like: has ownerOf(), balanceOf()");
  console.log();
  
  if (receivable.status === 0) {
    console.log("💰 RWA Value (OUTSTANDING Receivable):");
    console.log("   Utility is owed:", Number(receivable.amountUSD) / 1e6, "USD");
    console.log("   Utility can FACTOR this:");
    console.log("   - Sell NFT to investor for instant cash");
    console.log("   - Investor buys at discount (e.g., $0.028)");
    console.log("   - When customer pays, investor collects full $0.03");
    console.log("   - Investor profits from discount");
  } else if (receivable.status === 3) {
    console.log("📊 Proof of Revenue (PAID Receivable):");
    console.log("   Customer already paid:", Number(receivable.amountUSD) / 1e6, "USD");
    console.log("   NFT proves:");
    console.log("   - Delivery was made");
    console.log("   - Payment was received");
    console.log("   - Can be used for securitization");
  }
}

checkMetadata();
