/**
 * Oracle runner for ElectricityPaymentStream on Hedera Testnet.
 *
 * Start:  npm run start:oracle
 * Stops:  Ctrl-C
 *
 * Reads deployment config from scripts/deployment.json and runs the
 * OracleService loop, submitting usage+pricing reports every 5 minutes.
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

import { OracleService } from './oracleService';

const RPC_URL = 'https://testnet.hashio.io/api';

// Minimal ABI — only what OracleService needs.
const ABI = [
  // Read stream info (active, totalUsageUnits)
  'function getStreamInfo(uint256 streamId) external view returns (address payer, address payee, bool active, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, uint256 lastSettlementTime, uint256 nextSettlementTime, uint256 settlementCount)',

  // Read oracle nonce from the streams mapping
  'function streams(uint256) external view returns (uint256 streamId, address payer, address payee, uint256 baseRatePerUnit, uint256 maxPayPerInterval, uint256 settlementIntervalSecs, address authorizedOracle, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, bool active, uint256 lastSettlementTime, uint256 settlementCount, address lastScheduleAddress, uint256 nextSettlementTime, address schedulePayer, bool usePayerScheduling, uint256 oracleNonce)',

  // Submit usage report
  'function reportUsageWithPricing(uint256 streamId, uint256 newTotalUsage, uint256 timestamp_, uint256 nonce, uint256 baseRate, uint256 congestionFactor, bytes calldata signature) external',

  // Events (for logging)
  'event UsageReported(uint256 indexed streamId, uint256 deltaUsage, uint256 effectiveRate, uint256 cost, uint256 totalAccrued)',
];

async function main(): Promise<void> {
  const deploymentPath = path.resolve('scripts/deployment.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error('[Oracle] scripts/deployment.json not found. Run the deploy script first.');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const streamId   = Number(deployment.activeStreamId ?? 1);

  if (!process.env.ORACLE_PRIVATE_KEY) {
    console.error('[Oracle] ORACLE_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  console.log('[Oracle] Contract :', deployment.epsAddr);
  console.log('[Oracle] Stream ID :', streamId);
  console.log('[Oracle] Network   : Hedera Testnet (hashio.io)');
  console.log('[Oracle] Interval  : every 5 minutes');
  console.log('');

  const service = new OracleService(
    RPC_URL,
    process.env.ORACLE_PRIVATE_KEY,
    deployment.epsAddr,
    ABI,
  );

  await service.addStream(streamId);
  service.start();

  // Keep the process alive; Ctrl-C to stop.
  process.on('SIGINT', () => {
    console.log('\n[Oracle] Received SIGINT — shutting down.');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('\n[Oracle] Received SIGTERM — shutting down.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Oracle] Fatal error:', err);
  process.exit(1);
});
