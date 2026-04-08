import { loadConfig } from "./config.js";
import { createHttpTransport } from "./transport.js";
import { createExchangeClient, createInfoClient } from "./clients.js";
import { printStatus } from "./commands/status.js";
import { printMarket } from "./commands/market.js";
import { runBotLoop } from "./commands/run.js";
import { AssetRegistry, formatSize } from "./assetRegistry.js";
import { paperStatus, paperReset, paperTrade, paperShowLogs } from "./commands/paperCmd.js";
import { printCopyStatus, runCopyTradingLoop } from "./commands/copy.js";
import { theme } from "./theme.js";

function usage(): void {
  const c = theme.cmd;
  console.log(`
${theme.title("Hyperliquid copy-trading bot")} ${theme.dim("(TypeScript)")}

${theme.dim("Usage:")}
  npm run dev -- ${c("<command>")}

${theme.dim("Commands:")}
  ${c("copy")}            Rebalance your perps toward leader (COPY_LEADER_ADDRESS)
  ${c("copy status")}     Leader vs you vs target/delta (needs PRIVATE_KEY for your side)
  ${c("status")}          Mid price + account summary (needs PRIVATE_KEY for account)
  ${c("market")}          List tradable perps (main DEX)
  ${c("run")}             Simple mid poll (optional PAPER_TRADING logs)
  ${c("paper status")}    Simulated portfolio (live mids, no on-chain orders)
  ${c("paper buy")} <size> / ${c("paper sell")} <size>
                  Paper trade at current mid (see PAPER_* env vars)
  ${c("paper reset")}     Reset paper cash + positions
  ${c("paper logs")} [N|all]
                  Show paper JSONL log
  ${c("order")} <side> <size>
                  Manual aggressive order. Requires PRIVATE_KEY, DRY_RUN=false.

${theme.dim("Environment:")}
  See .env.example. Prefer testnet + DRY_RUN=true first.
`);
  process.exit(1);
}

export async function main(argv: string[]): Promise<void> {
  const cmd = argv[2];
  if (!cmd) usage();

  const config = loadConfig();
  const transport = createHttpTransport(config);
  const info = createInfoClient(transport);

  switch (cmd) {
    case "status":
      await printStatus(info, config);
      return;
    case "market":
      await printMarket(info);
      return;
    case "copy": {
      const sub = argv[3]?.toLowerCase();
      if (sub === "status") {
        await printCopyStatus(info, config);
        return;
      }
      if (sub) usage();
      const exchange = config.wallet ? createExchangeClient(transport, config) : null;
      await runCopyTradingLoop(info, exchange, config);
      return;
    }
    case "run": {
      const exchange = config.wallet ? createExchangeClient(transport, config) : null;
      await runBotLoop(info, exchange, config);
      return;
    }
    case "paper": {
      const sub = argv[3]?.toLowerCase();
      if (!sub) usage();
      if (sub === "status") {
        await paperStatus(info, config);
        return;
      }
      if (sub === "reset") {
        await paperReset(config);
        return;
      }
      if (sub === "buy" || sub === "sell") {
        const size = argv[4];
        if (!size) usage();
        await paperTrade(info, config, sub, size);
        return;
      }
      if (sub === "logs") {
        await paperShowLogs(config, argv[4]);
        return;
      }
      usage();
    }
    case "order": {
      const side = argv[3]?.toLowerCase();
      const sizeRaw = argv[4];
      if ((side !== "buy" && side !== "sell") || !sizeRaw) usage();
      if (config.dryRun) {
        console.error(
          theme.warn(
            "Refusing to send order while DRY_RUN=true. Set DRY_RUN=false in .env when ready.",
          ),
        );
        process.exit(1);
      }
      const exchange = createExchangeClient(transport, config);
      const reg = await AssetRegistry.fromInfoClient(info);
      const asset = reg.get(config.coin);
      const size = Number(sizeRaw);
      if (!Number.isFinite(size) || size <= 0) {
        throw new Error("size must be a positive number");
      }
      const mids = await info.allMids();
      const mid = mids[config.coin];
      if (!mid) throw new Error(`No mid for ${config.coin}`);
      const isBuy = side === "buy";
      const mul = isBuy ? 1.05 : 0.95;
      const px = (Number(mid) * mul).toString();
      const s = formatSize(size, asset.szDecimals);
      console.log(`Placing ${side} ${config.coin} size=${s} refPx=${px} (Ioc FrontendMarket)`);
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
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    default:
      usage();
  }
}
