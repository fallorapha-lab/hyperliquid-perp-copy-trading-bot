import { readFile } from "node:fs/promises";
import type { InfoClient } from "@nktkas/hyperliquid";
import type { AppConfig } from "../config.js";
import { PaperPortfolio } from "../paper/portfolio.js";
import { loadPaperPortfolio, savePaperPortfolio } from "../paper/stateFile.js";
import { appendPaperLog, resolvePaperLogPath } from "../paper/paperLogger.js";
import { AssetRegistry, formatSize } from "../assetRegistry.js";

async function getPortfolio(config: AppConfig): Promise<PaperPortfolio> {
  const initial = config.paperInitialUsd;
  return loadPaperPortfolio(config.paperStateFile, initial);
}

export async function paperStatus(info: InfoClient, config: AppConfig): Promise<void> {
  const reg = await AssetRegistry.fromInfoClient(info);
  const dec = reg.get(config.coin).szDecimals;
  const p = await getPortfolio(config);
  const mids = await info.allMids();
  const coin = config.coin;
  const mid = mids[coin];
  const eq = p.equity(mids);
  const pos = p.state.positions[coin];
  console.log(`Paper trading | ${config.isTestnet ? "testnet" : "mainnet"} | state: ${config.paperStateFile}`);
  if (config.paperLogEnabled) {
    console.log(`Paper log file: ${config.paperLogFile} (show: npm run dev -- paper logs)`);
  }
  console.log(`Cash USD: ${p.state.cashUsd.toFixed(2)}`);
  console.log(`${coin} mid: ${mid ?? "?"}`);
  if (pos && mid !== undefined) {
    const u = p.unrealizedPnlUsd(coin, Number(mid));
    console.log(
      `Position: ${formatSize(pos.qty, dec)} @ avg ${pos.avgEntry.toFixed(2)} | uPnL: ${u.toFixed(2)} USD`,
    );
  } else {
    console.log("Position: flat");
  }
  console.log(`Equity (mark): ${eq.toFixed(2)} USD`);

  const logPath = resolvePaperLogPath(config);
  if (logPath && config.paperLogStatus) {
    await appendPaperLog(logPath, {
      kind: "paper_status",
      network: config.isTestnet ? "testnet" : "mainnet",
      coin,
      mid: mid ?? null,
      cashUsd: p.state.cashUsd,
      equityUsd: eq,
      positionQty: pos?.qty ?? 0,
      avgEntry: pos?.avgEntry ?? null,
      unrealizedPnlUsd:
        pos && mid !== undefined ? p.unrealizedPnlUsd(coin, Number(mid)) : null,
    });
  }
}

export async function paperReset(config: AppConfig): Promise<void> {
  const fresh = PaperPortfolio.create(config.paperInitialUsd);
  await savePaperPortfolio(config.paperStateFile, fresh);
  console.log(`Paper portfolio reset. Cash = ${config.paperInitialUsd} USD (${config.paperStateFile})`);

  const logPath = resolvePaperLogPath(config);
  await appendPaperLog(logPath, {
    kind: "paper_reset",
    network: config.isTestnet ? "testnet" : "mainnet",
    initialCashUsd: config.paperInitialUsd,
    stateFile: config.paperStateFile,
  });
}

export async function paperTrade(
  info: InfoClient,
  config: AppConfig,
  side: "buy" | "sell",
  sizeStr: string,
): Promise<void> {
  const reg = await AssetRegistry.fromInfoClient(info);
  const asset = reg.get(config.coin);
  const size = Number(sizeStr);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("size must be a positive number");
  }
  const mids = await info.allMids();
  const mid = mids[config.coin];
  if (!mid) throw new Error(`No mid for ${config.coin}`);

  const portfolio = await getPortfolio(config);
  const m = Number(mid);
  const before = portfolio.equity(mids);
  portfolio.fill(config.coin, side, size, m);
  const after = portfolio.equity(mids);
  await savePaperPortfolio(config.paperStateFile, portfolio);

  const sz = formatSize(size, asset.szDecimals);
  console.log(
    `Paper ${side} ${config.coin} size=${sz} @ ${mid} (simulated) | equity ${before.toFixed(2)} → ${after.toFixed(2)} USD`,
  );

  const logPath = resolvePaperLogPath(config);
  const pos = portfolio.state.positions[config.coin];
  await appendPaperLog(logPath, {
    kind: "paper_trade",
    network: config.isTestnet ? "testnet" : "mainnet",
    coin: config.coin,
    side,
    size: size,
    sizeFormatted: sz,
    mid: m,
    equityBeforeUsd: before,
    equityAfterUsd: after,
    cashUsd: portfolio.state.cashUsd,
    positionQty: pos?.qty ?? 0,
    avgEntry: pos?.avgEntry ?? null,
  });
}

/**
 * Print paper JSON Lines log to stdout (pretty-printed JSON per entry).
 * @param tailArg — omit: last `config.paperLogTailDefault` lines; number string: last N; "all": full file
 */
export async function paperShowLogs(config: AppConfig, tailArg?: string): Promise<void> {
  const path = (config.paperLogFile ?? "logs/paper-trading.jsonl").trim() || "logs/paper-trading.jsonl";
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    console.error(
      `No log file at ${path}. Enable PAPER_LOG=true, run a paper trade, or set PAPER_LOG_FILE.`,
    );
    process.exitCode = 1;
    return;
  }

  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    console.log(`Log file is empty: ${path}`);
    return;
  }
  const arg = tailArg?.trim().toLowerCase();
  let selected: string[];
  if (!arg) {
    const n = config.paperLogTailDefault;
    selected = lines.slice(-n);
    console.log(`Showing last ${selected.length} of ${lines.length} entries (${path})\n`);
  } else if (arg === "all") {
    selected = lines;
    console.log(`Showing all ${lines.length} entries (${path})\n`);
  } else {
    const n = Number(arg);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('Second argument: positive number (last N lines) or "all"');
    }
    selected = lines.slice(-Math.floor(n));
    console.log(`Showing last ${selected.length} of ${lines.length} entries (${path})\n`);
  }

  for (const line of selected) {
    try {
      const o = JSON.parse(line) as unknown;
      console.log(JSON.stringify(o, null, 2));
    } catch {
      console.log(line);
    }
    console.log();
  }
}
