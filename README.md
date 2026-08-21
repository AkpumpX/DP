# Bookmap → EV Comparison → thinkorswim paperMoney

Answers the three-part request: (1) how Bookmap works, (2) how to use it to decide
which of your strategies has the higher expected value, (3) an automation design for
thinkorswim paperMoney.

## Read in this order

| File | What it is |
|---|---|
| [`docs/01-bookmap-explained.md`](docs/01-bookmap-explained.md) | Step-by-step: the four data layers, the five readable order-flow phenomena, session workflow, and the three legitimate ways to attach Bookmap to an existing strategy |
| [`docs/02-strategy-ev-framework.md`](docs/02-strategy-ev-framework.md) | The expected-value math, the sample-size problem, and the measurement protocol |
| [`docs/03-tos-paper-automation.md`](docs/03-tos-paper-automation.md) | What thinkorswim can and cannot automate, the three build tiers, and the fill-realism warning |
| [`docs/04-bookmap-platform-reference.md`](docs/04-bookmap-platform-reference.md) | Bookmap packages, connectivity, replay mode, and its add-on API — plus the revised venue recommendation |

## Run it

```bash
python3 tools/ev_compare.py --demo                 # see the report shape on synthetic data
python3 tools/ev_compare.py data/trades.csv        # your real log
python3 tools/ev_compare.py data/trades.csv --by-regime
```

Log trades in the schema of [`data/trades_template.csv`](data/trades_template.csv) —
including the setups you *skipped*, which is how you find out whether your discretion
adds value.

## thinkScript

| File | Purpose |
|---|---|
| `thinkscript/AbsorptionReclaim_Strategy.ts` | Strategy A (fade at a liquidity shelf) — backtest via Strategy Report |
| `thinkscript/SweepContinuation_Strategy.ts` | Strategy B (momentum into a void) — structurally opposite to A, so the EV comparison is clean |
| `thinkscript/CondOrder_LongTrigger.ts` | Single-plot study for a paperMoney Conditional Order |
| `thinkscript/Scanner_BookmapCandidates.ts` | Pre-market watchlist builder |

## Two constraints you cannot design around

1. **thinkScript cannot see the order book.** No Level 2 in thinkScript, ever. The
   strategies here use volume-profile and volume-spike *proxies* for liquidity shelves
   and absorption. A proxy is not the thing.
2. **thinkorswim cannot place orders from a script, and the Schwab Trader API does not
   support paper accounts.** "Fully automatic" and "paper money" are mutually exclusive
   inside this platform. Details and the alternatives in `docs/03`.

**But not across platforms:** Bookmap's own add-on API (Java, or Python for L1) runs
arbitrary automated strategies against replay/simulation or a demo account, on real
recorded order-book data. If your edge is order-flow based, that is where it should be
automated — `docs/04` §4 and §6.

## Open items

- `youtu.be`, `bit.ly`, and `bookmap.com` are all blocked by this environment's network
  egress proxy (gateway 403 on CONNECT). `docs/04` was assembled from bookmap.com's
  documentation via server-side search instead. Pricing figures are deliberately absent
  because the pricing page could not be loaded — verify them yourself.
- **Your actual strategies are not defined anywhere.** This repo contained only an
  unrelated script when this work started. Send the strategy names + one-line rules +
  instrument, and the templates get rewritten to encode *your* rules instead of the two
  generic ones shipped here.
