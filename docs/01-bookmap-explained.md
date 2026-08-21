# Bookmap, Step by Step

> Source note: the YouTube link supplied (`youtu.be/vSqr2ZTg_do`) is blocked by this
> environment's network egress proxy and could not be watched. This document is built
> from Bookmap's official documentation and knowledge base plus current platform
> reviews. If the video teaches a specific named setup, paste the title/transcript and
> this file gets amended.

## 0. What problem Bookmap solves

A candlestick chart tells you what **already traded**. It throws away two things that
matter more for short-horizon decisions:

1. **Resting liquidity** — the limit orders sitting in the book that have *not* traded
   yet. This is the supply of shares/contracts that price must consume to move.
2. **The time dimension of that liquidity** — whether a big offer has been sitting there
   for 20 minutes (real) or appeared 300 ms ago (likely spoof/algo bait).

A standard DOM (depth of market ladder) shows #1 but only as a snapshot — it forgets
the past the instant it refreshes. Bookmap's core idea is to **record the order book
over time and paint it as a heatmap**, so you can see liquidity's full history next to
price.

## 1. Reading the display — the four data layers

Bookmap renders (at up to 40 FPS) four independent layers on one chart. X axis = time,
Y axis = price, for all of them.

### Layer 1 — The heatmap (resting limit orders)
Every price level, at every instant, is colored by how much size is resting there.

- Bright / hot (yellow → white in the default palette) = **thick liquidity**. A wall.
- Dark / cold (deep blue/black) = **thin liquidity**. A vacuum.

Rule of interpretation: **price moves fast through cold zones and stalls at hot zones.**
Hot zones are candidate support/resistance that no lagging indicator can give you,
because they are the actual orders, not a derived average.

Note the palette is configurable; several third-party write-ups describe red/orange as
"high liquidity" — that is a non-default color scheme. What matters is *intensity*,
not hue. Set it once and don't change it.

### Layer 2 — Traded volume dots (market orders that executed)
Circles/bubbles plotted at the price where an aggressive market order filled. Radius
scales with size. Color indicates aggressor side (buy-initiated vs sell-initiated).

This is what actually *hit* the book, as opposed to what was merely offered.

### Layer 3 — Volume profile / VWAP-family overlays
Horizontal histogram of volume traded per price over the session, plus session VWAP,
POC (point of control), value area. These give you context: is the current price inside
a high-volume node (mean-reversion regime) or in a low-volume gap (trend/expansion
regime)?

### Layer 4 — CVD / Order-flow indicators (add-ons)
Cumulative Volume Delta (buy market volume − sell market volume, accumulated), imbalance
indicators, large-lot trackers, and the Bookmap add-on marketplace (SMP, Liquidity
Tracker, Absorption indicator, etc.). These are *derived* and should be treated as
confirmation, never as the primary signal.

## 2. The five order-flow phenomena you are actually looking for

Bookmap is not a signal generator. It is an instrument. These are the readable events:

| # | Phenomenon | What you see | What it means | Typical trade |
|---|---|---|---|---|
| 1 | **Absorption** | Heavy traded-volume dots printing *into* a bright wall, and the wall does not disappear | A large passive participant is soaking up aggression without moving price | Fade — join the passive side, stop beyond the wall |
| 2 | **Exhaustion / Sweep** | A wall gets eaten, prints accelerate, then liquidity ahead is cold | Aggressors just spent their ammunition into a vacuum | Momentum — go with the sweep into the cold zone; or fade the failure if it immediately reverses |
| 3 | **Iceberg / Refill** | A modest-looking level keeps re-appearing after being hit, over and over | Hidden size; a real institutional defense, not a spoof | Strongest fade level on the chart |
| 4 | **Spoofing / Pulled liquidity** | A huge wall appears, price approaches, wall vanishes before being touched | Bait to induce your entry; the "support" was never real | Do NOT trade the wall. Trade the vacuum it leaves |
| 5 | **Liquidity void / Gap** | A cold band with no resting size | Nothing to slow price | Price traverses it quickly — use as a *target*, not an entry |

The single most valuable skill is distinguishing **#3 (iceberg, real)** from **#4
(spoof, fake)**, and the only tell is *time behavior*, which is exactly what the heatmap
preserves and a DOM does not.

## 3. Step-by-step: setting it up and running a session

1. **Pick the instrument class first.** Bookmap's value is proportional to depth-data
   quality. Futures (ES, NQ, CL, GC) via Rithmic give full-depth and, on CME,
   Market-by-Order — the best possible input. Equities are Level 2 consolidated via
   dxFeed and are inherently a partial picture (dark pools, fragmented venues, hidden
   orders). If your strategies are equities/options, understand up front that the
   heatmap is a *sample* of true liquidity, not a census.
2. **Connect a data feed.** Supported: Rithmic, dxFeed, CQG, TradeStation, Interactive
   Brokers, IQFeed, Tradovate, GAIN, Trading Technologies. Data fees are separate from
   the software subscription. Note: IB does not supply full-depth futures data and is
   not recommended as the Bookmap feed.
3. **Choose the package.** Digital / Global / Global Plus. Multibook, MBO, and several
   add-ons are gated to the higher tiers.
4. **Configure the display.** Set heatmap intensity so an average day is mid-scale (if
   everything is white you cannot see relative size). Turn on volume dots, session VWAP,
   volume profile. Start with a 5–15 minute visible time window.
5. **Mark the map before the open.** Overnight high/low, prior day's POC, and the two or
   three thickest persistent walls. These are your levels for the day.
6. **Wait for price to reach a level.** You do not trade the middle of the range. All
   the readable phenomena above happen *at* liquidity.
7. **Classify the interaction** using the table in §2 — absorbed, swept, refilled, or
   pulled.
8. **Execute with the DOM**, stop placed on the *other side of the liquidity that
   justified the trade*. If that liquidity disappears, your thesis is void — exit, do
   not wait for the stop.
9. **Record the interaction type on every trade.** This is the input that makes Part 2
   of this project work.

## 4. What Bookmap is not

- It is **not** predictive. Resting orders can be cancelled at any instant; they are
  intent, not commitment.
- It is **not** a complete view in equities. Hidden/iceberg/dark-pool flow is invisible
  or only partially inferable.
- It is **not** a backtestable dataset out of the box. Replaying order-book history for
  systematic testing requires recorded MBO/MBP data, which is expensive and which
  thinkorswim cannot consume at all.
- It is **not** compatible with naive simulated fills. Every Bookmap edge depends on
  **queue position** — being at the front of a limit order queue. Simulators (including
  thinkorswim paperMoney) fill your limit order the moment price touches it, which is
  the single most dangerous distortion in this whole project. See `03-tos-paper-automation.md` §5.

## 5. How Bookmap actually attaches to a strategy

There are only three legitimate roles, and you must decide which one you are using
before you can measure anything:

- **Role A — Filter.** Your existing strategy generates the signal; Bookmap vetoes it.
  ("Only take the breakout if the level ahead is cold.") Easiest to measure: run the
  same strategy with and without the filter and compare EV.
- **Role B — Trigger.** Bookmap generates the entry timing inside a context your
  strategy defines. ("My strategy says long above VWAP; I enter on the first absorption
  at a bright bid.") Harder to measure, because the signal no longer exists without the
  discretionary read.
- **Role C — Exit / risk manager.** Strategy entries unchanged; Bookmap decides when the
  thesis is void. Often the highest-EV role and the most overlooked.

**Role A is the only one that is cleanly automatable and cleanly measurable.** Start
there.
