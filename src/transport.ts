import { HttpTransport } from "@nktkas/hyperliquid";
import type { AppConfig } from "./config.js";

export function createHttpTransport(config: AppConfig): HttpTransport {
  return new HttpTransport({
    isTestnet: config.isTestnet,
  });
}
