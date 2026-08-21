#!/usr/bin/env python3
"""
ev_compare.py -- rank trading strategies by expected value, honestly.

Reads a trade log CSV (see data/trades_template.csv) and reports, per strategy:
  n, win rate, mean R, bootstrapped 95% CI on mean R, expected $/day, t-stat,
  max drawdown in R, and an approximate Kelly fraction.

It then answers the two questions that actually matter:
  1. Is the difference between the top two strategies statistically real?
  2. Does the Bookmap filter add expected value, per strategy (paired A/B)?

Stdlib only. Usage:
    python3 tools/ev_compare.py data/trades.csv
    python3 tools/ev_compare.py --demo            # synthetic data, to see the output
    python3 tools/ev_compare.py data/trades.csv --by-regime
"""

import argparse
import csv
import math
import random
import statistics
import sys
from collections import defaultdict

BOOTSTRAP_N = 10000
SEED = 20260821


# ----------------------------------------------------------------- loading


def load_trades(path):
    """Read the CSV and return a list of normalized trade dicts."""
    trades = []
    with open(path, newline="") as fh:
        for lineno, row in enumerate(csv.DictReader(fh), start=2):
            if not row.get("strategy"):
                continue
            if str(row.get("taken", "1")).strip() in ("0", "false", "False", "no"):
                continue  # skipped setups are analyzed separately, not ranked
            try:
                trade = normalize(row)
            except (ValueError, TypeError, KeyError) as exc:
                print(f"  ! skipping line {lineno}: {exc}", file=sys.stderr)
                continue
            trades.append(trade)
    return trades


def normalize(row):
    """Turn one CSV row into {strategy, r, date, bm_pass, atr}."""
    r_dollars = float(row["r_dollars"])
    if r_dollars <= 0:
        raise ValueError("r_dollars must be > 0 (it is the dollar risk on the trade)")
    pnl = float(row["pnl_dollars"])
    fees = float(row.get("fees_dollars") or 0.0)
    return {
        "strategy": row["strategy"].strip(),
        "r": (pnl - fees) / r_dollars,          # net R multiple, costs included
        "r_dollars": r_dollars,
        "date": (row.get("date") or "").strip(),
        "bm_pass": str(row.get("bm_filter_pass", "")).strip() in ("1", "true", "True", "yes"),
        "bm_phenomenon": (row.get("bm_phenomenon") or "none").strip(),
        "atr": float(row["atr"]) if row.get("atr") else None,
    }


# ----------------------------------------------------------------- statistics


def bootstrap_ci(values, statfn=statistics.mean, n=BOOTSTRAP_N, alpha=0.05):
    """Percentile bootstrap CI. Returns (low, high)."""
    if len(values) < 2:
        return (float("nan"), float("nan"))
    rng = random.Random(SEED)
    k = len(values)
    means = []
    for _ in range(n):
        means.append(statfn([values[rng.randrange(k)] for _ in range(k)]))
    means.sort()
    lo = means[int((alpha / 2) * n)]
    hi = means[min(n - 1, int((1 - alpha / 2) * n))]
    return (lo, hi)


def t_stat(values):
    if len(values) < 2:
        return float("nan")
    sd = statistics.stdev(values)
    if sd == 0:
        return float("inf") if statistics.mean(values) > 0 else 0.0
    return statistics.mean(values) / sd * math.sqrt(len(values))


def max_drawdown_r(values):
    """Worst peak-to-trough of the cumulative R curve, in R."""
    peak = cum = 0.0
    worst = 0.0
    for r in values:
        cum += r
        peak = max(peak, cum)
        worst = min(worst, cum - peak)
    return worst


def kelly_fraction(values):
    """f* ~= E[R] / E[R^2]; the standard small-edge Kelly approximation.
    This is FULL Kelly on an *estimated* edge -- trade at most a quarter of it."""
    if not values:
        return float("nan")
    mean_sq = statistics.mean([r * r for r in values])
    if mean_sq == 0:
        return 0.0
    return statistics.mean(values) / mean_sq


def required_n(sigma, delta):
    """Trades per arm needed to detect a difference `delta` in mean R (95%/80%)."""
    if delta <= 0:
        return float("inf")
    return 16.0 * (sigma / delta) ** 2


def summarize(name, trades):
    rs = [t["r"] for t in trades]
    days = len({t["date"] for t in trades if t["date"]}) or 1
    avg_r_dollars = statistics.mean([t["r_dollars"] for t in trades])
    lo, hi = bootstrap_ci(rs)
    mean_r = statistics.mean(rs)
    return {
        "name": name,
        "n": len(rs),
        "win_rate": sum(1 for r in rs if r > 0) / len(rs),
        "mean_r": mean_r,
        "sd_r": statistics.stdev(rs) if len(rs) > 1 else float("nan"),
        "ci": (lo, hi),
        "trades_per_day": len(rs) / days,
        "e_daily": mean_r * (len(rs) / days) * avg_r_dollars,
        "t": t_stat(rs),
        "maxdd": max_drawdown_r(rs),
        "kelly": kelly_fraction(rs),
        "rs": rs,
    }


# ----------------------------------------------------------------- reporting


def print_ranking(rows):
    print("\nSTRATEGY RANKING (by expected $ per day, net of costs)")
    header = (f"{'name':<20}{'n':>5}{'win%':>7}{'E[R]':>8}{'CI95[R]':>20}"
              f"{'E_$/day':>11}{'t':>7}{'maxDD_R':>9}{'Kelly':>8}")
    print(header)
    print("-" * len(header))
    for s in rows:
        if math.isnan(s["ci"][0]):
            ci, flag = "[ n too small ]", "   <- need >= 2 trades"
        else:
            ci = f"[{s['ci'][0]:+.3f},{s['ci'][1]:+.3f}]"
            flag = "" if s["ci"][0] > 0 else "   <- CI includes 0: NOT PROVEN"
        print(f"{s['name']:<20}{s['n']:>5}{s['win_rate']:>7.2f}{s['mean_r']:>8.3f}"
              f"{ci:>20}{s['e_daily']:>11.2f}{s['t']:>7.2f}{s['maxdd']:>9.1f}"
              f"{s['kelly']:>8.3f}{flag}")


def print_head_to_head(a, b):
    print(f"\nHEAD TO HEAD: {a['name']}  vs  {b['name']}")
    rng = random.Random(SEED + 1)
    diffs = []
    for _ in range(BOOTSTRAP_N):
        ma = statistics.mean([a["rs"][rng.randrange(len(a["rs"]))] for _ in a["rs"]])
        mb = statistics.mean([b["rs"][rng.randrange(len(b["rs"]))] for _ in b["rs"]])
        diffs.append(ma - mb)
    diffs.sort()
    lo, hi = diffs[int(0.025 * BOOTSTRAP_N)], diffs[int(0.975 * BOOTSTRAP_N)]
    p_better = sum(1 for d in diffs if d > 0) / BOOTSTRAP_N
    print(f"  mean R difference : {a['mean_r'] - b['mean_r']:+.3f} R")
    print(f"  95% CI on diff    : [{lo:+.3f}, {hi:+.3f}]")
    print(f"  P({a['name']} > {b['name']}) = {p_better:.1%}")
    sds = [x for x in (a["sd_r"], b["sd_r"]) if not math.isnan(x)]
    delta = abs(a["mean_r"] - b["mean_r"])
    need = required_n(statistics.mean(sds), delta) if sds and delta > 0 else float("inf")
    print(f"  trades per arm needed to call this at 95%/80%: "
          f"{'more than you have' if need == float('inf') else int(need)}  "
          f"(you have {a['n']} / {b['n']})")
    if lo > 0 and a["n"] >= need and b["n"] >= need:
        print(f"  VERDICT: {a['name']} is the higher-EV strategy, and the sample is")
        print("           large enough to have expected to detect this. Reallocate.")
    elif lo > 0:
        print(f"  VERDICT: {a['name']} leads and its CI excludes zero, but the sample")
        print("           is below the power threshold above -- treat as provisional.")
    else:
        print("  VERDICT: not separable yet. Keep logging; do not reallocate size.")


def print_bookmap_ab(by_strategy):
    print("\nBOOKMAP FILTER A/B (does the order-flow read add EV?)")
    header = f"{'strategy':<20}{'n_pass':>8}{'E[R]|pass':>11}{'n_fail':>8}{'E[R]|fail':>11}{'delta':>9}"
    print(header)
    print("-" * len(header))
    any_row = False
    for name, trades in sorted(by_strategy.items()):
        p = [t["r"] for t in trades if t["bm_pass"]]
        f = [t["r"] for t in trades if not t["bm_pass"]]
        if not p or not f:
            continue
        any_row = True
        d = statistics.mean(p) - statistics.mean(f)
        print(f"{name:<20}{len(p):>8}{statistics.mean(p):>11.3f}"
              f"{len(f):>8}{statistics.mean(f):>11.3f}{d:>+9.3f}")
    if not any_row:
        print("  (need trades with bm_filter_pass both 0 and 1 in the same strategy)")
    else:
        print("  A positive delta means the Bookmap read is adding expected value.")
        print("  This is the paired comparison from docs/02 section 2 -- it needs far")
        print("  fewer trades than an unpaired strategy-vs-strategy test.")


def print_phenomenon_breakdown(trades):
    buckets = defaultdict(list)
    for t in trades:
        buckets[t["bm_phenomenon"]].append(t["r"])
    if len(buckets) < 2:
        return
    print("\nBY BOOKMAP PHENOMENON (all strategies pooled)")
    header = f"{'phenomenon':<20}{'n':>6}{'E[R]':>8}{'win%':>8}"
    print(header)
    print("-" * len(header))
    for k, rs in sorted(buckets.items(), key=lambda kv: -statistics.mean(kv[1])):
        wr = sum(1 for r in rs if r > 0) / len(rs)
        print(f"{k:<20}{len(rs):>6}{statistics.mean(rs):>8.3f}{wr:>8.2f}")


def print_regime_split(by_strategy):
    print("\nBY VOLATILITY REGIME (ATR quartiles -- is the winner robust?)")
    atrs = sorted(t["atr"] for ts in by_strategy.values() for t in ts if t["atr"] is not None)
    if len(atrs) < 8:
        print("  (need an `atr` column populated on at least 8 trades)")
        return
    q1, q3 = atrs[len(atrs) // 4], atrs[3 * len(atrs) // 4]
    for label, test in (("low vol", lambda a: a <= q1),
                        ("mid vol", lambda a: q1 < a <= q3),
                        ("high vol", lambda a: a > q3)):
        print(f"  {label}:")
        for name, ts in sorted(by_strategy.items()):
            rs = [t["r"] for t in ts if t["atr"] is not None and test(t["atr"])]
            if rs:
                print(f"    {name:<20}n={len(rs):<5} E[R]={statistics.mean(rs):+.3f}")


# ----------------------------------------------------------------- demo data


def demo_trades():
    """Synthetic log so you can see the report shape before you have real data."""
    rng = random.Random(SEED)
    out = []
    specs = [
        # name,            p_win, win_R, loss_R, per_day, bm_edge
        ("sweep_reversal", 0.44, 1.9, -0.95, 3.0, 0.22),
        ("vwap_fade",      0.61, 0.85, -1.00, 5.0, 0.05),
        ("orb_breakout",   0.38, 2.2, -1.00, 1.5, 0.10),
    ]
    for day in range(90):
        date = f"2026-{(day // 30) + 4:02d}-{(day % 30) + 1:02d}"
        for name, pw, wr, lr, per_day, bm_edge in specs:
            for _ in range(rng.randint(0, int(per_day * 2))):
                bm_pass = rng.random() < 0.55
                p = pw + (bm_edge if bm_pass else -bm_edge * 0.8)
                r = rng.gauss(wr, 0.5) if rng.random() < p else rng.gauss(lr, 0.15)
                out.append({
                    "strategy": name,
                    "r": r,
                    "r_dollars": 250.0,
                    "date": date,
                    "bm_pass": bm_pass,
                    "bm_phenomenon": rng.choice(
                        ["absorption", "sweep", "iceberg", "spoof", "void", "none"]),
                    "atr": rng.uniform(8, 40),
                })
    return out


# ----------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", nargs="?", help="trade log CSV (see data/trades_template.csv)")
    ap.add_argument("--demo", action="store_true", help="run on synthetic data")
    ap.add_argument("--by-regime", action="store_true", help="split results by ATR quartile")
    ap.add_argument("--min-n", type=int, default=10,
                    help="ignore strategies with fewer trades than this (default 10)")
    args = ap.parse_args()

    if args.demo:
        trades = demo_trades()
        print("*** DEMO MODE: synthetic data. Numbers below are fictional. ***")
    elif args.csv:
        trades = load_trades(args.csv)
    else:
        ap.error("give a CSV path or --demo")

    if not trades:
        print("No usable trades found.", file=sys.stderr)
        return 1

    by_strategy = defaultdict(list)
    for t in trades:
        by_strategy[t["strategy"]].append(t)

    rows = [summarize(n, ts) for n, ts in by_strategy.items() if len(ts) >= args.min_n]
    if not rows:
        print(f"No strategy has >= {args.min_n} trades.", file=sys.stderr)
        return 1
    rows.sort(key=lambda s: -s["e_daily"])

    print(f"\nTotal trades analyzed: {len(trades)}   Strategies: {len(rows)}")
    print_ranking(rows)
    if len(rows) >= 2:
        print_head_to_head(rows[0], rows[1])
    print_bookmap_ab(by_strategy)
    print_phenomenon_breakdown(trades)
    if args.by_regime:
        print_regime_split(by_strategy)

    print("\nReminders: CI including 0 means unproven. Trade at most 1/4 Kelly.")
    print("Costs must already be in pnl_dollars/fees_dollars -- gross EV is a fantasy.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
