# Part 3 — Automating This in thinkorswim paperMoney

## 1. What thinkorswim can and cannot do (read this before designing anything)

These are the constraints, not opinions. Design around them.

| Capability | Reality |
|---|---|
| thinkScript places live/paper orders | **No.** `AddOrder` produces *simulated* trades for the Strategy Report only. There is no path from a thinkScript strategy to a real order ticket. |
| Fully automated trading, natively | **No.** thinkorswim is not an algo platform. Semi-automation is the ceiling. |
| Study-driven order submission | **Yes, via Conditional Orders.** An order can be armed and released when a study condition turns true. The study must have **exactly one plot**. |
| Conditional orders re-arm after filling | **No.** One and done. Re-arm manually each time. |
| Level 2 / order-book data inside thinkScript | **No.** You can view Level 2 in the UI; thinkScript cannot read it. This is why Bookmap logic can only be *proxied* here. |
| Retail API for thinkorswim | **No.** The Schwab Trader API is the successor path, and — critically — **it does not support paper trading accounts. Live only.** |
| paperMoney | **Yes.** $100k virtual, most of the platform's tools, and the correct place to run everything in this repo. |

The consequence: **you cannot have both "fully automatic" and "paper money" in
thinkorswim.** Pick which one matters more this month. My recommendation is
paper-money-with-semi-automation first, because the measurement problem from
`02-strategy-ev-framework.md` is your actual bottleneck — not execution speed.

## 2. The three tiers, in the order you should build them

### Tier 0 — Measurement (build this week)
thinkScript **strategies** (`AbsorptionReclaim_Strategy.ts`, `SweepContinuation_Strategy.ts`)
applied to a chart, read via the Strategy Report. No orders, no risk, fastest
iteration loop in existence.

- Apply both to the same symbol/timeframe/date range.
- Set commissions in the Strategy Report settings. An uncosted backtest is a lie.
- Export the trade list, map it into `data/trades_template.csv`, run
  `tools/ev_compare.py`.
- **This alone answers "which strategy has more expected value" for the
  rules-based portion of your edge.**

### Tier 1 — Semi-automation in paperMoney (build next)
This is the closest thing to "automatic" that exists inside thinkorswim, and it
is genuinely useful:

1. **Pre-market:** run `Scanner_BookmapCandidates.ts`, pick 2–4 symbols, open a
   Bookmap heatmap on each.
2. **Arm the entry:** in the *paperMoney* account, stage the entry order, then
   gear icon → Advanced Order → **Conditional Order → Study** →
   `CondOrder_LongTrigger` → same aggregation as your chart → "is true".
3. **Attach the bracket before sending:** the order must go out as a
   1st-triggers-OCO — entry triggers { stop-loss, profit-target } as an OCO pair.
   Never arm an entry whose exit is not already attached. If the platform fills
   you and your connection drops, the bracket is the only thing between you and
   an unmanaged position.
4. **Size it by risk, not by contracts:** `size = risk_dollars / (entry − stop)`,
   computed before you stage the order, not after.
5. **Alerts for the discretionary layer:** Study Alerts on the same conditions
   push a notification; you then look at Bookmap and decide whether the
   order-flow read confirms. Log that decision as `bm_filter_pass` in the CSV —
   it is exactly the paired A/B the EV tool reports on.
6. **Re-arm** after each fill (one-and-done, see the table above).

### Tier 2 — Full automation (only after Tier 1 shows a proven edge)
thinkorswim cannot do it, so it happens outside. Options, honestly ranked:

| Path | Paper support | Order-book data | Notes |
|---|---|---|---|
| **Interactive Brokers paper + IB API** | Yes, full | Partial (IB depth is weak; Bookmap explicitly does not recommend IB as its feed) | Best free paper-automation sandbox. |
| **NinjaTrader / Tradovate sim + Bookmap direct trading** | Yes | Yes (Rithmic full depth, CME MBO) | The only path that automates *actual* Bookmap logic rather than a proxy. Bookmap trades directly through these. |
| **TradersPost / similar bridge** | Broker-dependent | No | Webhook → broker. Convenient, adds a failure point. |
| **Schwab Trader API** | **No — live only** | No | You would be debugging an algo with real money. Do not start here. |
| Screen-scraping / UI automation of thinkorswim | n/a | No | Fragile, and against the spirit (check the platform's terms). Not recommended. |

If your strategies are genuinely order-book driven, the honest conclusion is
that thinkorswim paperMoney is the wrong venue for the *automation* and the
right venue for the *measurement*. Do the measurement here; if the edge proves
out, automate it on a Rithmic-fed sim where the input data actually exists.

## 3. Build order (concrete, one week)

- **Day 1:** Load both strategies onto a 2-minute chart of your instrument.
  Run the Strategy Report over 6 months. Set commissions.
- **Day 2:** Export both trade lists → `data/trades.csv` → `python3 tools/ev_compare.py data/trades.csv`.
  Note which is ahead and how far the confidence intervals are from separating.
- **Day 3:** Tune *at most two* inputs per strategy (`volSpikeMult`, `stopATR`).
  More than that and you are curve-fitting a 6-month sample.
- **Day 4:** Switch to paperMoney. Arm one conditional order + bracket. Verify
  the mechanics on a single trade. Confirm the bracket exists after the fill.
- **Day 5+:** Trade it in paperMoney with the Bookmap heatmap open, logging
  `bm_filter_pass` and `bm_phenomenon` on every trade — taken and skipped alike.
- **Weekly:** re-run the tool. Reallocate only when a CI stops crossing zero.

## 4. Risk controls to hard-code before you arm anything

Even in paper, build the habits:

- Max risk per trade: fixed % of account (0.5% while testing).
- Max daily loss: 3R → stop for the day. Enforce it by closing the platform.
- Max concurrent positions: 1 while testing. Correlation will lie to you otherwise.
- Session window only (`startTime`/`endTime` inputs). No overnight holds while testing.
- Flat before the close, always.

## 5. The paperMoney fill-realism warning (the most important section here)

Simulators fill your resting limit order the instant price *touches* your price.
Real books do not. In a real book you are at the back of a queue, and at exactly
the levels a Bookmap strategy cares about — thick, defended levels — the queue is
longest and your fill probability is lowest. The trades you *don't* get filled on
in reality are disproportionately the winners; the ones that fill are the ones
where price went through you.

This means: **paperMoney systematically overstates the profitability of passive,
limit-order, absorption-style strategies — precisely the Bookmap-native ones.**

Mitigations, in order of effectiveness:
1. Test with **marketable** entries (market or stop orders) in paper. Slower fills,
   worse prices, honest numbers.
2. If you must test limit entries, only count a fill in your journal when price
   traded **at least 2 ticks through** your limit price.
3. Add a pessimism haircut to every simulated fill: 1 tick of slippage on entry
   and exit, then re-run the EV comparison. If the ranking flips under a 1-tick
   haircut, you never had a ranking.

Do #3 regardless. It takes one column in the CSV and it will save you real money.
