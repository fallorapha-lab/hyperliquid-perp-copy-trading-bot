import type { InfoClient } from "@nktkas/hyperliquid";

/** coin (uppercase) -> signed position size (szi) */
export async function fetchPerpPositions(
  info: InfoClient,
  user: `0x${string}`,
): Promise<Map<string, number>> {
  const ch = await info.clearinghouseState({ user });
  const m = new Map<string, number>();
  for (const ap of ch.assetPositions) {
    const coin = ap.position.coin.toUpperCase();
    m.set(coin, Number(ap.position.szi));
  }
  return m;
}

export function roundToSzDecimals(x: number, szDecimals: number): number {
  const f = 10 ** szDecimals;
  return Math.round(x * f) / f;
}
