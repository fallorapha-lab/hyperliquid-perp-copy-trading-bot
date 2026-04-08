import type { InfoClient } from "@nktkas/hyperliquid";
import type { AppConfig } from "../config.js";
import { AssetRegistry } from "../assetRegistry.js";

export async function printStatus(info: InfoClient, config: AppConfig): Promise<void> {
  const mids = await info.allMids();
  const mid = mids[config.coin];
  console.log(`Network: ${config.isTestnet ? "testnet" : "mainnet"}`);
  console.log(`Coin: ${config.coin}`);
  console.log(`Mid: ${mid ?? "(missing — check symbol)"}`);

  if (config.address) {
    const ch = await info.clearinghouseState({ user: config.address });
    console.log(`Account value: ${ch.marginSummary.accountValue}`);
    console.log(`Withdrawable: ${ch.withdrawable}`);
    console.log(`Open positions: ${ch.assetPositions.length}`);
    for (const ap of ch.assetPositions) {
      const p = ap.position;
      console.log(
        `  ${p.coin} ${p.szi} @ ${p.entryPx} (lev ${p.leverage.value}x ${p.leverage.type})`,
      );
    }
  } else {
    console.log("(Set PRIVATE_KEY to show clearinghouse state for your wallet.)");
  }

  const reg = await AssetRegistry.fromInfoClient(info);
  const a = reg.get(config.coin);
  console.log(`Asset index: ${a.index}, szDecimals: ${a.szDecimals}, maxLev: ${a.maxLeverage}x`);
}
