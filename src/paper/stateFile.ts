import { readFile, writeFile } from "node:fs/promises";
import { PaperPortfolio, type PaperPortfolioState } from "./portfolio.js";

export async function loadPaperPortfolio(path: string, initialCashUsd: number): Promise<PaperPortfolio> {
  try {
    const raw = await readFile(path, "utf8");
    const data = JSON.parse(raw) as PaperPortfolioState;
    if (typeof data.cashUsd !== "number" || typeof data.positions !== "object") {
      return PaperPortfolio.create(initialCashUsd);
    }
    return new PaperPortfolio({
      cashUsd: data.cashUsd,
      positions: data.positions ?? {},
    });
  } catch {
    return PaperPortfolio.create(initialCashUsd);
  }
}

export async function savePaperPortfolio(path: string, portfolio: PaperPortfolio): Promise<void> {
  const state: PaperPortfolioState = {
    cashUsd: portfolio.state.cashUsd,
    positions: { ...portfolio.state.positions },
  };
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}
