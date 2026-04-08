# Hyperliquid Copy-Trading Bot

A TypeScript CLI that **mirrors another wallet’s perpetual positions** on [Hyperliquid](https://hyperliquid.xyz/): it polls the leader’s account via the Info API and sends **market-style** orders so your size tracks `leaderSize × COPY_SIZE_RATIO`. Built with [`@nktkas/hyperliquid`](https://www.npmjs.com/package/@nktkas/hyperliquid) and [`viem`](https://viem.sh/) for signing.

Also includes **paper trading** (simulated fills) and a manual **`order`** command.

**Use testnet and `DRY_RUN=true` until you understand the risks.** Copy trading can still lose money (latency, partial fills, fees, leader behavior). This is not financial advice.

---

## Prerequisites

- [Node.js](https://nodejs.org/) **18+** (LTS recommended)
- `npm`

---

## Testing

**Automated (compile + live API smoke test on testnet):**

```bash
npm test
```

This runs `tsc` and `scripts/smoke-test.ts` (checks `allMids`, `metaAndAssetCtxs`, `clearinghouseState`).

**Manual checks (no keys required for most):**

```bash
npm run dev -- market
npm run paper:status
npm run paper:buy -- 0.001
npm run paper:logs
```

**Copy trading (needs `COPY_LEADER_ADDRESS` in `.env`; add `PRIVATE_KEY` for your side):**

```bash
npm run copy:status
# DRY_RUN=true (default): logs only
npm run copy
```

**End-to-end signed orders** only on testnet with a funded wallet, `DRY_RUN=false`, and sizes you accept losing.

---

## Quick start

1. **Install**

   ```bash
   npm install
   ```

2. **Configure**

   ```bash
   copy .env.example .env
   ```

   On macOS/Linux: `cp .env.example .env`

3. **Set the leader** you want to follow:

   ```env
   COPY_LEADER_ADDRESS=0xYourLeaderAddress
   ```

4. **Inspect** (leader is public; your side needs `PRIVATE_KEY` for comparison)

   ```bash
   npm run copy:status
   ```

5. **Dry-run copy loop** (logs intended trades, **no signed orders**)

   ```bash
   # DRY_RUN=true in .env
   npm run copy
   ```

6. **Live execution** (only when ready)

   - Fund your wallet on the **same network** as `HL_TESTNET`
   - Set `DRY_RUN=false`
   - Run `npm run copy` again

7. **Build**

   ```bash
   npm run build
   npm start -- copy status
   ```

---

## How copy trading works

1. Each poll, the bot loads **leader** and **your** [`clearinghouseState`](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals) perp positions.
2. For each symbol in scope, it computes **target size** = `leaderSignedSize × COPY_SIZE_RATIO`, rounded to the market’s **size decimals**.
3. **Delta** = target − your current size. If the notional is below `COPY_MIN_NOTIONAL_USD` (and optional `COPY_MIN_ABS_DELTA`), it skips (reduces spam).
4. If `DRY_RUN=false`, it sends a single **aggressive** order per rebalance (same style as the built-in `order` command: `FrontendMarket` / IOC-style execution path in the SDK).

**Scope**

| Mode | What is synced |
|------|----------------|
| Default | Only **`COIN`** (e.g. one market). |
| `COPY_SYMBOLS=BTC,ETH` | Listed symbols only (when `COPY_ALL_COINS=false`). |
| `COPY_ALL_COINS=true` | Union of **leader positions and your positions** so closed leader positions can unwind yours. |

---

## Configuration (`.env`)

### Core

| Variable | Description |
|----------|-------------|
| `PRIVATE_KEY` | Your wallet (`0x` + 64 hex). Required for **`copy`** loop, **`copy status`** (your side), **`status`**, **`order`**. |
| `HL_TESTNET` | `true` = testnet API. Recommended until you are confident. |
| `DRY_RUN` | `true` = **no** exchange orders (copy loop only logs intents). |
| `POLL_INTERVAL_MS` | Delay between **`copy`** / **`run`** iterations (ms). |

### Copy trading

| Variable | Description |
|----------|-------------|
| `COPY_LEADER_ADDRESS` | Leader **0x** address (required for `copy` / `copy status`). |
| `COPY_SIZE_RATIO` | Scale factor on the leader’s signed size (default `1`). |
| `COPY_ALL_COINS` | `true` = multi-market sync (see table above). |
| `COPY_SYMBOLS` | Optional comma list (e.g. `BTC,ETH`) when not using `COPY_ALL_COINS`. |
| `COIN` | Default single symbol when `COPY_ALL_COINS=false` and `COPY_SYMBOLS` is empty. |
| `COPY_MIN_NOTIONAL_USD` | Skip tiny rebalances (default `5`). |
| `COPY_MIN_ABS_DELTA` | Optional minimum **base** delta (default `0` = off). |
| `COPY_TRADING_LOG` | Append JSON Lines to `COPY_LOG_FILE` (intents, fills, errors). |
| `COPY_LOG_FILE` | Default `logs/copy-trading.jsonl`. |

### Paper trading (optional)

| Variable | Description |
|----------|-------------|
| `PAPER_*` | See `.env.example`: simulated portfolio, `logs/paper-trading.jsonl`, etc. |

Full comments live in **`.env.example`**.

---

## Commands

| Command | Description |
|---------|-------------|
| **`copy`** | Copy-trading loop (leader → you). |
| **`copy status`** | Leader vs you vs target/delta snapshot. |
| `market` | List perps. |
| `status` | Mid + your account (if key set). |
| `run` | Simple mid poll (optional paper equity logging). |
| `paper …` | Simulated trading + `paper logs`. |
| `order buy/sell <size>` | Manual one-off order (`DRY_RUN=false`). |

```bash
npm run copy
npm run copy:status
npm run dev -- copy status
```

---

## NPM scripts

| Script | Command |
|--------|---------|
| `npm run copy` | `copy` loop |
| `npm run copy:status` | `copy status` |
| `npm run paper:status` | `paper status` |
| `npm run paper:logs` | `paper logs` |
| `npm run paper:buy` / `paper:sell` | pass size after `--` |

---

## Project layout

```text
src/
  cli.ts
  config.ts
  commands/
    copy.ts      # Copy loop + status
    run.ts
    ...
  copy/
    positions.ts # Clearinghouse → signed sizes
  paper/         # Paper portfolio + logs
```

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| `COPY_LEADER_ADDRESS is required` | Set leader `0x` in `.env`. |
| Copy does nothing | `DRY_RUN` logs only; deltas below min notional; wrong `COIN` / `COPY_SYMBOLS`; leader flat on that market. |
| Orders rejected | Margin, leverage, min size, or API errors—see console and `logs/copy-trading.jsonl`. |
| Stale follower position | Next polls recompute delta; ensure **`copy`** keeps running and you are not trading the same account manually in conflict. |

---

## License

ISC (see `package.json`).

---

## Links

- [Hyperliquid documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/)
- [@nktkas/hyperliquid on npm](https://www.npmjs.com/package/@nktkas/hyperliquid)
