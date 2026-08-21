# Part 2 — Deciding Which of Your Strategies Has the Higher Expected Value

## The blocker, stated plainly

This repository contained no trading strategies when I started (its only file was an
unrelated Roblox script loader), and nothing in our conversation defines them. So I
cannot tell you *which* of your strategies wins. What I can — and did — build is the
machinery that answers it the moment you supply the trade data, plus a worked example so
you can see the output shape.

**What I need from you:** the list of strategies (names + one-line rules), the
instrument(s), and either an export of past trades or the willingness to log forward.
Format in `data/trades_template.csv`.

## 1. Why "which is more profitable" is the wrong question

Most traders compare win rate. Win rate alone is meaningless — a 90% strategy that
risks 10 to make 1 is a slow bankruptcy. Compare **expectancy**, then correct it for
frequency, cost, and variance. Four numbers, in this order:

### (a) Expectancy per trade, in R
Define R = the dollar amount risked on the trade (entry − stop, times size). Normalizing
to R makes strategies with different position sizes comparable.

```
E[R]  =  p_win × avg_win_R  −  p_loss × avg_loss_R
```

A strategy is only tradeable if `E[R] > 0` **after costs**.

### (b) Costs — subtract them before comparing, not after
```
E_net[R] = E[R] − (commissions + exchange fees + spread crossed + slippage) / R_dollars
```
This is where Bookmap-derived strategies quietly die or quietly win. A scalping strategy
at 0.15R average edge and 0.08R round-trip cost keeps 47% of its gross edge. A swing
strategy at 0.9R edge and the same 0.08R cost keeps 91%. Cost is not a footnote; it is
often the entire ranking.

### (c) Expected profit per unit time — the frequency correction
```
E_daily = E_net[R] × trades_per_day × R_dollars
```
A 0.10R strategy taken 8×/day beats a 0.60R strategy taken once a week. Never rank on
per-trade expectancy alone.

### (d) Risk-adjusted quality — the deciding tiebreak
```
t-stat   = mean(R) / stdev(R) × sqrt(n)        # is the edge real, or noise?
SQN      = mean(R) / stdev(R) × sqrt(n)        # (same quantity; Van Tharp's naming)
Kelly f* = E[R] / avg_win_R⁻¹ …               # see tools/ev_compare.py for exact form
MaxDD_R  = worst peak-to-trough in R units
```
Between two strategies with similar `E_daily`, take the one with the lower stdev and
shallower max drawdown. It is the one you will still be trading in six months.

## 2. The sample-size problem (this is the part people skip)

You cannot separate two strategies with 20 trades each. The number of trades needed to
detect a difference `Δ` in mean R between two strategies, at 95% confidence and 80%
power, is roughly:

```
n_per_strategy  ≈  16 × (σ_R / Δ)²
```

Concretely: if both strategies have σ_R ≈ 1.2 and you want to detect a 0.15R difference,
`n ≈ 16 × (1.2/0.15)² ≈ 1024 trades each`. That is the honest answer, and it is why most
"my strategy A is better" claims are noise.

Practical consequences:
- **Do not** run a 30-trade paperMoney sample and declare a winner.
- **Do** prefer *paired* comparison where possible: same signal, filter on vs filter off
  (Role A from `01-bookmap-explained.md` §5). Pairing removes the common market variance
  and can cut the required n by an order of magnitude.
- **Do** report confidence intervals, not point estimates. `tools/ev_compare.py`
  bootstraps them for you.

## 3. The measurement protocol

1. **Freeze the rules.** Write each strategy as an unambiguous if/then. If you cannot
   write it down, you cannot measure it — that is a finding, not an obstacle.
2. **Log every trade** into `data/trades_template.csv`, including the ones you skipped
   for discretionary reasons (`taken=0`). Skipped trades are how you find out whether
   your discretion adds or destroys value.
3. **Tag the Bookmap context** on every row: `bm_phenomenon` (absorption / sweep /
   iceberg / spoof / void / none) and `bm_level_quality` (1–3). These columns are what
   let the tool answer the *real* question: "does the Bookmap read add EV, and to which
   strategy?"
4. **Run** `python3 tools/ev_compare.py data/trades.csv`.
5. **Re-run weekly.** Watch the confidence interval narrow. Declare a winner only when
   the intervals stop overlapping.

## 4. Reading the tool's output

```
STRATEGY RANKING (by expected $ per day, net of costs)
name          n    win%   E[R]   CI95[R]         E_$/day    t-stat  maxDD_R  Kelly
------------------------------------------------------------------------------------
sweep_reversal  212  0.44   0.181  [ 0.041, 0.318]   289.60    2.61    -7.4    0.09
vwap_fade       340  0.61   0.062  [-0.019, 0.144]   105.40    1.49   -11.2    0.03
```

- `CI95` crossing zero ⇒ **not yet proven**, regardless of how good `E[R]` looks.
- `t-stat` below ~2.0 ⇒ same conclusion.
- `Kelly` is the *full* Kelly fraction. Trade a quarter of it at most; full Kelly on an
  estimated edge is how accounts blow up.
- The tool also prints an **A/B section** comparing each strategy with and without the
  Bookmap filter, which is the answer to "is Bookmap adding EV for me."

## 5. What "expected value" cannot tell you

EV is an average over an assumed-stationary process. Markets are not stationary. A
strategy that worked in a low-volatility regime can have negative EV in the next one.
So: segment the output by regime (the tool splits by ATR quartile if you provide the
`atr` column) and re-check that the winner is the winner in more than one regime.
