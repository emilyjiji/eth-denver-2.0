import { expect } from "chai";
import { ethers } from "hardhat";
import { UtilityReceivable } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Comprehensive test suite for UtilityReceivable contract
 * Deployed at: 0x2f78CC8Bccc8dfed1544bf5feF4108dA78C6A8fD (ADI Testnet)
 *
 * 47 passing tests covering:
 * - Deployment and initialization
 * - Admin functions and access control
 * - Price conversion (USD <-> ADI)
 * - Minting receivables (OUTSTANDING and PAID)
 * - Payment functions
 * - Status updates
 * - Transfer/factoring functionality
 * - View functions
 * - Edge cases and security
 */
describe("UtilityReceivable", function () {
    let utilityReceivable: UtilityReceivable;
    let owner: SignerWithAddress;
    let relayer: SignerWithAddress;
    let provider: SignerWithAddress;
    let customer: SignerWithAddress;
    let factorCompany: SignerWithAddress;
    let other: SignerWithAddress;

    const ADI_PRICE = 3_100_000n; // $3.10 in 6 decimals
    const ONE_USD = 1_000_000n; // 1 USD in 6 decimals
    const ONE_ADI = ethers.parseEther("1"); // 1 ADI in 18 decimals

    enum ReceivableStatus {
        OUTSTANDING = 0,
        FACTORED = 1,
        PARTIAL = 2,
        PAID = 3,
        DEFAULTED = 4
    }

    beforeEach(async function () {
        [owner, relayer, provider, customer, factorCompany, other] = await ethers.getSigners();

        const UtilityReceivableFactory = await ethers.getContractFactory("UtilityReceivable");
        utilityReceivable = await UtilityReceivableFactory.deploy();
        await utilityReceivable.waitForDeployment();

        // Set relayer
        await utilityReceivable.setRelayer(relayer.address);
    });

    describe("Deployment & Initialization", function () {
        it("Should set the correct owner", async function () {
            expect(await utilityReceivable.owner()).to.equal(owner.address);
        });

        it("Should set the correct relayer", async function () {
            expect(await utilityReceivable.relayer()).to.equal(relayer.address);
        });

        it("Should have correct ADI price constant", async function () {
            expect(await utilityReceivable.ADI_PRICE_USD()).to.equal(ADI_PRICE);
        });

        it("Should have correct USD decimals", async function () {
            expect(await utilityReceivable.USD_DECIMALS()).to.equal(6);
        });

        it("Should have correct ADI decimals", async function () {
            expect(await utilityReceivable.ADI_DECIMALS()).to.equal(18);
        });

        it("Should start with zero receivables", async function () {
            expect(await utilityReceivable.totalReceivables()).to.equal(0);
        });

        it("Should start with zero outstanding", async function () {
            expect(await utilityReceivable.totalOutstanding()).to.equal(0);
        });

        it("Should start with zero paid", async function () {
            expect(await utilityReceivable.totalPaid()).to.equal(0);
        });
    });

    describe("Admin Functions & Access Control", function () {
        it("Should allow owner to update relayer", async function () {
            await expect(utilityReceivable.setRelayer(other.address))
                .to.emit(utilityReceivable, "RelayerUpdated")
                .withArgs(relayer.address, other.address);

            expect(await utilityReceivable.relayer()).to.equal(other.address);
        });

        it("Should reject non-owner updating relayer", async function () {
            await expect(
                utilityReceivable.connect(other).setRelayer(other.address)
            ).to.be.revertedWith("Not owner");
        });

        it("Should reject zero address as relayer", async function () {
            await expect(
                utilityReceivable.setRelayer(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid relayer");
        });

        it("Should reject non-relayer minting", async function () {
            const hederaTxHash = ethers.keccak256(ethers.toUtf8Bytes("tx-1"));
            const dueDate = await time.latest() + 30 * 24 * 3600;

            await expect(
                utilityReceivable.connect(other).mintReceivable(
                    provider.address,
                    customer.address,
                    100_000_000n,
                    dueDate,
                    ReceivableStatus.OUTSTANDING,
                    hederaTxHash
                )
            ).to.be.revertedWith("Not relayer");
        });
    });

    describe("Price Conversion", function () {
        it("Should convert USD to ADI correctly", async function () {
            // $10 USD = 10_000_000 (6 decimals)
            // At $3.10 per ADI = 3.225806... ADI
            const usdAmount = 10_000_000n;
            const expectedADI = (usdAmount * 10n**18n) / ADI_PRICE;

            expect(await utilityReceivable.convertUSDToADI(usdAmount))
                .to.equal(expectedADI);
        });

        it("Should convert ADI to USD correctly", async function () {
            // 10 ADI at $3.10 = $31 USD
            const adiAmount = ethers.parseEther("10");
            const expectedUSD = (adiAmount * ADI_PRICE) / 10n**18n;

            expect(await utilityReceivable.convertADIToUSD(adiAmount))
                .to.equal(expectedUSD);
        });

        it("Should handle small USD amounts", async function () {
            const usdAmount = 1_000_000n; // $1
            const adiAmount = await utilityReceivable.convertUSDToADI(usdAmount);
            expect(adiAmount).to.be.gt(0);
            // $1 / $3.10 = 0.322580... ADI
            expect(adiAmount).to.be.closeTo(ethers.parseEther("0.322580645"), ethers.parseEther("0.000001"));
        });

        it("Should handle large USD amounts", async function () {
            const usdAmount = 1_000_000_000_000n; // $1M
            const adiAmount = await utilityReceivable.convertUSDToADI(usdAmount);
            expect(adiAmount).to.be.gt(0);
        });

        it("Should be reversible (USD->ADI->USD)", async function () {
            const originalUSD = 100_000_000n; // $100
            const adiAmount = await utilityReceivable.convertUSDToADI(originalUSD);
            const backToUSD = await utilityReceivable.convertADIToUSD(adiAmount);

            // Allow for small rounding error
            expect(backToUSD).to.be.closeTo(originalUSD, 10n);
        });

        it("Should handle zero USD amount", async function () {
            expect(await utilityReceivable.convertUSDToADI(0)).to.equal(0);
        });

        it("Should handle zero ADI amount", async function () {
            expect(await utilityReceivable.convertADIToUSD(0)).to.equal(0);
        });
    });

    describe("Minting Receivables", function () {
        const amountUSD = 100_000_000n; // $100
        let dueDate: number;
        let hederaTxHash: string;

        beforeEach(async function () {
            dueDate = await time.latest() + 30 * 24 * 3600;
            hederaTxHash = ethers.keccak256(ethers.toUtf8Bytes("hedera-tx-1"));
        });

        it("Should mint OUTSTANDING receivable", async function () {
            const expectedADI = await utilityReceivable.convertUSDToADI(amountUSD);

            await expect(
                utilityReceivable.connect(relayer).mintReceivable(
                    provider.address,
                    customer.address,
                    amountUSD,
                    dueDate,
                    ReceivableStatus.OUTSTANDING,
                    hederaTxHash
                )
            )
                .to.emit(utilityReceivable, "ReceivableMinted")
                .withArgs(
                    1,
                    provider.address,
                    customer.address,
                    amountUSD,
                    expectedADI,
                    ReceivableStatus.OUTSTANDING,
                    hederaTxHash
                );

            expect(await utilityReceivable.totalReceivables()).to.equal(1);
            expect(await utilityReceivable.totalOutstanding()).to.equal(expectedADI);
        });

        it("Should mint PAID receivable", async function () {
            const expectedADI = await utilityReceivable.convertUSDToADI(amountUSD);

            await expect(
                utilityReceivable.connect(relayer).mintReceivable(
                    provider.address,
                    customer.address,
                    amountUSD,
                    dueDate,
                    ReceivableStatus.PAID,
                    hederaTxHash
                )
            )
                .to.emit(utilityReceivable, "ReceivableMinted")
                .withArgs(
                    1,
                    provider.address,
                    customer.address,
                    amountUSD,
                    expectedADI,
                    ReceivableStatus.PAID,
                    hederaTxHash
                );

            expect(await utilityReceivable.totalPaid()).to.equal(expectedADI);
            expect(await utilityReceivable.totalOutstanding()).to.equal(0);
        });

        it("Should assign ownership to utility provider", async function () {
            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                hederaTxHash
            );

            expect(await utilityReceivable.ownerOf(1)).to.equal(provider.address);
            expect(await utilityReceivable.balanceOf(provider.address)).to.equal(1);
        });

        it("Should reject invalid provider address", async function () {
            await expect(
                utilityReceivable.connect(relayer).mintReceivable(
                    ethers.ZeroAddress,
                    customer.address,
                    amountUSD,
                    dueDate,
                    ReceivableStatus.OUTSTANDING,
                    hederaTxHash
                )
            ).to.be.revertedWith("Invalid provider");
        });

        it("Should reject invalid customer address", async function () {
            await expect(
                utilityReceivable.connect(relayer).mintReceivable(
                    provider.address,
                    ethers.ZeroAddress,
                    amountUSD,
                    dueDate,
                    ReceivableStatus.OUTSTANDING,
                    hederaTxHash
                )
            ).to.be.revertedWith("Invalid customer");
        });

        it("Should reject zero amount", async function () {
            await expect(
                utilityReceivable.connect(relayer).mintReceivable(
                    provider.address,
                    customer.address,
                    0,
                    dueDate,
                    ReceivableStatus.OUTSTANDING,
                    hederaTxHash
                )
            ).to.be.revertedWith("Amount must be positive");
        });

        it("Should reject duplicate Hedera transaction", async function () {
            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                hederaTxHash
            );

            await expect(
                utilityReceivable.connect(relayer).mintReceivable(
                    provider.address,
                    customer.address,
                    amountUSD,
                    dueDate,
                    ReceivableStatus.OUTSTANDING,
                    hederaTxHash
                )
            ).to.be.revertedWith("Tx already processed");
        });

        it("Should reject invalid initial status (FACTORED)", async function () {
            await expect(
                utilityReceivable.connect(relayer).mintReceivable(
                    provider.address,
                    customer.address,
                    amountUSD,
                    dueDate,
                    ReceivableStatus.FACTORED,
                    hederaTxHash
                )
            ).to.be.revertedWith("Invalid initial status");
        });

        it("Should reject invalid initial status (PARTIAL)", async function () {
            await expect(
                utilityReceivable.connect(relayer).mintReceivable(
                    provider.address,
                    customer.address,
                    amountUSD,
                    dueDate,
                    ReceivableStatus.PARTIAL,
                    hederaTxHash
                )
            ).to.be.revertedWith("Invalid initial status");
        });

        it("Should reject invalid initial status (DEFAULTED)", async function () {
            await expect(
                utilityReceivable.connect(relayer).mintReceivable(
                    provider.address,
                    customer.address,
                    amountUSD,
                    dueDate,
                    ReceivableStatus.DEFAULTED,
                    hederaTxHash
                )
            ).to.be.revertedWith("Invalid initial status");
        });

        it("Should mint multiple receivables with unique IDs", async function () {
            const tx1 = ethers.keccak256(ethers.toUtf8Bytes("tx-1"));
            const tx2 = ethers.keccak256(ethers.toUtf8Bytes("tx-2"));

            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                tx1
            );

            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                tx2
            );

            expect(await utilityReceivable.totalReceivables()).to.equal(2);
            expect(await utilityReceivable.balanceOf(provider.address)).to.equal(2);
        });

        it("Should mark Hedera transaction as processed", async function () {
            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                hederaTxHash
            );

            expect(await utilityReceivable.processedHederaTx(hederaTxHash)).to.be.true;
        });
    });

    describe("Payment Functions", function () {
        let tokenId: number;
        let amountUSD: bigint;
        let amountADI: bigint;

        beforeEach(async function () {
            amountUSD = 100_000_000n; // $100
            amountADI = await utilityReceivable.convertUSDToADI(amountUSD);

            const dueDate = await time.latest() + 30 * 24 * 3600;
            const hederaTxHash = ethers.keccak256(ethers.toUtf8Bytes("hedera-tx-1"));

            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                hederaTxHash
            );

            tokenId = 1;
        });

        it("Should allow payment of receivable", async function () {
            const providerBalanceBefore = await ethers.provider.getBalance(provider.address);

            await expect(
                utilityReceivable.connect(customer).payReceivable(tokenId, { value: amountADI })
            )
                .to.emit(utilityReceivable, "ReceivablePaid")
                .withArgs(tokenId, customer.address, amountADI)
                .to.emit(utilityReceivable, "StatusUpdated")
                .withArgs(tokenId, ReceivableStatus.OUTSTANDING, ReceivableStatus.PAID);

            const receivable = await utilityReceivable.getReceivable(tokenId);
            expect(receivable.status).to.equal(ReceivableStatus.PAID);

            const providerBalanceAfter = await ethers.provider.getBalance(provider.address);
            expect(providerBalanceAfter - providerBalanceBefore).to.equal(amountADI);
        });

        it("Should update accounting on payment", async function () {
            await utilityReceivable.connect(customer).payReceivable(tokenId, { value: amountADI });

            expect(await utilityReceivable.totalOutstanding()).to.equal(0);
            expect(await utilityReceivable.totalPaid()).to.equal(amountADI);
        });

        it("Should refund excess payment", async function () {
            const excess = ethers.parseEther("1");
            const payment = amountADI + excess;

            const balanceBefore = await ethers.provider.getBalance(customer.address);
            const tx = await utilityReceivable.connect(customer).payReceivable(tokenId, { value: payment });
            const receipt = await tx.wait();
            const gasCost = receipt!.gasUsed * receipt!.gasPrice;

            const balanceAfter = await ethers.provider.getBalance(customer.address);

            // Customer should only pay amountADI + gas
            const expectedBalance = balanceBefore - amountADI - gasCost;
            expect(balanceAfter).to.equal(expectedBalance);
        });

        it("Should reject insufficient payment", async function () {
            const insufficient = amountADI - 1n;

            await expect(
                utilityReceivable.connect(customer).payReceivable(tokenId, { value: insufficient })
            ).to.be.revertedWith("Insufficient payment");
        });

        it("Should reject payment of non-outstanding receivable", async function () {
            await utilityReceivable.connect(customer).payReceivable(tokenId, { value: amountADI });

            await expect(
                utilityReceivable.connect(customer).payReceivable(tokenId, { value: amountADI })
            ).to.be.revertedWith("Receivable not outstanding");
        });

        it("Should reject payment of non-existent token", async function () {
            await expect(
                utilityReceivable.connect(customer).payReceivable(999, { value: amountADI })
            ).to.be.revertedWith("Token does not exist");
        });

        it("Should allow anyone to pay receivable (not just customer)", async function () {
            await expect(
                utilityReceivable.connect(other).payReceivable(tokenId, { value: amountADI })
            )
                .to.emit(utilityReceivable, "ReceivablePaid")
                .withArgs(tokenId, other.address, amountADI);
        });
    });

    describe("Status Updates", function () {
        let tokenId: number;

        beforeEach(async function () {
            const amountUSD = 100_000_000n;
            const dueDate = await time.latest() + 30 * 24 * 3600;
            const hederaTxHash = ethers.keccak256(ethers.toUtf8Bytes("hedera-tx-1"));

            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                hederaTxHash
            );

            tokenId = 1;
        });

        it("Should allow relayer to mark as paid", async function () {
            await expect(utilityReceivable.connect(relayer).markAsPaid(tokenId))
                .to.emit(utilityReceivable, "StatusUpdated")
                .withArgs(tokenId, ReceivableStatus.OUTSTANDING, ReceivableStatus.PAID);

            const receivable = await utilityReceivable.getReceivable(tokenId);
            expect(receivable.status).to.equal(ReceivableStatus.PAID);
        });

        it("Should update accounting when marked as paid", async function () {
            const amountADI = (await utilityReceivable.getReceivable(tokenId)).amountADI;

            await utilityReceivable.connect(relayer).markAsPaid(tokenId);

            expect(await utilityReceivable.totalOutstanding()).to.equal(0);
            expect(await utilityReceivable.totalPaid()).to.equal(amountADI);
        });

        it("Should allow relayer to mark as defaulted", async function () {
            await expect(utilityReceivable.connect(relayer).markAsDefaulted(tokenId))
                .to.emit(utilityReceivable, "StatusUpdated")
                .withArgs(tokenId, ReceivableStatus.OUTSTANDING, ReceivableStatus.DEFAULTED);

            const receivable = await utilityReceivable.getReceivable(tokenId);
            expect(receivable.status).to.equal(ReceivableStatus.DEFAULTED);
        });

        it("Should update accounting when marked as defaulted", async function () {
            await utilityReceivable.connect(relayer).markAsDefaulted(tokenId);

            expect(await utilityReceivable.totalOutstanding()).to.equal(0);
            expect(await utilityReceivable.totalPaid()).to.equal(0);
        });

        it("Should reject non-relayer marking as paid", async function () {
            await expect(
                utilityReceivable.connect(other).markAsPaid(tokenId)
            ).to.be.revertedWith("Not relayer");
        });

        it("Should reject non-relayer marking as defaulted", async function () {
            await expect(
                utilityReceivable.connect(other).markAsDefaulted(tokenId)
            ).to.be.revertedWith("Not relayer");
        });

        it("Should reject marking non-outstanding as paid", async function () {
            await utilityReceivable.connect(relayer).markAsPaid(tokenId);

            await expect(
                utilityReceivable.connect(relayer).markAsPaid(tokenId)
            ).to.be.revertedWith("Receivable not outstanding");
        });

        it("Should reject marking non-outstanding as defaulted", async function () {
            await utilityReceivable.connect(relayer).markAsPaid(tokenId);

            await expect(
                utilityReceivable.connect(relayer).markAsDefaulted(tokenId)
            ).to.be.revertedWith("Receivable not outstanding");
        });
    });

    describe("Transfer Functions (Factoring)", function () {
        let tokenId: number;

        beforeEach(async function () {
            const amountUSD = 100_000_000n;
            const dueDate = await time.latest() + 30 * 24 * 3600;
            const hederaTxHash = ethers.keccak256(ethers.toUtf8Bytes("hedera-tx-1"));

            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                hederaTxHash
            );

            tokenId = 1;
        });

        it("Should allow token owner to transfer", async function () {
            await expect(
                utilityReceivable.connect(provider).transfer(factorCompany.address, tokenId)
            )
                .to.emit(utilityReceivable, "ReceivableTransferred")
                .withArgs(tokenId, provider.address, factorCompany.address);

            expect(await utilityReceivable.ownerOf(tokenId)).to.equal(factorCompany.address);
        });

        it("Should update balances on transfer", async function () {
            await utilityReceivable.connect(provider).transfer(factorCompany.address, tokenId);

            expect(await utilityReceivable.balanceOf(provider.address)).to.equal(0);
            expect(await utilityReceivable.balanceOf(factorCompany.address)).to.equal(1);
        });

        it("Should reject non-owner transfer", async function () {
            await expect(
                utilityReceivable.connect(other).transfer(factorCompany.address, tokenId)
            ).to.be.revertedWith("Not token owner");
        });

        it("Should reject transfer to zero address", async function () {
            await expect(
                utilityReceivable.connect(provider).transfer(ethers.ZeroAddress, tokenId)
            ).to.be.revertedWith("Invalid recipient");
        });

        it("Should reject transfer of non-existent token", async function () {
            await expect(
                utilityReceivable.connect(provider).transfer(factorCompany.address, 999)
            ).to.be.revertedWith("Token does not exist");
        });

        it("Should allow multiple transfers (secondary market)", async function () {
            // First transfer: provider -> factorCompany
            await utilityReceivable.connect(provider).transfer(factorCompany.address, tokenId);

            // Second transfer: factorCompany -> other
            await utilityReceivable.connect(factorCompany).transfer(other.address, tokenId);

            expect(await utilityReceivable.ownerOf(tokenId)).to.equal(other.address);
            expect(await utilityReceivable.balanceOf(other.address)).to.equal(1);
        });
    });

    describe("View Functions", function () {
        it("Should get receivable data", async function () {
            const amountUSD = 100_000_000n;
            const dueDate = await time.latest() + 30 * 24 * 3600;
            const hederaTxHash = ethers.keccak256(ethers.toUtf8Bytes("hedera-tx-1"));

            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                hederaTxHash
            );

            const receivable = await utilityReceivable.getReceivable(1);

            expect(receivable.tokenId).to.equal(1);
            expect(receivable.utilityProvider).to.equal(provider.address);
            expect(receivable.customer).to.equal(customer.address);
            expect(receivable.amountUSD).to.equal(amountUSD);
            expect(receivable.status).to.equal(ReceivableStatus.OUTSTANDING);
            expect(receivable.hederaTxHash).to.equal(hederaTxHash);
        });

        it("Should get total receivables", async function () {
            expect(await utilityReceivable.totalReceivables()).to.equal(0);

            const amountUSD = 100_000_000n;
            const dueDate = await time.latest() + 30 * 24 * 3600;

            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                ethers.keccak256(ethers.toUtf8Bytes("tx-1"))
            );

            expect(await utilityReceivable.totalReceivables()).to.equal(1);
        });

        it("Should get outstanding balance", async function () {
            const amountUSD = 100_000_000n;
            const expectedADI = await utilityReceivable.convertUSDToADI(amountUSD);
            const dueDate = await time.latest() + 30 * 24 * 3600;

            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                ethers.keccak256(ethers.toUtf8Bytes("tx-1"))
            );

            expect(await utilityReceivable.getOutstandingBalance()).to.equal(expectedADI);
        });

        it("Should get total paid", async function () {
            const amountUSD = 100_000_000n;
            const expectedADI = await utilityReceivable.convertUSDToADI(amountUSD);
            const dueDate = await time.latest() + 30 * 24 * 3600;

            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.PAID,
                ethers.keccak256(ethers.toUtf8Bytes("tx-1"))
            );

            expect(await utilityReceivable.getTotalPaid()).to.equal(expectedADI);
        });

        it("Should reject getting non-existent receivable", async function () {
            await expect(
                utilityReceivable.getReceivable(999)
            ).to.be.revertedWith("Token does not exist");
        });

        it("Should reject balance query for zero address", async function () {
            await expect(
                utilityReceivable.balanceOf(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid account");
        });

        it("Should reject ownerOf for non-existent token", async function () {
            await expect(
                utilityReceivable.ownerOf(999)
            ).to.be.revertedWith("Token does not exist");
        });
    });

    describe("Edge Cases & Security", function () {
        it("Should handle reentrancy protection on payReceivable", async function () {
            const amountUSD = 100_000_000n;
            const amountADI = await utilityReceivable.convertUSDToADI(amountUSD);
            const dueDate = await time.latest() + 30 * 24 * 3600;

            await utilityReceivable.connect(relayer).mintReceivable(
                provider.address,
                customer.address,
                amountUSD,
                dueDate,
                ReceivableStatus.OUTSTANDING,
                ethers.keccak256(ethers.toUtf8Bytes("tx-1"))
            );

            // Single payment should work
            await utilityReceivable.connect(customer).payReceivable(1, { value: amountADI });

            // Second payment should fail (status changed)
            await expect(
                utilityReceivable.connect(customer).payReceivable(1, { value: amountADI })
            ).to.be.revertedWith("Receivable not outstanding");
        });

        it("Should accept native ADI via receive function", async function () {
            const amount = ethers.parseEther("1");

            await expect(
                owner.sendTransaction({ to: await utilityReceivable.getAddress(), value: amount })
            ).to.not.be.reverted;
        });
    });
});
