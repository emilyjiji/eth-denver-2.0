/**
 * Base → Hedera Relay
 *
 * Listens for POST /fund-stream requests from the frontend after a successful
 * Uniswap swap on Base. Converts the USDC amount to an equivalent HBAR value
 * and calls topUpDeposit() on the ElectricityPaymentStream contract on Hedera.
 *
 * Run:
 *   ts-node relay/baseToHedera.ts
 *
 * Requires in .env:
 *   RELAY_PRIVATE_KEY  — Hedera wallet private key (needs funded HBAR balance)
 *   HEDERA_STREAM_ADDRESS — ElectricityPaymentStream contract address
 *   STREAM_ID (optional) — default stream to top up (default: 3)
 *   PORT (optional)    — server port (default: 3001)
 */

import * as http from "http";
import * as fs from "fs";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";

const LOG_FILE = "/tmp/swap-debug.log";
fs.writeFileSync(LOG_FILE, `=== relay started ${new Date().toISOString()} ===\n`);
dotenv.config({ path: path.resolve(__dirname, "../frontend/my-app/.env.local") });

// ── Config ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3001");
const HEDERA_RPC = process.env.HEDERA_RPC || "https://testnet.hashio.io/api";
const CONTRACT_ADDRESS =
  process.env.HEDERA_STREAM_ADDRESS || "0xc4A1Ef40bC4771D8c2f5352429A737a980B40692";
const PRIVATE_KEY =
  process.env.RELAY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "";
const DEFAULT_STREAM_ID = process.env.STREAM_ID || "3";

// Only the function we need
const TOP_UP_ABI = [
  "function topUpDeposit(uint256 streamId) external payable",
  "function getStreamInfo(uint256 streamId) external view returns (uint256,address,bool,uint256,uint256,uint256,uint256,uint256,uint256,address,uint256)",
];

// ── Logging ──────────────────────────────────────────────────────────────────

function rlog(msg: string) {
  const line = `[${new Date().toISOString()}] [relay] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getHbarPriceUsd(): Promise<number> {
  const fallback = parseFloat(process.env.HBAR_USD_PRICE || "0.05");
  try {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd";
    const res = await fetch(url);
    if (!res.ok) throw new Error("CoinGecko fetch failed");
    const data = (await res.json()) as Record<string, { usd: number }>;
    return data["hedera-hashgraph"].usd;
  } catch (e) {
    rlog(`CoinGecko unavailable, using fallback price $${fallback}`);
    return fallback;
  }
}

/** Convert raw USDC units (6 decimals) to HBAR using live price. */
function usdcToHbar(rawUsdc: string, hbarPriceUsd: number): number {
  const usdcValue = Number(BigInt(rawUsdc)) / 1e6;
  return usdcValue / hbarPriceUsd;
}

function cors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ── Route handler ────────────────────────────────────────────────────────────

async function handleFundStream(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  let body: { swapTxHash?: string; usdcAmount?: string; streamId?: string };
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { success: false, error: "Invalid JSON body" });
  }

  const { swapTxHash, usdcAmount, streamId } = body;

  if (!usdcAmount) {
    return json(res, 400, { success: false, error: "usdcAmount is required" });
  }

  if (!PRIVATE_KEY) {
    return json(res, 500, {
      success: false,
      error: "RELAY_PRIVATE_KEY not set — cannot sign Hedera transaction",
    });
  }

  try {
    rlog(`New fund-stream request`);
    rlog(`  swapTxHash : ${swapTxHash ?? "n/a"}`);
    rlog(`  usdcAmount : ${usdcAmount} (raw 6-decimal USDC units)`);
    rlog(`  streamId   : ${streamId ?? DEFAULT_STREAM_ID}`);

    // 1. Get live HBAR price
    const hbarPrice = await getHbarPriceUsd();
    rlog(`  HBAR price : $${hbarPrice}`);

    // 2. Calculate HBAR equivalent
    const targetStreamId = streamId ?? DEFAULT_STREAM_ID;
    const hbarAmount = usdcToHbar(usdcAmount, hbarPrice);
    const hbarWei = ethers.parseEther(hbarAmount.toFixed(8));
    const usdcValue = (Number(BigInt(usdcAmount)) / 1e6).toFixed(2);

    rlog(`  hbarAmount : ${hbarAmount.toFixed(4)} HBAR`);
    rlog(`  hbarWei    : ${hbarWei.toString()}`);

    // 3. Connect to Hedera and call topUpDeposit
    const provider = new ethers.JsonRpcProvider(HEDERA_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, TOP_UP_ABI, wallet);

    rlog(`  relay addr : ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    rlog(`  relay bal  : ${ethers.formatEther(balance)} HBAR`);

    const tx = await contract.topUpDeposit(BigInt(targetStreamId), {
      value: hbarWei,
    });
    rlog(`  hedera tx  : ${tx.hash}`);
    const receipt = await tx.wait();
    rlog(`  confirmed  : block ${receipt?.blockNumber}`);

    return json(res, 200, {
      success: true,
      hederaTxHash: receipt?.hash ?? tx.hash,
      hbarAmount: hbarAmount.toFixed(4),
      usdcValue,
      streamId: targetStreamId,
      hashscanUrl: `https://hashscan.io/testnet/transaction/${receipt?.hash ?? tx.hash}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[relay] Error: ${msg}`);
    return json(res, 500, { success: false, error: msg });
  }
}

// ── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/fund-stream") {
    return handleFundStream(req, res);
  }

  if (req.method === "POST" && req.url === "/log") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      try {
        const { msg } = JSON.parse(body);
        const line = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(LOG_FILE, line);
      } catch {}
      cors(res);
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { status: "ok", relay: "baseToHedera" });
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`[relay] Base → Hedera relay listening on http://localhost:${PORT}`);
  console.log(`[relay] Hedera RPC    : ${HEDERA_RPC}`);
  console.log(`[relay] Contract      : ${CONTRACT_ADDRESS}`);
  console.log(`[relay] Default stream: ${DEFAULT_STREAM_ID}`);
  if (!PRIVATE_KEY) {
    console.warn("[relay] WARNING: RELAY_PRIVATE_KEY not set — /fund-stream will fail");
  }
});
