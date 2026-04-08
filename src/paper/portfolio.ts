/**
 * Spot-style paper portfolio for perps: cash + signed position per coin.
 * Fills execute at the given mark (e.g. mid). No fees/slippage unless you add them.
 */

type Position = {
  /** Signed base size: positive = long, negative = short */
  qty: number;
  /** Average entry (USD per 1 base); 0 when qty === 0 */
  avgEntry: number;
};

export type PaperPortfolioState = {
  cashUsd: number;
  positions: Record<string, Position>;
};

export class PaperPortfolio {
  constructor(public state: PaperPortfolioState) {}

  static create(initialCashUsd: number): PaperPortfolio {
    return new PaperPortfolio({ cashUsd: initialCashUsd, positions: {} });
  }

  private pos(coin: string): Position {
    return this.state.positions[coin] ?? { qty: 0, avgEntry: 0 };
  }

  /** Mark-to-market equity using current mids (USD). */
  equity(mids: Record<string, string | undefined>): number {
    let eq = this.state.cashUsd;
    for (const [coin, p] of Object.entries(this.state.positions)) {
      if (p.qty === 0) continue;
      const m = mids[coin];
      if (m === undefined) continue;
      eq += p.qty * Number(m);
    }
    return eq;
  }

  unrealizedPnlUsd(coin: string, mid: number): number {
    const p = this.pos(coin);
    if (p.qty === 0) return 0;
    return p.qty * (mid - p.avgEntry);
  }

  /**
   * Execute a market-style fill at `mid`. `qty` is base size, always positive.
   */
  fill(coin: string, side: "buy" | "sell", qty: number, mid: number): void {
    if (qty <= 0 || !Number.isFinite(mid)) {
      throw new Error("qty must be positive and mid must be finite");
    }
    let { qty: Q, avgEntry: A } = this.pos(coin);
    let C = this.state.cashUsd;

    const buy = side === "buy";
    let rem = qty;

    if (buy) {
      // Buy: cover short first, then add long
      if (Q < 0) {
        const cover = Math.min(rem, -Q);
        C -= cover * mid;
        Q += cover;
        rem -= cover;
        if (Q === 0) A = 0;
      }
      if (rem > 0 && Q >= 0) {
        const newQ = Q + rem;
        A = newQ === 0 ? 0 : (Q * A + rem * mid) / newQ;
        C -= rem * mid;
        Q = newQ;
      }
    } else {
      // Sell: reduce long first, then add short
      if (Q > 0) {
        const closeLong = Math.min(rem, Q);
        C += closeLong * mid;
        Q -= closeLong;
        rem -= closeLong;
        if (Q === 0) A = 0;
      }
      if (rem > 0 && Q <= 0) {
        const newQ = Q - rem;
        if (Q === 0) {
          A = mid;
        } else {
          const shortAbs = -Q;
          const newShortAbs = -newQ;
          A = (shortAbs * A + rem * mid) / newShortAbs;
        }
        C += rem * mid;
        Q = newQ;
      }
    }

    this.state.cashUsd = C;
    if (Q === 0) {
      delete this.state.positions[coin];
    } else {
      this.state.positions[coin] = { qty: Q, avgEntry: A };
    }
  }
}
