import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import { getAddress, isAddress } from "viem";
import type { AppConfig } from "../config.js";
import { requireWallet } from "../config.js";
import { AssetRegistry, formatSize } from "../assetRegistry.js";
import { fetchPerpPositions, roundToSzDecimals } from "../copy/positions.js";
import { appendPaperLog } from "../paper/paperLogger.js";
import { logCopyTickDetail } from "../logBotState.js";

function copyLogPath(config: AppConfig): string | null {
  if (!config.copyLogEnabled) return null;
  return config.copyLogFile.trim() || null;
}

/**
 * Print leader vs follower positions and deltas (read-only for leader; follower needs PRIVATE_KEY).
 */
export async function printCopyStatus(info: InfoClient, config: AppConfig): Promise<void> {
  const leader = normalizeAddressOrThrow(config.copyLeaderAddress, "COPY_LEADER_ADDRESS");
  const leaderPos = await fetchPerpPositions(info, leader);
  console.log(`Copy trading | ${config.isTestnet ? "testnet" : "mainnet"}`);
  console.log(`Leader: ${leader}`);
  console.log(`Size ratio: ${config.copySizeRatio}`);
  console.log(`Scope: ${describeCopyScope(config)}`);

  console.log("\nLeader positions:");
  if (leaderPos.size === 0) {
    console.log("  (none)");
  } else {
    for (const [c, szi] of [...leaderPos.entries()].sort()) {
      console.log(`  ${c}: ${szi}`);
    }
  }

  if (!config.address) {
    console.log("\n(Set PRIVATE_KEY to compare your account and planned deltas.)");
    return;
  }

  const followerPos = await fetchPerpPositions(info, config.address);
  console.log("\nYour positions:");
  if (followerPos.size === 0) {
    console.log("  (none)");
  } else {
    for (const [c, szi] of [...followerPos.entries()].sort()) {
      console.log(`  ${c}: ${szi}`);
    }
  }

  const reg = await AssetRegistry.fromInfoClient(info);
  const coins = coinsToSync(leaderPos, followerPos, config);
  const mids = await info.allMids();
  console.log("\nTarget vs yours (per selected scope):");
  for (const coin of coins) {
    let asset;
    try {
      asset = reg.get(coin);
    } catch {
      console.log(`  ${coin}: unknown perp symbol (check COPY_SYMBOLS / COIN)`);
      continue;
    }
    const lp = leaderPos.get(coin) ?? 0;
    const target = roundToSzDecimals(lp * config.copySizeRatio, asset.szDecimals);
    const fp = followerPos.get(coin) ?? 0;
    const delta = roundToSzDecimals(target - fp, asset.szDecimals);
    const mid = mids[coin];
    console.log(
      `  ${coin}: leader=${lp} → target=${target} | yours=${fp} | delta=${delta}${mid ? ` (mid ${mid})` : ""}`,
    );
  }
}

function describeCopyScope(config: AppConfig): string {
  if (config.copyAllCoins) return "leader ∪ your positions (all tracked markets)";
  if (config.copySymbols.length > 0) return config.copySymbols.join(", ");
  return `single COIN=${config.coin}`;
}

function normalizeAddressOrThrow(raw: string | null, name: string): `0x${string}` {
  const t = raw?.trim();
  if (!t) throw new Error(`${name} is required for copy trading`);
  if (!isAddress(t)) throw new Error(`${name} must be a valid 0x Ethereum address`);
  return getAddress(t) as `0x${string}`;
}

/** Which perp symbols to reconcile each tick */
function coinsToSync(
  leaderPos: Map<string, number>,
  followerPos: Map<string, number>,
  config: AppConfig,
): string[] {
  if (config.copyAllCoins) {
    const s = new Set([...leaderPos.keys(), ...followerPos.keys()]);
    return [...s].sort();
  }
  if (config.copySymbols.length > 0) {
    return [...new Set(config.copySymbols.map((c) => c.toUpperCase()))].sort();
  }
  return [config.coin.toUpperCase()];
}

export async function runCopyTradingLoop(
  info: InfoClient,
  exchange: ExchangeClient | null,
  config: AppConfig,
): Promise<void> {
  const leader = normalizeAddressOrThrow(config.copyLeaderAddress, "COPY_LEADER_ADDRESS");
  requireWallet(config);
  if (!config.address) throw new Error("Follower wallet missing");

  if (!config.dryRun && !exchange) {
    throw new Error("DRY_RUN=false requires a working ExchangeClient (PRIVATE_KEY).");
  }

  console.log(
    `Copy trading loop | ${config.isTestnet ? "testnet" : "mainnet"} | leader=${leader} | follower=${config.address} | ratio=${config.copySizeRatio} | dryRun=${config.dryRun}`,
  );
  console.log(`Scope: ${describeCopyScope(config)} | poll=${config.pollIntervalMs}ms`);

  const reg = await AssetRegistry.fromInfoClient(info);
  let tick = 0;
  const ac = new AbortController();
  process.on("SIGINT", () => {
    console.log("\nStopping copy loop...");
    ac.abort();
  });

  while (!ac.signal.aborted) {
    tick += 1;
    const mids = await info.allMids();
    const leaderPos = await fetchPerpPositions(info, leader);
    const followerPos = await fetchPerpPositions(info, config.address);
    const coins = coinsToSync(leaderPos, followerPos, config);

    logCopyTickDetail(
      config,
      tick,
      mids,
      leader,
      config.address,
      leaderPos,
      followerPos,
      coins,
      reg,
    );

    for (const coin of coins) {
      let asset;
      try {
        asset = reg.get(coin);
      } catch (err) {
        console.warn(`[copy] Skip unknown market ${coin}:`, err instanceof Error ? err.message : err);
        continue;
      }
      const lp = leaderPos.get(coin) ?? 0;
      const target = roundToSzDecimals(lp * config.copySizeRatio, asset.szDecimals);
      const fp = followerPos.get(coin) ?? 0;
      let delta = roundToSzDecimals(target - fp, asset.szDecimals);

      if (config.copyMinAbsDelta > 0 && Math.abs(delta) < config.copyMinAbsDelta) continue;

      const mid = mids[coin];
      if (!mid) continue;
      const midN = Number(mid);
      const notionalUsd = Math.abs(delta) * midN;
      if (notionalUsd < config.copyMinNotionalUsd) continue;

      const side = delta > 0 ? "buy" : "sell";
      const absSize = Math.abs(delta);
      const s = formatSize(absSize, asset.szDecimals);
      const isBuy = side === "buy";
      const px = (isBuy ? midN * 1.05 : midN * 0.95).toString();

      const t = new Date().toISOString();
      console.log(
        `[${t}] ${coin} sync: delta=${delta} → ${side} size=${s} refPx≈${px} (leader ${lp} → target ${target}, yours ${fp})`,
      );

      const logPath = copyLogPath(config);
      await appendPaperLog(logPath, {
        kind: "copy_intent",
        network: config.isTestnet ? "testnet" : "mainnet",
        coin,
        side,
        size: absSize,
        sizeFormatted: s,
        refPx: px,
        leaderSzi: lp,
        targetSzi: target,
        followerSzi: fp,
        delta,
        dryRun: config.dryRun,
      });

      if (config.dryRun || !exchange) continue;

      try {
        const result = await exchange.order({
          orders: [
            {
              a: asset.index,
              b: isBuy,
              p: px,
              s,
              r: false,
              t: { limit: { tif: "FrontendMarket" } },
            },
          ],
          grouping: "na",
        });
        console.log(JSON.stringify(result));

        await appendPaperLog(logPath, {
          kind: "copy_order",
          network: config.isTestnet ? "testnet" : "mainnet",
          coin,
          side,
          sizeFormatted: s,
          resultJson: JSON.stringify(result),
        });
      } catch (err) {
        console.error(`[copy] Order failed ${coin}:`, err);
        await appendPaperLog(logPath, {
          kind: "copy_order_error",
          network: config.isTestnet ? "testnet" : "mainnet",
          coin,
          side,
          sizeFormatted: s,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, config.pollIntervalMs);
      ac.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
