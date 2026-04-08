/**
 * Network smoke test: Info API reachable, mids + clearinghouse parse.
 * Run: npx tsx scripts/smoke-test.ts   or   npm test
 */
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

async function main(): Promise<void> {
  const transport = new HttpTransport({ isTestnet: true });
  const info = new InfoClient({ transport });

  const mids = await info.allMids();
  const sample = mids.BTC ?? mids.SOL ?? mids.ETH;
  if (sample === undefined) {
    throw new Error("Smoke test: expected at least one of BTC/SOL/ETH in allMids");
  }
  if (Number(sample) <= 0) {
    throw new Error("Smoke test: invalid mid");
  }

  const ch = await info.clearinghouseState({
    user: "0x0000000000000000000000000000000000000001",
  });
  if (typeof ch.marginSummary.accountValue !== "string") {
    throw new Error("Smoke test: unexpected clearinghouse shape");
  }

  const [meta] = await info.metaAndAssetCtxs();
  if (!meta.universe?.length) {
    throw new Error("Smoke test: empty universe");
  }

  console.log("Smoke test passed: testnet API OK, mids + meta + clearinghouse.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
