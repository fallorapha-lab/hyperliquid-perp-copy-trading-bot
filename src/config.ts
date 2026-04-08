import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import type { PrivateKeyAccount } from "viem/accounts";

function envBool(key: string, defaultValue: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return defaultValue;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function requireHexKey(raw: string | undefined): `0x${string}` {
  if (!raw?.trim()) {
    throw new Error("PRIVATE_KEY is required for this command (set in .env)");
  }
  const k = raw.trim().startsWith("0x") ? raw.trim() : `0x${raw.trim()}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error("PRIVATE_KEY must be 32-byte hex (with or without 0x prefix)");
  }
  return k as `0x${string}`;
}

export type AppConfig = {
  isTestnet: boolean;
  coin: string;
  pollIntervalMs: number;
  dryRun: boolean;
  /** Simulated portfolio; no chain orders */
  paperTrading: boolean;
  paperInitialUsd: number;
  paperStateFile: string;
  /** Append paper events to JSON Lines file */
  paperLogEnabled: boolean;
  paperLogFile: string;
  /** Append `paper status` snapshots to the log file */
  paperLogStatus: boolean;
  /** If > 0 and PAPER_TRADING, append mark/equity from `run` every N ms */
  paperRunLogIntervalMs: number;
  /** Default lines for `paper logs` when no argument */
  paperLogTailDefault: number;
  /** Leader wallet to mirror (copy trading) */
  copyLeaderAddress: string | null;
  /** Multiply leader signed size (e.g. 0.5 = half size) */
  copySizeRatio: number;
  /** Sync every market the leader trades (union with your open markets) */
  copyAllCoins: boolean;
  /** If set and copyAllCoins false, only these symbols (comma-separated in env) */
  copySymbols: string[];
  /** Skip rebalance if |delta| * mid < this (USD) */
  copyMinNotionalUsd: number;
  /** Skip if abs delta below this (0 = only notional filter) */
  copyMinAbsDelta: number;
  copyLogEnabled: boolean;
  copyLogFile: string;
  /** Present when PRIVATE_KEY set */
  wallet: PrivateKeyAccount | null;
  address: `0x${string}` | null;
};

export function loadConfig(): AppConfig {
  const pk = process.env.PRIVATE_KEY;
  let wallet: PrivateKeyAccount | null = null;
  let address: `0x${string}` | null = null;
  if (pk?.trim()) {
    wallet = privateKeyToAccount(requireHexKey(pk));
    address = wallet.address;
  }
  const paperInitialUsd = Math.max(0, Number(process.env.PAPER_INITIAL_USD) || 100_000);
  const paperRunLogIntervalMs = Math.max(
    0,
    Number.isFinite(Number(process.env.PAPER_LOG_INTERVAL_MS))
      ? Number(process.env.PAPER_LOG_INTERVAL_MS)
      : 0,
  );
  const copySymbolsRaw = (process.env.COPY_SYMBOLS ?? "").trim();
  const copySymbols = copySymbolsRaw
    ? copySymbolsRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : [];
  const copySizeRatio = Number(process.env.COPY_SIZE_RATIO ?? "1");
  return {
    isTestnet: envBool("HL_TESTNET", true),
    coin: (process.env.COIN ?? "BTC").trim().toUpperCase(),
    pollIntervalMs: Math.max(1000, Number(process.env.POLL_INTERVAL_MS) || 5000),
    dryRun: envBool("DRY_RUN", true),
    paperTrading: envBool("PAPER_TRADING", false),
    paperInitialUsd,
    paperStateFile: (process.env.PAPER_STATE_FILE ?? "paper-state.json").trim() || "paper-state.json",
    paperLogEnabled: envBool("PAPER_LOG", true),
    paperLogFile: (process.env.PAPER_LOG_FILE ?? "logs/paper-trading.jsonl").trim() || "logs/paper-trading.jsonl",
    paperLogStatus: envBool("PAPER_LOG_STATUS", false),
    paperRunLogIntervalMs,
    paperLogTailDefault: Math.max(1, Number(process.env.PAPER_LOG_TAIL) || 200),
    copyLeaderAddress: (process.env.COPY_LEADER_ADDRESS ?? "").trim() || null,
    copySizeRatio: Number.isFinite(copySizeRatio) && copySizeRatio > 0 ? copySizeRatio : 1,
    copyAllCoins: envBool("COPY_ALL_COINS", false),
    copySymbols,
    copyMinNotionalUsd: Math.max(0, Number(process.env.COPY_MIN_NOTIONAL_USD) || 5),
    copyMinAbsDelta: Math.max(0, Number(process.env.COPY_MIN_ABS_DELTA) || 0),
    copyLogEnabled: envBool("COPY_TRADING_LOG", true),
    copyLogFile: (process.env.COPY_LOG_FILE ?? "logs/copy-trading.jsonl").trim() || "logs/copy-trading.jsonl",
    wallet,
    address,
  };
}

export function requireWallet(config: AppConfig): PrivateKeyAccount {
  if (!config.wallet) {
    throw new Error("Wallet not configured: set PRIVATE_KEY in .env");
  }
  return config.wallet;
}
