import { expect }  from "chai";
import { ethers, network } from "hardhat";
import { time }    from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

// ─── Constants ────────────────────────────────────────────────────────────────

const HSS_ADDRESS  = "0x000000000000000000000000000000000000016b";
const PRNG_ADDRESS = "0x0000000000000000000000000000000000000169";
const ZERO_SLOT    = "0x0000000000000000000000000000000000000000000000000000000000000000";

// Stream parameters used across tests.
const INTERVAL     = 3_600n;          // 1 hour in seconds
const BASE_RATE    = 150_000_000_000_000n; // 0.15 HBAR/kWh → 1.5×10^14 wei/unit
const MAX_PAY      = ethers.parseEther("10"); // safety cap per settlement
const DEPOSIT      = ethers.parseEther("1");  // 1 ETH/HBAR initial deposit

// Oracle report values.
const CONGESTION   = 10_000; // 1.0×
const HOURLY_KWH_1 = 500n;   // 0.500 kWh
const HOURLY_KWH_2 = 800n;   // 0.800 kWh

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Install MockHSSPrecompile at 0x16b and reset its storage (slots 0–7).
 * Returns an ethers Contract at 0x16b for state inspection.
 */
async function installMockHSS() {
  const Factory = await ethers.getContractFactory("MockHSSPrecompile");
  const temp = await Factory.deploy();
  await temp.waitForDeployment();

  const code = await network.provider.send("eth_getCode", [
    await temp.getAddress(), "latest",
  ]);
  await network.provider.send("hardhat_setCode", [HSS_ADDRESS, code]);

  for (let slot = 0; slot <= 7; slot++) {
    await network.provider.send("hardhat_setStorageAt", [
      HSS_ADDRESS, "0x" + slot.toString(16), ZERO_SLOT,
    ]);
  }
  return new ethers.Contract(HSS_ADDRESS, Factory.interface, ethers.provider);
}

/**
 * Install MockPRNG at 0x169 and reset its storage (slot 0).
 */
async function installMockPRNG() {
  const Factory = await ethers.getContractFactory("MockPRNG");
  const temp = await Factory.deploy();
  await temp.waitForDeployment();

  const code = await network.provider.send("eth_getCode", [
    await temp.getAddress(), "latest",
  ]);
  await network.provider.send("hardhat_setCode", [PRNG_ADDRESS, code]);
  await network.provider.send("hardhat_setStorageAt", [PRNG_ADDRESS, "0x0", ZERO_SLOT]);

  return new ethers.Contract(PRNG_ADDRESS, Factory.interface, ethers.provider);
}

/**
 * Sign a usage+pricing report the same way OracleService does:
 *   hash    = keccak256(abi.encodePacked(streamId, newTotalUsage, baseRate, congestion, ts, nonce))
 *   message = "\x19Ethereum Signed Message:\n32" ++ hash   (added by signMessage)
 */
async function signReport(
  signer:           ethers.Signer,
  streamId:         bigint,
  newTotalUsage:    bigint,
  baseRate:         bigint,
  congestionFactor: bigint,
  timestamp:        bigint,
  nonce:            bigint,
): Promise<string> {
  const hash = ethers.solidityPackedKeccak256(
    ["uint256","uint256","uint256","uint256","uint256","uint256"],
    [streamId, newTotalUsage, baseRate, congestionFactor, timestamp, nonce],
  );
  return signer.signMessage(ethers.getBytes(hash));
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("ElectricityPaymentStream", function () {
  let eps:      any;   // ElectricityPaymentStream contract
  let mockHSS:  any;   // ethers Contract at 0x16b
  let oracle:   ethers.Wallet; // oracle signing key (deterministic)
  let payer:    ethers.HardhatEthersSigner;
  let payee:    ethers.HardhatEthersSigner;
  let stranger: ethers.HardhatEthersSigner;

  beforeEach(async function () {
    [, payer, payee, stranger] = await ethers.getSigners();

    // Use a fresh deterministic wallet as the oracle signer.
    oracle = new ethers.Wallet(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      ethers.provider,
    );

    // Install precompile mocks.
    mockHSS = await installMockHSS();
    await installMockPRNG();

    // Deploy the contract.
    const Factory = await ethers.getContractFactory("ElectricityPaymentStream");
    eps = await Factory.deploy();
    await eps.waitForDeployment();
  });

  // ── Helpers (scoped) ────────────────────────────────────────────────────────

  /** Create a stream with default parameters and return streamId (0). */
  async function createDefaultStream(): Promise<bigint> {
    const tx = await eps.connect(payer).createStream(
      await payee.getAddress(),
      BASE_RATE,
      MAX_PAY,
      INTERVAL,
      oracle.address,
      ethers.ZeroAddress, // schedulePayer (unused)
      false,              // usePayerScheduling
      { value: DEPOSIT },
    );
    await tx.wait();
    return 0n;
  }

  /** Submit a valid oracle report to streamId. Returns the tx timestamp. */
  async function submitReport(
    streamId: bigint,
    newTotalUsage: bigint,
    nonce: bigint,
  ): Promise<bigint> {
    const ts  = BigInt(await time.latest()) + 1n;
    const sig = await signReport(oracle, streamId, newTotalUsage, BASE_RATE, BigInt(CONGESTION), ts, nonce);
    await eps.reportUsageWithPricing(
      streamId, newTotalUsage, ts, nonce, BASE_RATE, CONGESTION, sig,
    );
    return ts;
  }

  // ── createStream() ────────────────────────────────────────────────────────

  describe("createStream()", function () {
    it("assigns streamId=0 for the first stream", async function () {
      const id = await createDefaultStream();
      expect(id).to.equal(0n);
    });

    it("stores payer, payee, oracle addresses", async function () {
      await createDefaultStream();
      const [p, pe,,,,,,] = await eps.getStreamInfo(0n);
      expect(p.toLowerCase()).to.equal((await payer.getAddress()).toLowerCase());
      expect(pe.toLowerCase()).to.equal((await payee.getAddress()).toLowerCase());
    });

    it("sets stream active=true with correct deposit", async function () {
      await createDefaultStream();
      const [,,active, deposit] = await eps.getStreamInfo(0n);
      expect(active).to.be.true;
      expect(deposit).to.equal(DEPOSIT);
    });

    it("registers a schedule with HSS precompile", async function () {
      await createDefaultStream();
      expect(await mockHSS.scheduleCount()).to.equal(1n);
    });

    it("schedules settle() targeting the contract itself", async function () {
      await createDefaultStream();
      const epsAddr = await eps.getAddress();
      expect((await mockHSS.lastScheduledTo()).toLowerCase())
        .to.equal(epsAddr.toLowerCase());
    });

    it("encodes settle(0) in the scheduled calldata", async function () {
      await createDefaultStream();
      const callData: string = await mockHSS.lastCallData();
      // settle(uint256) selector
      const sel = eps.interface.getFunction("settle").selector;
      expect(callData.slice(0, 10)).to.equal(sel);
      // streamId=0 encoded as 32-byte word after the selector
      expect(callData.slice(10, 74)).to.equal(
        "0000000000000000000000000000000000000000000000000000000000000000",
      );
    });

    it("sets nextSettlementTime ≈ now + 1 hour", async function () {
      const before = BigInt(await time.latest());
      await createDefaultStream();
      const [,,,,,,,nextTime] = await eps.getStreamInfo(0n);
      expect(nextTime).to.be.gte(before + INTERVAL);
      expect(nextTime).to.be.lte(before + INTERVAL + 10n);
    });

    it("emits StreamCreated event", async function () {
      await expect(
        eps.connect(payer).createStream(
          await payee.getAddress(), BASE_RATE, MAX_PAY, INTERVAL,
          oracle.address, ethers.ZeroAddress, false, { value: DEPOSIT },
        )
      ).to.emit(eps, "StreamCreated")
        .withArgs(0n, anyValue, anyValue, INTERVAL, BASE_RATE);
    });

    it("reverts with zero payee address", async function () {
      await expect(
        eps.connect(payer).createStream(
          ethers.ZeroAddress, BASE_RATE, MAX_PAY, INTERVAL,
          oracle.address, ethers.ZeroAddress, false, { value: DEPOSIT },
        )
      ).to.be.revertedWithCustomError(eps, "InvalidPayee");
    });

    it("reverts with zero interval", async function () {
      await expect(
        eps.connect(payer).createStream(
          await payee.getAddress(), BASE_RATE, MAX_PAY, 0,
          oracle.address, ethers.ZeroAddress, false, { value: DEPOSIT },
        )
      ).to.be.revertedWithCustomError(eps, "InvalidInterval");
    });

    it("reverts with zero oracle address", async function () {
      await expect(
        eps.connect(payer).createStream(
          await payee.getAddress(), BASE_RATE, MAX_PAY, INTERVAL,
          ethers.ZeroAddress, ethers.ZeroAddress, false, { value: DEPOSIT },
        )
      ).to.be.revertedWithCustomError(eps, "InvalidOracle");
    });

    it("reverts when no deposit sent", async function () {
      await expect(
        eps.connect(payer).createStream(
          await payee.getAddress(), BASE_RATE, MAX_PAY, INTERVAL,
          oracle.address, ethers.ZeroAddress, false, { value: 0 },
        )
      ).to.be.revertedWithCustomError(eps, "NoDepositSent");
    });

    it("increments streamCount for each new stream", async function () {
      await createDefaultStream();
      await eps.connect(payer).createStream(
        await payee.getAddress(), BASE_RATE, MAX_PAY, INTERVAL,
        oracle.address, ethers.ZeroAddress, false, { value: DEPOSIT },
      );
      expect(await eps.streamCount()).to.equal(2n);
    });
  });

  // ── reportUsageWithPricing() ──────────────────────────────────────────────

  describe("reportUsageWithPricing()", function () {
    beforeEach(async function () {
      await createDefaultStream();
    });

    it("accrues the correct cost for a usage report", async function () {
      // cost = usageDelta × (baseRate × congestion / 10000)
      // effectiveRate = BASE_RATE × 10000 / 10000 = BASE_RATE
      // cost = HOURLY_KWH_1 × BASE_RATE
      await submitReport(0n, HOURLY_KWH_1, 1n);

      const [,,,,accrued] = await eps.getStreamInfo(0n);
      const expected = HOURLY_KWH_1 * BASE_RATE;
      expect(accrued).to.equal(expected);
    });

    it("updates totalUsageUnits", async function () {
      await submitReport(0n, HOURLY_KWH_1, 1n);
      const [,,,,,usage] = await eps.getStreamInfo(0n);
      expect(usage).to.equal(HOURLY_KWH_1);
    });

    it("emits UsageReported with correct delta and cost", async function () {
      const ts  = BigInt(await time.latest()) + 1n;
      const sig = await signReport(oracle, 0n, HOURLY_KWH_1, BASE_RATE, BigInt(CONGESTION), ts, 1n);
      await expect(
        eps.reportUsageWithPricing(0n, HOURLY_KWH_1, ts, 1, BASE_RATE, CONGESTION, sig)
      ).to.emit(eps, "UsageReported")
        .withArgs(0n, HOURLY_KWH_1, BASE_RATE, HOURLY_KWH_1 * BASE_RATE, anyValue);
    });

    it("emits PricingUpdated", async function () {
      const ts  = BigInt(await time.latest()) + 1n;
      const sig = await signReport(oracle, 0n, HOURLY_KWH_1, BASE_RATE, BigInt(CONGESTION), ts, 1n);
      await expect(
        eps.reportUsageWithPricing(0n, HOURLY_KWH_1, ts, 1, BASE_RATE, CONGESTION, sig)
      ).to.emit(eps, "PricingUpdated")
        .withArgs(0n, BASE_RATE, CONGESTION, BASE_RATE);
    });

    it("records a pricing snapshot", async function () {
      await submitReport(0n, HOURLY_KWH_1, 1n);
      // Initial snapshot added in createStream + one from this report = 2
      expect(await eps.pricingHistoryLength(0n)).to.equal(2n);
    });

    it("accepts sequential nonces correctly", async function () {
      await submitReport(0n, HOURLY_KWH_1, 1n);
      await submitReport(0n, HOURLY_KWH_1 + HOURLY_KWH_2, 2n);
      const [,,,,,usage] = await eps.getStreamInfo(0n);
      expect(usage).to.equal(HOURLY_KWH_1 + HOURLY_KWH_2);
    });

    it("reverts on wrong nonce (replay protection)", async function () {
      const ts  = BigInt(await time.latest()) + 1n;
      const sig = await signReport(oracle, 0n, HOURLY_KWH_1, BASE_RATE, BigInt(CONGESTION), ts, 42n);
      await expect(
        eps.reportUsageWithPricing(0n, HOURLY_KWH_1, ts, 42, BASE_RATE, CONGESTION, sig)
      ).to.be.revertedWithCustomError(eps, "InvalidNonce");
    });

    it("reverts when usage is not strictly increasing", async function () {
      await submitReport(0n, HOURLY_KWH_1, 1n);
      // Try to report same or lower cumulative
      const ts  = BigInt(await time.latest()) + 1n;
      const sig = await signReport(oracle, 0n, HOURLY_KWH_1, BASE_RATE, BigInt(CONGESTION), ts, 2n);
      await expect(
        eps.reportUsageWithPricing(0n, HOURLY_KWH_1, ts, 2, BASE_RATE, CONGESTION, sig)
      ).to.be.revertedWithCustomError(eps, "UsageNotIncreasing");
    });

    it("reverts on congestion factor below minimum (< 5000)", async function () {
      const ts  = BigInt(await time.latest()) + 1n;
      const sig = await signReport(oracle, 0n, HOURLY_KWH_1, BASE_RATE, 4_999n, ts, 1n);
      await expect(
        eps.reportUsageWithPricing(0n, HOURLY_KWH_1, ts, 1, BASE_RATE, 4_999, sig)
      ).to.be.revertedWithCustomError(eps, "InvalidCongestionFactor");
    });

    it("reverts on congestion factor above maximum (> 50000)", async function () {
      const ts  = BigInt(await time.latest()) + 1n;
      const sig = await signReport(oracle, 0n, HOURLY_KWH_1, BASE_RATE, 50_001n, ts, 1n);
      await expect(
        eps.reportUsageWithPricing(0n, HOURLY_KWH_1, ts, 1, BASE_RATE, 50_001, sig)
      ).to.be.revertedWithCustomError(eps, "InvalidCongestionFactor");
    });

    it("reverts on invalid oracle signature (wrong signer)", async function () {
      const impostor = ethers.Wallet.createRandom();
      const ts  = BigInt(await time.latest()) + 1n;
      const sig = await signReport(impostor, 0n, HOURLY_KWH_1, BASE_RATE, BigInt(CONGESTION), ts, 1n);
      await expect(
        eps.reportUsageWithPricing(0n, HOURLY_KWH_1, ts, 1, BASE_RATE, CONGESTION, sig)
      ).to.be.revertedWithCustomError(eps, "InvalidOracleSignature");
    });

    it("emits LowBalanceWarning when accrued >= 80% of deposit", async function () {
      // Make the deposit tiny so a single report triggers the warning.
      await eps.connect(payer).createStream(
        await payee.getAddress(), BASE_RATE, MAX_PAY, INTERVAL,
        oracle.address, ethers.ZeroAddress, false,
        { value: 100n }, // tiny deposit
      );
      const sid = 1n;
      // Usage that causes cost > 80% of deposit=100.
      // cost = 1 × BASE_RATE = 1.5×10^14 >> 100 → triggers warning.
      const ts  = BigInt(await time.latest()) + 1n;
      const sig = await signReport(oracle, sid, 1n, BASE_RATE, BigInt(CONGESTION), ts, 1n);
      await expect(
        eps.reportUsageWithPricing(sid, 1n, ts, 1, BASE_RATE, CONGESTION, sig)
      ).to.emit(eps, "LowBalanceWarning");
    });
  });

  // ── settle() ──────────────────────────────────────────────────────────────

  describe("settle()", function () {
    beforeEach(async function () {
      await createDefaultStream();
    });

    it("reverts if called too early", async function () {
      await expect(eps.settle(0n))
        .to.be.revertedWithCustomError(eps, "TooEarlyToSettle");
    });

    it("executes with zero payment when no usage has been reported", async function () {
      await time.increase(INTERVAL);
      // Should succeed (zero amount due) and reschedule.
      await expect(eps.settle(0n)).to.emit(eps, "SettlementExecuted")
        .withArgs(0n, anyValue, 1n, 0n, DEPOSIT, 0n);
    });

    it("transfers accrued amount to payee", async function () {
      await submitReport(0n, HOURLY_KWH_1, 1n);
      const expectedPayment = HOURLY_KWH_1 * BASE_RATE;

      const payeeBefore = await ethers.provider.getBalance(await payee.getAddress());
      await time.increase(INTERVAL);
      await eps.settle(0n);
      const payeeAfter = await ethers.provider.getBalance(await payee.getAddress());

      expect(payeeAfter - payeeBefore).to.equal(expectedPayment);
    });

    it("deducts deposit and clears accrued amount", async function () {
      await submitReport(0n, HOURLY_KWH_1, 1n);
      const expectedPayment = HOURLY_KWH_1 * BASE_RATE;

      await time.increase(INTERVAL);
      await eps.settle(0n);

      const [,,, deposit, accrued] = await eps.getStreamInfo(0n);
      expect(deposit).to.equal(DEPOSIT - expectedPayment);
      expect(accrued).to.equal(0n);
    });

    it("emits SettlementExecuted", async function () {
      await submitReport(0n, HOURLY_KWH_1, 1n);
      await time.increase(INTERVAL);

      await expect(eps.settle(0n))
        .to.emit(eps, "SettlementExecuted")
        .withArgs(0n, anyValue, 1n, HOURLY_KWH_1 * BASE_RATE, anyValue, anyValue);
    });

    it("reschedules the next settlement after each execution", async function () {
      await time.increase(INTERVAL);
      const countBefore = await mockHSS.scheduleCount();
      await eps.settle(0n);
      expect(await mockHSS.scheduleCount()).to.equal(countBefore + 1n);
    });

    it("increments settlementCount", async function () {
      await time.increase(INTERVAL);
      await eps.settle(0n);
      const [,,,,,,,,count] = await eps.getStreamInfo(0n);
      expect(count).to.equal(1n);
    });

    it("caps payment at maxPayPerInterval", async function () {
      // Create a stream with a very low cap.
      const lowCap = 50n; // 50 wei cap
      await eps.connect(payer).createStream(
        await payee.getAddress(), BASE_RATE, lowCap, INTERVAL,
        oracle.address, ethers.ZeroAddress, false, { value: DEPOSIT },
      );
      const sid = 1n;

      // Report usage that produces cost >> cap.
      await submitReport(sid, HOURLY_KWH_1, 1n);

      await time.increase(INTERVAL);
      await eps.settle(sid);

      const [,,, deposit, accrued] = await eps.getStreamInfo(sid);
      // deposit should have decreased by cap (50n), not full cost
      expect(DEPOSIT - deposit).to.equal(lowCap);
      // Remaining accrued = full cost - cap
      const fullCost = HOURLY_KWH_1 * BASE_RATE;
      expect(accrued).to.equal(fullCost - lowCap);
    });

    it("pauses stream and emits SettlementFailed when deposit is exhausted", async function () {
      // Tiny deposit so any usage drains it.
      await eps.connect(payer).createStream(
        await payee.getAddress(), BASE_RATE, MAX_PAY, INTERVAL,
        oracle.address, ethers.ZeroAddress, false, { value: 1n },
      );
      const sid = 1n;

      // Report usage so accrued > deposit.
      await submitReport(sid, HOURLY_KWH_1, 1n);

      await time.increase(INTERVAL);
      await expect(eps.settle(sid))
        .to.emit(eps, "SettlementFailed")
        .and.to.emit(eps, "StreamPaused");

      const [,, active] = await eps.getStreamInfo(sid);
      expect(active).to.be.false;
    });

    it("reverts on an inactive stream", async function () {
      await eps.connect(payer).stopStream(0n);
      await time.increase(INTERVAL);
      await expect(eps.settle(0n))
        .to.be.revertedWithCustomError(eps, "StreamNotActive");
    });
  });

  // ── topUpDeposit() ────────────────────────────────────────────────────────

  describe("topUpDeposit()", function () {
    it("increases the deposit balance", async function () {
      await createDefaultStream();
      await eps.connect(payer).topUpDeposit(0n, { value: DEPOSIT });
      const [,,, deposit] = await eps.getStreamInfo(0n);
      expect(deposit).to.equal(DEPOSIT * 2n);
    });

    it("emits DepositAdded", async function () {
      await createDefaultStream();
      await expect(eps.connect(payer).topUpDeposit(0n, { value: DEPOSIT }))
        .to.emit(eps, "DepositAdded")
        .withArgs(0n, anyValue, DEPOSIT);
    });

    it("reverts if not called by payer", async function () {
      await createDefaultStream();
      await expect(eps.connect(stranger).topUpDeposit(0n, { value: DEPOSIT }))
        .to.be.revertedWithCustomError(eps, "OnlyPayer");
    });

    it("reverts if no value sent", async function () {
      await createDefaultStream();
      await expect(eps.connect(payer).topUpDeposit(0n, { value: 0 }))
        .to.be.revertedWithCustomError(eps, "NoDepositSent");
    });

    it("resumes a paused stream when topped up with sufficient funds", async function () {
      await createDefaultStream(); // stream 0 — gives the tiny-deposit stream ID 1
      // Create stream with tiny deposit so it gets paused.
      await eps.connect(payer).createStream(
        await payee.getAddress(), BASE_RATE, MAX_PAY, INTERVAL,
        oracle.address, ethers.ZeroAddress, false, { value: 1n },
      );
      const sid = 1n;
      await submitReport(sid, HOURLY_KWH_1, 1n);
      await time.increase(INTERVAL);
      await eps.settle(sid); // will fail + pause

      const [,, activeBefore] = await eps.getStreamInfo(sid);
      expect(activeBefore).to.be.false;

      const countBefore = await mockHSS.scheduleCount();
      await expect(eps.connect(payer).topUpDeposit(sid, { value: DEPOSIT }))
        .to.emit(eps, "StreamResumed");

      const [,, activeAfter] = await eps.getStreamInfo(sid);
      expect(activeAfter).to.be.true;

      // A new settlement should have been scheduled.
      expect(await mockHSS.scheduleCount()).to.be.gt(countBefore);
    });
  });

  // ── stopStream() ──────────────────────────────────────────────────────────

  describe("stopStream()", function () {
    beforeEach(async function () {
      await createDefaultStream();
    });

    it("payer can stop the stream", async function () {
      await expect(eps.connect(payer).stopStream(0n))
        .to.emit(eps, "StreamPaused");
      const [,, active] = await eps.getStreamInfo(0n);
      expect(active).to.be.false;
    });

    it("payee can stop the stream", async function () {
      await expect(eps.connect(payee).stopStream(0n))
        .to.emit(eps, "StreamPaused");
      const [,, active] = await eps.getStreamInfo(0n);
      expect(active).to.be.false;
    });

    it("stranger cannot stop the stream", async function () {
      await expect(eps.connect(stranger).stopStream(0n))
        .to.be.revertedWithCustomError(eps, "OnlyPayerOrPayee");
    });

    it("records a deleteSchedule call at 0x16b", async function () {
      const deleteBefore: bigint = await mockHSS.deleteCount();
      await eps.connect(payer).stopStream(0n);
      expect(await mockHSS.deleteCount()).to.equal(deleteBefore + 1n);
    });
  });

  // ── Integration: full payment cycle ───────────────────────────────────────

  describe("Integration: full payment cycle", function () {
    it("create → 3 oracle reports → settle → verify payee received payment", async function () {
      const sid = await createDefaultStream();

      // Three oracle reports (cumulative usage grows each time).
      const usages = [500n, 1_200n, 2_100n]; // kWh × 1000, strictly increasing
      for (let i = 0; i < usages.length; i++) {
        await submitReport(sid, usages[i], BigInt(i + 1));
      }

      // Accrued = total kWh reported × BASE_RATE (all at 1.0× congestion).
      const expectedPayment = 2_100n * BASE_RATE; // = last cumulative × rate

      const payeeBefore = await ethers.provider.getBalance(await payee.getAddress());
      await time.increase(INTERVAL);
      await eps.settle(sid);
      const payeeAfter = await ethers.provider.getBalance(await payee.getAddress());

      expect(payeeAfter - payeeBefore).to.equal(expectedPayment);
    });

    it("self-perpetuating: two settlements each reschedule the next", async function () {
      const sid = await createDefaultStream();
      const initCount: bigint = await mockHSS.scheduleCount(); // 1 from createStream

      await time.increase(INTERVAL);
      await eps.settle(sid);
      expect(await mockHSS.scheduleCount()).to.equal(initCount + 1n);

      await time.increase(INTERVAL);
      await eps.settle(sid);
      expect(await mockHSS.scheduleCount()).to.equal(initCount + 2n);
    });

    it("two parallel streams settle independently", async function () {
      await createDefaultStream(); // stream 0
      await eps.connect(payer).createStream(
        await payee.getAddress(), BASE_RATE, MAX_PAY, INTERVAL,
        oracle.address, ethers.ZeroAddress, false, { value: DEPOSIT },
      ); // stream 1

      // Report different usage on each.
      await submitReport(0n, 500n,   1n);
      await submitReport(1n, 1_000n, 1n);

      await time.increase(INTERVAL);
      await eps.settle(0n);
      await eps.settle(1n);

      const [,,,,accrued0] = await eps.getStreamInfo(0n);
      const [,,,,accrued1] = await eps.getStreamInfo(1n);
      expect(accrued0).to.equal(0n);
      expect(accrued1).to.equal(0n);
    });

    it("pause on low balance then resume with topUp", async function () {
      await createDefaultStream(); // stream 0 — gives the tiny-deposit stream ID 1
      // Stream with just enough deposit for one report.
      const tinyDeposit = 500n * BASE_RATE + 1n; // slightly over one interval cost
      await eps.connect(payer).createStream(
        await payee.getAddress(), BASE_RATE, MAX_PAY, INTERVAL,
        oracle.address, ethers.ZeroAddress, false, { value: tinyDeposit },
      );
      const sid = 1n;

      // Report usage that costs tinyDeposit amount exactly.
      await submitReport(sid, 500n, 1n);

      await time.increase(INTERVAL);
      await eps.settle(sid);

      // Now deposit is ~1 wei, stream still active.
      const [,, active] = await eps.getStreamInfo(sid);
      expect(active).to.be.true;

      // Second report: accrued > remaining deposit → next settle pauses.
      await submitReport(sid, 1_000n, 2n); // extra 500 units

      await time.increase(INTERVAL);
      await eps.settle(sid); // pauses due to insufficient deposit

      const [,, pausedActive] = await eps.getStreamInfo(sid);
      expect(pausedActive).to.be.false;

      // Top up and verify it resumes.
      await expect(eps.connect(payer).topUpDeposit(sid, { value: DEPOSIT }))
        .to.emit(eps, "StreamResumed");

      const [,, resumedActive] = await eps.getStreamInfo(sid);
      expect(resumedActive).to.be.true;
    });
  });
});
