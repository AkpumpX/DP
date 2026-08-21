# Bookmap Platform Reference

> Sourced from bookmap.com's own documentation and knowledge base **via search**, not
> by loading the site: `bookmap.com` (like `youtu.be` and `bit.ly`) is blocked by this
> environment's network egress proxy, which rejects the connection at the gateway.
> Prices in particular are NOT reproduced here because I could not load the pricing
> page — check `bookmap.com/packages-comparison` yourself before buying anything.

## 1. Packages — what gates what

| Package | Notable limits / inclusions |
|---|---|
| **Digital** (free tier) | One instrument connected at a time |
| **Digital Plus** | Intermediate tier |
| **Global** | 10 symbols |
| **Global Plus** | 20 symbols; **required to trade from the Bookmap chart to a funded account**; includes DOM Pro, Execution Pro, and the bundled indicator add-ons |
| **MBO Bundle** | Market-by-order data (per-order granularity, CME futures) |

Two consequences worth planning around:

1. **Trading directly from the heatmap requires Global Plus.** If your plan is to
   execute where you read, that is the tier, not an optional upgrade.
2. **Market data fees are separate from the software subscription**, and scale with how
   many exchanges you entitle. Budget them as a distinct line item.

## 2. Connectivity

- **Futures:** Rithmic, dxFeed, and 10+ others (CQG, TradeStation, IQFeed, Tradovate,
  GAIN, Trading Technologies, Interactive Brokers…). Rithmic gives full depth and, on
  CME, market-by-order — the highest-fidelity input available.
- **US stocks:** dxFeed and Cedro.
- **Crypto:** 20+ exchange connections, plus **Multibook**, an add-on that consolidates
  the order books of up to 5 crypto exchanges into one aggregated book.
- **Not recommended:** Interactive Brokers as the *data* feed — IB does not provide
  full-depth futures data and updates infrequently.

## 3. Replay mode — the part that matters most for this project

Bookmap **records every tick of market depth and volume**, and replays it:

- Recorded sessions replay exactly as they unfolded, including the full book.
- **You can execute simulated orders inside replay**, against the recorded book.
- Standalone replay mode plays back previously recorded depth files from past sessions.

This is the capability thinkorswim structurally cannot offer. It means order-flow logic
can be tested against *real recorded order-book history* rather than against the
volume-profile proxies in `thinkscript/`. For measuring the EV of a Bookmap-native
strategy, replay + sim is the correct instrument, and everything in
`docs/02-strategy-ev-framework.md` applies to its output unchanged — the trade log is
the trade log, whatever produced it.

Use it two ways: **forward** (test a setup across many recorded sessions) and
**backward** (debrief your own executed trades — replay the session, find each entry,
and ask what the book actually showed at that moment versus what you thought it showed).

## 4. The API — full automation with a simulated account IS possible here

This is the finding that changes the plan in `docs/03-tos-paper-automation.md`.

- Bookmap exposes an **add-on API**: custom modules for automated trading strategies,
  indicators, alerts, data export/recording, and adapters for new data sources or
  trading systems.
- **Language:** modules are Java, shipped as JARs. Adapters may talk to anything on
  their far side, so any language can sit behind one. **L1 add-ons can also be written
  in Python.**
- **No stated restrictions on strategy logic** — arbitrary business logic and complex
  order management are supported.
- **Testing:** strategies can be run **in replay/simulation mode, or against a demo
  (paper money) account.**
- Docs: `bookmap.com/knowledgebase/docs/API`; the full javadoc ships with the installer
  as `bm-l1api-javadoc.jar` under the Bookmap `lib/` directory.

Read that last testing point against the thinkorswim constraint table in `docs/03` §1:

> thinkorswim: automation **or** paper, never both.
> Bookmap: automation **and** simulation, with real order-book data underneath.

If the strategies you want to automate are genuinely order-flow driven, **Bookmap is the
correct automation venue and thinkorswim is not.** thinkorswim keeps a real role — it is
where a non-order-book strategy gets measured, and where paperMoney semi-automation via
conditional orders lives — but it should not be forced to host logic whose primary input
it cannot see.

## 5. Order-flow phenomena, in Bookmap's own words

Confirms and sharpens `docs/01-bookmap-explained.md` §2:

- **Absorption** — aggressive buyers or sellers hit a level repeatedly but price does not
  continue; passive liquidity there is strong enough to absorb the pressure.
- **Iceberg** — an order deliberately broken into smaller limit orders (usually
  algorithmically) to disguise true size. The tell is *repeated execution at one level
  without the displayed liquidity disappearing as expected*.
- **Spoofing** — large resting orders acting as fake support/resistance to intimidate
  other participants into trading the other way; never intended to be filled, and
  typically cancelled before they can be hit. The tell is *liquidity that disappears as
  price approaches*.

Iceberg and spoof are the same visual object separated only by behavior over time —
one refills after being hit, the other vanishes before being hit. Everything downstream
in this repo depends on tagging that correctly in the journal
(`bm_phenomenon` in `data/trades_template.csv`).

## 6. Revised recommendation

| Layer | Venue | Why |
|---|---|---|
| Read the market | Bookmap (Global+ if trading from the chart) | Only place the book is visible |
| Test order-flow logic | **Bookmap Replay + simulator** | Real recorded depth; sim fills against the recorded book |
| Automate order-flow logic | **Bookmap API** (Java, or Python for L1), run against sim/demo first | Automation and paper trading coexist here |
| Test non-order-book logic | thinkorswim Strategy Report (`thinkscript/`) | Fast iteration, free, good enough for price/volume rules |
| Semi-automate in paper | thinkorswim paperMoney + Conditional Orders | Ceiling of what ToS can do |
| Rank everything by EV | `tools/ev_compare.py` | Venue-agnostic; it only needs a trade log |

The EV framework is unchanged by any of this. It consumes trade logs, and it does not
care which platform produced them — which is exactly why it was built that way.
