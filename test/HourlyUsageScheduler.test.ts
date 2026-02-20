import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

const HSS_ADDRESS = "0x000000000000000000000000000000000000016b";
const HOUR = 3_600n; // bigint for ethers v6 comparisons
const ZERO_SLOT = "0x0000000000000000000000000000000000000000000000000000000000000000";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Deploy MockHSSPrecompile, copy its bytecode to the Hedera precompile address
 * (0x16b), reset all storage slots to zero, and return an ethers Contract
 * pointed at 0x16b with the mock's ABI for state inspection.
 *
 * NOTE: hardhat_setCode only installs code — it does NOT clear storage.
 *       Storage at 0x16b persists across beforeEach calls, so we must
 *       explicitly zero every slot that MockHSSPrecompile uses:
 *         slot 0: lastScheduledTo, slot 1: lastExpirySecond,
 *         slot 2: lastGasLimit,    slot 3: lastValue,
 *         slot 4: lastCallData (length word), slot 5: scheduleCount
 */
async function installMockHSS() {
  const Factory = await ethers.getContractFactory("MockHSSPrecompile");
  const temp = await Factory.deploy();
  await temp.waitForDeployment();

  const code = await network.provider.send("eth_getCode", [
    await temp.getAddress(),
    "latest",
  ]);
  await network.provider.send("hardhat_setCode", [HSS_ADDRESS, code]);

  // Reset every storage slot used by MockHSSPrecompile.
  for (let slot = 0; slot <= 5; slot++) {
    await network.provider.send("hardhat_setStorageAt", [
      HSS_ADDRESS,
      "0x" + slot.toString(16),
      ZERO_SLOT,
    ]);
  }

  // Return a contract handle at the precompile address for state inspection.
  return new ethers.Contract(HSS_ADDRESS, Factory.interface, ethers.provider);
}

/**
 * Returns the next UTC timestamp (in seconds) where the hour-of-day equals
 * targetHour, starting strictly after currentTs.
 */
function nextTimestampAtHour(currentTs: number, targetHour: number): number {
  const secondsPerDay = 86_400;
  const dayStart = Math.floor(currentTs / secondsPerDay) * secondsPerDay;
  let candidate = dayStart + targetHour * 3_600;
  if (candidate <= currentTs) candidate += secondsPerDay;
  return candidate;
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe("HourlyUsageScheduler", function () {
  let oracle: any;
  let scheduler: any;
  let mockHSS: any; // ethers Contract at 0x16b

  beforeEach(async function () {
    const [deployer] = await ethers.getSigners();

    // 1. Install mock HSS precompile at 0x16b.
    mockHSS = await installMockHSS();

    // 2. Deploy MockElectricityOracle (deployer is the oracle operator).
    const OracleFactory = await ethers.getContractFactory("MockElectricityOracle");
    oracle = await OracleFactory.deploy(deployer.address);
    await oracle.waitForDeployment();

    // 3. Deploy HourlyUsageScheduler pointing at the oracle.
    const SchedulerFactory = await ethers.getContractFactory("HourlyUsageScheduler");
    scheduler = await SchedulerFactory.deploy(await oracle.getAddress());
    await scheduler.waitForDeployment();
  });

  // ── Constructor ────────────────────────────────────────────────────────────

  describe("constructor", function () {
    it("stores the oracle address", async function () {
      expect(await scheduler.oracle()).to.equal(await oracle.getAddress());
    });

    it("reverts with zero oracle address", async function () {
      const SchedulerFactory = await ethers.getContractFactory("HourlyUsageScheduler");
      await expect(
        SchedulerFactory.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("HourlyUsageScheduler: zero oracle");
    });

    it("initialises lastFetchedRoundId to 0", async function () {
      expect(await scheduler.lastFetchedRoundId()).to.equal(0n);
    });
  });

  // ── bootstrapSchedule() ────────────────────────────────────────────────────

  describe("bootstrapSchedule()", function () {
    it("registers a schedule with the HSS precompile", async function () {
      await scheduler.bootstrapSchedule();
      expect(await mockHSS.scheduleCount()).to.equal(1n);
    });

    it("sets activeSchedule to a non-zero address", async function () {
      await scheduler.bootstrapSchedule();
      const active = await scheduler.activeSchedule();
      expect(active).to.not.equal(ethers.ZeroAddress);
    });

    it("targets this contract in the scheduled call", async function () {
      await scheduler.bootstrapSchedule();
      const schedulerAddr = await scheduler.getAddress();
      expect((await mockHSS.lastScheduledTo()).toLowerCase()).to.equal(
        schedulerAddr.toLowerCase()
      );
    });

    it("sets expiry to block.timestamp + 1 hour", async function () {
      const before = BigInt(await time.latest());
      await scheduler.bootstrapSchedule();
      const expiry: bigint = await mockHSS.lastExpirySecond();
      expect(expiry).to.be.gte(before + HOUR);
      expect(expiry).to.be.lte(before + HOUR + 10n); // allow small block-time delta
    });

    it("encodes fetchAndStoreUsage() in the scheduled calldata", async function () {
      await scheduler.bootstrapSchedule();
      const callData: string = await mockHSS.lastCallData();
      const expectedSelector: string =
        scheduler.interface.getFunction("fetchAndStoreUsage").selector;
      // First 4 bytes (0x + 8 hex chars) must match the selector.
      expect(callData.slice(0, 10)).to.equal(expectedSelector);
    });

    it("emits HourlyUpdateScheduled with a non-zero address and future expiry", async function () {
      const before = BigInt(await time.latest());
      await expect(scheduler.bootstrapSchedule())
        .to.emit(scheduler, "HourlyUpdateScheduled")
        .withArgs(anyValue, anyValue);

      // Also verify the expiry captured by the mock is in the future.
      const expiry: bigint = await mockHSS.lastExpirySecond();
      expect(expiry).to.be.gt(before);
    });
  });

  // ── fetchAndStoreUsage() ───────────────────────────────────────────────────

  describe("fetchAndStoreUsage()", function () {
    it("reverts OracleNoData when oracle has never been written to", async function () {
      await expect(scheduler.fetchAndStoreUsage()).to.be.revertedWithCustomError(
        scheduler,
        "OracleNoData"
      );
    });

    it("stores the latest hourly kWh from the oracle", async function () {
      const hourlyKWh = 750n; // 0.750 kWh, scaled × 1000
      await oracle.updateReading(5_000n, hourlyKWh);
      await scheduler.fetchAndStoreUsage();

      const [storedKWh] = await scheduler.getLatestKWh();
      expect(storedKWh).to.equal(hourlyKWh);
    });

    it("stores the oracle round ID", async function () {
      await oracle.updateReading(5_000n, 750n);
      await scheduler.fetchAndStoreUsage();
      expect(await scheduler.lastFetchedRoundId()).to.equal(1n);
    });

    it("stores a non-zero lastFetchTimestamp", async function () {
      await oracle.updateReading(5_000n, 750n);
      await scheduler.fetchAndStoreUsage();
      const [, ts] = await scheduler.getLatestKWh();
      expect(ts).to.be.gt(0n);
    });

    it("emits UsageFetched with correct roundId and kWh", async function () {
      const hourlyKWh = 1_200n; // 1.200 kWh
      await oracle.updateReading(10_000n, hourlyKWh);
      await expect(scheduler.fetchAndStoreUsage())
        .to.emit(scheduler, "UsageFetched")
        .withArgs(1n, hourlyKWh, anyValue);
    });

    it("schedules the next hourly update after fetching", async function () {
      const before = BigInt(await time.latest());
      await oracle.updateReading(5_000n, 750n);
      await scheduler.fetchAndStoreUsage();

      // HSS precompile should have been called exactly once.
      expect(await mockHSS.scheduleCount()).to.equal(1n);

      // Expiry should be one hour from now.
      const expiry: bigint = await mockHSS.lastExpirySecond();
      expect(expiry).to.be.gte(before + HOUR);
    });

    it("emits HourlyUpdateScheduled after fetching", async function () {
      await oracle.updateReading(5_000n, 750n);
      await expect(scheduler.fetchAndStoreUsage())
        .to.emit(scheduler, "HourlyUpdateScheduled");
    });

    it("updates activeSchedule after fetching", async function () {
      await oracle.updateReading(5_000n, 750n);
      await scheduler.fetchAndStoreUsage();
      const active = await scheduler.activeSchedule();
      expect(active).to.not.equal(ethers.ZeroAddress);
    });

    // ── Multi-round behaviour ────────────────────────────────────────────────

    it("correctly stores updated kWh across multiple oracle rounds", async function () {
      // Round 1 — 0.750 kWh
      await oracle.updateReading(5_000n, 750n);
      await scheduler.fetchAndStoreUsage();
      expect(await scheduler.lastFetchedRoundId()).to.equal(1n);

      // Round 2 — 1.200 kWh (cumulative must be strictly increasing)
      await oracle.updateReading(6_200n, 1_200n);
      await scheduler.fetchAndStoreUsage();
      expect(await scheduler.lastFetchedRoundId()).to.equal(2n);

      const [kWh] = await scheduler.getLatestKWh();
      expect(kWh).to.equal(1_200n);
    });

    it("increments the HSS schedule count on each call", async function () {
      await oracle.updateReading(5_000n, 750n);
      await scheduler.fetchAndStoreUsage();
      expect(await mockHSS.scheduleCount()).to.equal(1n);

      await oracle.updateReading(6_200n, 800n);
      await scheduler.fetchAndStoreUsage();
      expect(await mockHSS.scheduleCount()).to.equal(2n);
    });

    it("schedules a new unique address each hour", async function () {
      await oracle.updateReading(5_000n, 750n);
      await scheduler.fetchAndStoreUsage();
      const first = await scheduler.activeSchedule();

      // Advance time 1 hour so the next schedule gets a different timestamp.
      await time.increase(HOUR);

      await oracle.updateReading(6_200n, 800n);
      await scheduler.fetchAndStoreUsage();
      const second = await scheduler.activeSchedule();

      expect(first).to.not.equal(second);
    });

    // ── Time-of-day usage periods ────────────────────────────────────────────

    it("stores LOW-period kWh correctly (night hours)", async function () {
      // Warp to the next 02:00 UTC (LOW period: 00:00–06:00).
      const twoAM = nextTimestampAtHour(await time.latest(), 2);
      await time.setNextBlockTimestamp(twoAM);

      await oracle.updateReading(5_000n, 350n); // 0.350 kWh — typical LOW
      await scheduler.fetchAndStoreUsage();

      const [kWh] = await scheduler.getLatestKWh();
      expect(kWh).to.equal(350n);
    });

    it("stores HIGH-period kWh correctly (peak hours)", async function () {
      // Warp to the next 19:00 UTC (HIGH period: 17:00–22:00).
      const sevenPM = nextTimestampAtHour(await time.latest(), 19);
      await time.setNextBlockTimestamp(sevenPM);

      await oracle.updateReading(8_000n, 1_700n); // 1.700 kWh — typical HIGH
      await scheduler.fetchAndStoreUsage();

      const [kWh] = await scheduler.getLatestKWh();
      expect(kWh).to.equal(1_700n);
    });
  });

  // ── Integration: bootstrap → fetch chain ──────────────────────────────────

  describe("Integration: self-perpetuating hourly chain", function () {
    it("bootstrap + two hourly fetches create three schedules total", async function () {
      // Bootstrap kick-off.
      await scheduler.bootstrapSchedule();
      expect(await mockHSS.scheduleCount()).to.equal(1n);

      await oracle.updateReading(5_000n, 750n);
      await time.increase(HOUR);

      // Simulate HSS executing the first scheduled fetchAndStoreUsage.
      await scheduler.fetchAndStoreUsage();
      expect(await mockHSS.scheduleCount()).to.equal(2n);

      await oracle.updateReading(6_200n, 900n);
      await time.increase(HOUR);

      // Simulate HSS executing the second scheduled fetchAndStoreUsage.
      await scheduler.fetchAndStoreUsage();
      expect(await mockHSS.scheduleCount()).to.equal(3n);

      // Final kWh stored is from the last oracle reading.
      const [kWh] = await scheduler.getLatestKWh();
      expect(kWh).to.equal(900n);
    });
  });
});
