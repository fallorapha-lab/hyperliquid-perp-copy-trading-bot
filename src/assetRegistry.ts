import type { InfoClient } from "@nktkas/hyperliquid";

type AssetInfo = {
  /** Perp index used in order field `a` */
  index: number;
  name: string;
  szDecimals: number;
  maxLeverage: number;
};

/**
 * Maps coin names (e.g. "BTC") to Hyperliquid perp asset index and size decimals.
 */
export class AssetRegistry {
  private byName = new Map<string, AssetInfo>();

  private constructor() {}

  static async fromInfoClient(info: InfoClient): Promise<AssetRegistry> {
    const [meta] = await info.metaAndAssetCtxs();
    const reg = new AssetRegistry();
    meta.universe.forEach((u, index) => {
      if (u.isDelisted) return;
      reg.byName.set(u.name.toUpperCase(), {
        index,
        name: u.name,
        szDecimals: u.szDecimals,
        maxLeverage: u.maxLeverage,
      });
    });
    return reg;
  }

  get(coin: string): AssetInfo {
    const key = coin.trim().toUpperCase();
    const a = this.byName.get(key);
    if (!a) {
      const sample = [...this.byName.keys()].slice(0, 8).join(", ");
      throw new Error(`Unknown perp "${coin}". Examples: ${sample}, ...`);
    }
    return a;
  }

  listNames(): string[] {
    return [...this.byName.keys()].sort();
  }
}

/** Format size string according to market szDecimals */
export function formatSize(size: number, szDecimals: number): string {
  return size.toFixed(szDecimals);
}
