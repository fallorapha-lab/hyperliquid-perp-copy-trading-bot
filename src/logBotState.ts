import type { InfoClient } from "@nktkas/hyperliquid";
import type { AppConfig } from "./config.js";
import type { PaperPortfolio } from "./paper/portfolio.js";
import { theme } from "./theme.js";
import { AssetRegistry, formatSize } from "./assetRegistry.js";
import { roundToSzDecimals } from "./copy/positions.js";

function sep(): void {
  console.log(theme.dim("────────────────────────────────────────────────────────"));
}

export async function logRunTickDetail(
  info: InfoClient,
  config: AppConfig,
  tick: number,
  mids: Record<string, string | undefined>,
  paper: PaperPortfolio | null,
  coinSzDecimals: number,
): Promise<void> {
  const coin = config.coin;
  const mid = mids[coin];
  const midN = mid !== undefined ? Number(mid) : NaN;

  sep();
  console.log(
    `${theme.title(`Run tick #${tick}`)} ${theme.dim("|")} ${config.isTestnet ? theme.info("testnet") : theme.warn("mainnet")} ${theme.dim("|")} ${theme.dim(`poll ${config.pollIntervalMs}ms`)}`,
  );
  console.log(`${theme.dim("Market:")} ${coin}  ${theme.dim("mid:")} ${mid ?? "—"}  ${theme.dim("DRY_RUN:")} ${String(config.dryRun)}  ${theme.dim("PAPER_TRADING:")} ${String(config.paperTrading)}`);

  if (paper) {
    const eq = paper.equity(mids);
    const pos = paper.state.positions[coin];
    const uPnL =
      pos && mid !== undefined ? paper.unrealizedPnlUsd(coin, Number(mid)) : null;
    console.log(`${theme.dim("Paper — cash USD:")} ${paper.state.cashUsd.toFixed(2)}  ${theme.dim("equity:")} ${eq.toFixed(2)}`);
    if (pos) {
      console.log(
        `${theme.dim("Paper — position:")} ${formatSize(pos.qty, coinSzDecimals)}  ${theme.dim("avg:")} ${pos.avgEntry.toFixed(2)}  ${theme.dim("uPnL USD:")} ${uPnL !== null ? uPnL.toFixed(2) : "—"}`,
      );
    } else {
      console.log(theme.dim("Paper — position: flat"));
    }
  }

  if (config.address) {
    try {
      const ch = await info.clearinghouseState({ user: config.address });
      const ms = ch.marginSummary;
      console.log(
        `${theme.dim("Account — value USD:")} ${ms.accountValue}  ${theme.dim("withdrawable:")} ${ch.withdrawable}  ${theme.dim("margin used:")} ${ms.totalMarginUsed}`,
      );
      const ap = ch.assetPositions.find((x) => x.position.coin.toUpperCase() === coin);
      if (ap) {
        const p = ap.position;
        console.log(
          `${theme.dim("Account —")} ${coin} ${theme.dim("szi:")} ${p.szi}  ${theme.dim("entry:")} ${p.entryPx}  ${theme.dim("uPnL:")} ${p.unrealizedPnl}  ${theme.dim("lev:")} ${p.leverage.value}x ${p.leverage.type}`,
        );
      } else {
        console.log(theme.dim(`Account — ${coin}: no open perp position`));
      }
    } catch (e) {
      console.log(theme.warn(`Account — could not load clearinghouse: ${e instanceof Error ? e.message : e}`));
    }
  } else {
    console.log(theme.dim("Account — set PRIVATE_KEY in .env to show live clearinghouse state"));
  }

  if (paper && mid !== undefined && !Number.isNaN(midN)) {
    console.log(theme.dim(`Mark ref — notional 1 ${coin} ≈ ${(1 * midN).toFixed(2)} USD at mid`));
  }
}

export function logCopyTickDetail(
  config: AppConfig,
  tick: number,
  mids: Record<string, string | undefined>,
  leader: `0x${string}`,
  follower: `0x${string}`,
  leaderPos: Map<string, number>,
  followerPos: Map<string, number>,
  coins: string[],
  reg: AssetRegistry,
): void {
  sep();
  console.log(
    `${theme.title(`Copy tick #${tick}`)} ${theme.dim("|")} ${config.isTestnet ? theme.info("testnet") : theme.warn("mainnet")} ${theme.dim("|")} ${theme.dim(`poll ${config.pollIntervalMs}ms`)}`,
  );
  console.log(
    `${theme.dim("Leader:")} ${leader.slice(0, 10)}…${leader.slice(-6)}  ${theme.dim("You:")} ${follower.slice(0, 10)}…${follower.slice(-6)}  ${theme.dim("ratio:")} ${config.copySizeRatio}  ${theme.dim("DRY_RUN:")} ${String(config.dryRun)}`,
  );
  console.log(
    `${theme.dim("Scope:")} ${describeScope(config)}  ${theme.dim("|")} ${theme.dim("min notional USD:")} ${config.copyMinNotionalUsd}  ${theme.dim("min |Δ|:")} ${config.copyMinAbsDelta || "off"}`,
  );
  console.log(
    `${theme.dim("Leader markets:")} ${leaderPos.size}  ${theme.dim("Your markets:")} ${followerPos.size}  ${theme.dim("Tracked this tick:")} ${coins.length}`,
  );

  for (const coin of coins) {
    let asset;
    try {
      asset = reg.get(coin);
    } catch {
      console.log(theme.warn(`  ${coin}: unknown symbol — skipped`));
      continue;
    }
    const lp = leaderPos.get(coin) ?? 0;
    const target = roundToSzDecimals(lp * config.copySizeRatio, asset.szDecimals);
    const fp = followerPos.get(coin) ?? 0;
    const delta = roundToSzDecimals(target - fp, asset.szDecimals);
    const mid = mids[coin];
    const midN = mid !== undefined ? Number(mid) : NaN;
    const notional = Number.isFinite(midN) ? Math.abs(delta) * midN : 0;

    let skip = "";
    if (!mid) skip = "SKIP (no mid)";
    else if (config.copyMinAbsDelta > 0 && Math.abs(delta) < config.copyMinAbsDelta) {
      skip = `SKIP (|Δ| ${Math.abs(delta)} < minAbs ${config.copyMinAbsDelta})`;
    } else if (notional < config.copyMinNotionalUsd && Math.abs(delta) > 0) {
      skip = `SKIP (notional ~$${notional.toFixed(2)} < $${config.copyMinNotionalUsd})`;
    } else if (delta === 0) {
      skip = "OK (in sync)";
    } else {
      skip = "→ would trade";
    }

    const midStr = mid ?? "—";
    console.log(
      `  ${theme.cmd(coin.padEnd(8))} mid ${String(midStr).padStart(12)}  leader ${String(lp).padStart(14)}  target ${String(target).padStart(14)}  you ${String(fp).padStart(14)}  Δ ${String(delta).padStart(14)}  ${theme.dim(skip)}`,
    );
  }
}

function describeScope(config: AppConfig): string {
  if (config.copyAllCoins) return "all (leader ∪ you)";
  if (config.copySymbols.length > 0) return config.copySymbols.join(",");
  return config.coin;
}
