// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title UtilityReceivable
 * @notice Tokenized utility receivables as Real World Assets (RWA) on ADI Chain
 * @dev Custom NFT-like implementation with native $ADI payments at $3.10/ADI
 *
 * Deployed at: 0x31246c37f75cC7fe6f669651c66d27E6708De1b1 (ADI Testnet)
 *
 * Key Features:
 * - Custom NFT-like functionality (no OpenZeppelin dependencies)
 * - Native $ADI token with hardcoded price of $3.10
 * - Price conversion: USD (6 decimals) <-> ADI (18 decimals)
 * - Reentrancy protection with _locked boolean
 * - Simple owner + relayer access control
 * - Cross-chain event handling from Hedera
 */
contract UtilityReceivable {

    // ============ Enums ============

    enum ReceivableStatus {
        OUTSTANDING,  // Bill issued, payment pending
        FACTORED,     // Sold to factoring company
        PARTIAL,      // Partially paid
        PAID,         // Fully paid
        DEFAULTED     // Payment failed/defaulted
    }

    // ============ Structs ============

    struct Receivable {
        uint256 tokenId;
        address utilityProvider;
        address customer;
        uint256 amountUSD;        // Amount in USD (6 decimals)
        uint256 amountADI;        // Amount in ADI (18 decimals)
        uint256 dueDate;
        ReceivableStatus status;
        bytes32 hederaTxHash;     // Original Hedera transaction
        uint256 mintedAt;
    }

    // ============ Constants ============

    // ADI price hardcoded at $3.10 (6 decimals for USD precision)
    uint256 public constant ADI_PRICE_USD = 3_100_000; // $3.10 in 6 decimals
    uint256 public constant USD_DECIMALS = 6;
    uint256 public constant ADI_DECIMALS = 18;

    // ============ State Variables ============

    uint256 private _nextTokenId;
    uint256 public totalOutstanding;      // Total outstanding in ADI
    uint256 public totalPaid;             // Total paid in ADI

    mapping(uint256 => Receivable) public receivables;
    mapping(uint256 => address) private _tokenOwners;
    mapping(address => uint256) private _balances;
    mapping(bytes32 => bool) public processedHederaTx;

    address public relayer;
    address public owner;

    bool private _locked;  // Reentrancy guard

    // ============ Events ============

    event ReceivableMinted(
        uint256 indexed tokenId,
        address indexed utilityProvider,
        address indexed customer,
        uint256 amountUSD,
        uint256 amountADI,
        ReceivableStatus status,
        bytes32 hederaTxHash
    );

    event ReceivablePaid(
        uint256 indexed tokenId,
        address indexed payer,
        uint256 amountADI
    );

    event ReceivableTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to
    );

    event StatusUpdated(
        uint256 indexed tokenId,
        ReceivableStatus oldStatus,
        ReceivableStatus newStatus
    );

    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not relayer");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrancy detected");
        _locked = true;
        _;
        _locked = false;
    }

    modifier tokenExists(uint256 tokenId) {
        require(_tokenOwners[tokenId] != address(0), "Token does not exist");
        _;
    }

    // ============ Constructor ============

    constructor() {
        owner = msg.sender;
        relayer = msg.sender;
        _nextTokenId = 1;
    }

    // ============ Admin Functions ============

    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Invalid relayer");
        address oldRelayer = relayer;
        relayer = _relayer;
        emit RelayerUpdated(oldRelayer, _relayer);
    }

    // ============ Core Minting Functions ============

    /**
     * @notice Mint a new receivable from Hedera settlement event
     * @param utilityProvider The utility company address
     * @param customer The customer address
     * @param amountUSD Amount in USD (6 decimals)
     * @param dueDate Payment due date
     * @param status Initial status (OUTSTANDING or PAID)
     * @param hederaTxHash Original Hedera transaction hash
     */
    function mintReceivable(
        address utilityProvider,
        address customer,
        uint256 amountUSD,
        uint256 dueDate,
        ReceivableStatus status,
        bytes32 hederaTxHash
    ) external onlyRelayer returns (uint256) {
        require(utilityProvider != address(0), "Invalid provider");
        require(customer != address(0), "Invalid customer");
        require(amountUSD > 0, "Amount must be positive");
        require(!processedHederaTx[hederaTxHash], "Tx already processed");
        require(
            status == ReceivableStatus.OUTSTANDING || status == ReceivableStatus.PAID,
            "Invalid initial status"
        );

        // Convert USD to ADI
        uint256 amountADI = convertUSDToADI(amountUSD);

        uint256 tokenId = _nextTokenId++;

        // Create receivable
        receivables[tokenId] = Receivable({
            tokenId: tokenId,
            utilityProvider: utilityProvider,
            customer: customer,
            amountUSD: amountUSD,
            amountADI: amountADI,
            dueDate: dueDate,
            status: status,
            hederaTxHash: hederaTxHash,
            mintedAt: block.timestamp
        });

        // Assign ownership to utility provider
        _tokenOwners[tokenId] = utilityProvider;
        _balances[utilityProvider]++;

        // Update accounting - only add to totalOutstanding if status is OUTSTANDING
        if (status == ReceivableStatus.OUTSTANDING) {
            totalOutstanding += amountADI;
        } else if (status == ReceivableStatus.PAID) {
            totalPaid += amountADI;
        }

        // Mark transaction as processed
        processedHederaTx[hederaTxHash] = true;

        emit ReceivableMinted(
            tokenId,
            utilityProvider,
            customer,
            amountUSD,
            amountADI,
            status,
            hederaTxHash
        );

        return tokenId;
    }

    // ============ Payment Functions ============

    /**
     * @notice Pay a receivable with native ADI
     * @param tokenId The receivable token ID
     */
    function payReceivable(uint256 tokenId)
        external
        payable
        nonReentrant
        tokenExists(tokenId)
    {
        Receivable storage receivable = receivables[tokenId];
        require(
            receivable.status == ReceivableStatus.OUTSTANDING,
            "Receivable not outstanding"
        );
        require(msg.value >= receivable.amountADI, "Insufficient payment");

        // Update state BEFORE transfer (reentrancy protection)
        receivable.status = ReceivableStatus.PAID;
        totalOutstanding -= receivable.amountADI;
        totalPaid += receivable.amountADI;

        // Transfer to utility provider
        address provider = receivable.utilityProvider;
        uint256 payment = receivable.amountADI;

        (bool success, ) = provider.call{value: payment}("");
        require(success, "Payment transfer failed");

        // Refund excess
        if (msg.value > payment) {
            uint256 refund = msg.value - payment;
            (bool refundSuccess, ) = msg.sender.call{value: refund}("");
            require(refundSuccess, "Refund failed");
        }

        emit ReceivablePaid(tokenId, msg.sender, payment);
        emit StatusUpdated(tokenId, ReceivableStatus.OUTSTANDING, ReceivableStatus.PAID);
    }

    /**
     * @notice Update status when payment detected on Hedera
     * @param tokenId The receivable token ID
     */
    function markAsPaid(uint256 tokenId)
        external
        onlyRelayer
        tokenExists(tokenId)
    {
        Receivable storage receivable = receivables[tokenId];
        require(
            receivable.status == ReceivableStatus.OUTSTANDING,
            "Receivable not outstanding"
        );

        ReceivableStatus oldStatus = receivable.status;
        receivable.status = ReceivableStatus.PAID;

        totalOutstanding -= receivable.amountADI;
        totalPaid += receivable.amountADI;

        emit StatusUpdated(tokenId, oldStatus, ReceivableStatus.PAID);
    }

    /**
     * @notice Mark receivable as defaulted
     * @param tokenId The receivable token ID
     */
    function markAsDefaulted(uint256 tokenId)
        external
        onlyRelayer
        tokenExists(tokenId)
    {
        Receivable storage receivable = receivables[tokenId];
        require(
            receivable.status == ReceivableStatus.OUTSTANDING,
            "Receivable not outstanding"
        );

        ReceivableStatus oldStatus = receivable.status;
        receivable.status = ReceivableStatus.DEFAULTED;

        totalOutstanding -= receivable.amountADI;

        emit StatusUpdated(tokenId, oldStatus, ReceivableStatus.DEFAULTED);
    }

    // ============ Transfer Functions ============

    /**
     * @notice Transfer receivable ownership (for factoring)
     * @param to Recipient address
     * @param tokenId Token ID to transfer
     */
    function transfer(address to, uint256 tokenId)
        external
        tokenExists(tokenId)
    {
        require(to != address(0), "Invalid recipient");
        require(_tokenOwners[tokenId] == msg.sender, "Not token owner");

        address from = msg.sender;

        // Update ownership
        _tokenOwners[tokenId] = to;
        _balances[from]--;
        _balances[to]++;

        emit ReceivableTransferred(tokenId, from, to);
    }

    // ============ Price Conversion ============

    /**
     * @notice Convert USD to ADI using hardcoded price
     * @param amountUSD Amount in USD (6 decimals)
     * @return Amount in ADI (18 decimals)
     */
    function convertUSDToADI(uint256 amountUSD) public pure returns (uint256) {
        // amountUSD is in 6 decimals
        // ADI_PRICE_USD is $3.10 in 6 decimals (3_100_000)
        // Result should be in 18 decimals

        // Formula: (amountUSD * 10^18) / ADI_PRICE_USD
        return (amountUSD * 10**ADI_DECIMALS) / ADI_PRICE_USD;
    }

    /**
     * @notice Convert ADI to USD using hardcoded price
     * @param amountADI Amount in ADI (18 decimals)
     * @return Amount in USD (6 decimals)
     */
    function convertADIToUSD(uint256 amountADI) public pure returns (uint256) {
        // amountADI is in 18 decimals
        // Result should be in 6 decimals

        // Formula: (amountADI * ADI_PRICE_USD) / 10^18
        return (amountADI * ADI_PRICE_USD) / 10**ADI_DECIMALS;
    }

    // ============ View Functions ============

    function ownerOf(uint256 tokenId) external view tokenExists(tokenId) returns (address) {
        return _tokenOwners[tokenId];
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "Invalid account");
        return _balances[account];
    }

    function getReceivable(uint256 tokenId)
        external
        view
        tokenExists(tokenId)
        returns (Receivable memory)
    {
        return receivables[tokenId];
    }

    function totalReceivables() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function getOutstandingBalance() external view returns (uint256) {
        return totalOutstanding;
    }

    function getTotalPaid() external view returns (uint256) {
        return totalPaid;
    }

    // ============ Receive Function ============

    receive() external payable {}
}
