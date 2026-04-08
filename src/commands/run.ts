import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import type { AppConfig } from "../config.js";
import { AssetRegistry } from "../assetRegistry.js";
import { loadPaperPortfolio } from "../paper/stateFile.js";
import { appendPaperLog, resolvePaperLogPath } from "../paper/paperLogger.js";
import { logRunTickDetail } from "../logBotState.js";

/**
 * Example loop: log mid price on an interval. Extend this with your strategy.
 * Live orders only run when DRY_RUN=false (still use testnet first).
 */
export async function runBotLoop(
  info: InfoClient,
  exchange: ExchangeClient | null,
  config: AppConfig,
): Promise<void> {
  const reg = await AssetRegistry.fromInfoClient(info);
  const asset = reg.get(config.coin);
  console.log(
    `Starting run loop | ${config.isTestnet ? "testnet" : "mainnet"} | ${config.coin} | assetIndex=${asset.index} | dryRun=${config.dryRun} | paper=${config.paperTrading}`,
  );
  if (!config.dryRun && !exchange) {
    throw new Error("DRY_RUN=false requires PRIVATE_KEY so the exchange client can sign.");
  }

  const ac = new AbortController();
  process.on("SIGINT", () => {
    console.log("\nStopping...");
    ac.abort();
  });

  let lastPaperRunLogMs = 0;
  let tick = 0;

  while (!ac.signal.aborted) {
    tick += 1;
    const mids = await info.allMids();
    const mid = mids[config.coin];
    const pp = config.paperTrading
      ? await loadPaperPortfolio(config.paperStateFile, config.paperInitialUsd)
      : null;

    if (pp) {
      const logPath = resolvePaperLogPath(config);
      const interval = config.paperRunLogIntervalMs;
      if (logPath && interval > 0) {
        const now = Date.now();
        if (lastPaperRunLogMs === 0 || now - lastPaperRunLogMs >= interval) {
          lastPaperRunLogMs = now;
          const eq = pp.equity(mids);
          const pos = pp.state.positions[config.coin];
          await appendPaperLog(logPath, {
            kind: "paper_run_tick",
            network: config.isTestnet ? "testnet" : "mainnet",
            coin: config.coin,
            mid: mid !== undefined ? Number(mid) : null,
            equityUsd: eq,
            cashUsd: pp.state.cashUsd,
            positionQty: pos?.qty ?? 0,
            avgEntry: pos?.avgEntry ?? null,
            unrealizedPnlUsd:
              pos && mid !== undefined ? pp.unrealizedPnlUsd(config.coin, Number(mid)) : null,
          });
        }
      }
    }

    await logRunTickDetail(info, config, tick, mids, pp, asset.szDecimals);

    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, config.pollIntervalMs);
      ac.signal.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}
