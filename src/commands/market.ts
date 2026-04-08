import type { InfoClient } from "@nktkas/hyperliquid";
import { AssetRegistry } from "../assetRegistry.js";

export async function printMarket(info: InfoClient): Promise<void> {
  const reg = await AssetRegistry.fromInfoClient(info);
  const names = reg.listNames();
  console.log(`Perpetuals (${names.length}):`);
  for (const n of names) {
    const a = reg.get(n);
    console.log(`  ${a.name.padEnd(12)} idx=${a.index} szDec=${a.szDecimals} maxLev=${a.maxLeverage}`);
  }
}
