import { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import type { HttpTransport } from "@nktkas/hyperliquid";
import type { AppConfig } from "./config.js";
import { requireWallet } from "./config.js";

export function createInfoClient(transport: HttpTransport): InfoClient {
  return new InfoClient({ transport });
}

export function createExchangeClient(
  transport: HttpTransport,
  config: AppConfig,
): ExchangeClient {
  const wallet = requireWallet(config);
  return new ExchangeClient({ transport, wallet });
}
