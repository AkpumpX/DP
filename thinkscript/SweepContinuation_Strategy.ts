# =============================================================================
# SweepContinuation_Strategy.ts
# Strategy B -- "sweep into a liquidity void", the mirror image of Strategy A.
#
# Same honesty note applies: no order-book access in thinkScript. Here the
# proxy for a VOID is "price is outside the value area, in a region where
# little volume has traded today" -- i.e. nothing overhead to slow it down.
#
# The point of shipping A and B together is that they are structurally
# opposed (fade vs. momentum). Running both through tools/ev_compare.py on the
# same instrument and dates is the cleanest possible EV comparison: identical
# market, identical costs, opposite premise.
# =============================================================================

input tradeSize        = 1;
input volSpikeMult     = 2.5;
input volAvgLength     = 20;
input atrLength        = 14;
input stopATR          = 1.00;
input targetATR        = 2.00;
input orLengthMinutes  = 30;      # opening range
input startTime        = 0935;
input endTime          = 1545;
input valueAreaPercent = 70.0;

def barTime = SecondsFromTime(startTime) >= 0 and SecondsTillTime(endTime) > 0;
def newDay  = GetDay() != GetDay()[1];
def atr     = ATR(atrLength);
def avgVol  = Average(volume, volAvgLength);

profile vp = VolumeProfile("startNewProfile" = newDay, "onExpansion" = no,
                           "numberOfProfiles" = 1, "pricePerRow" = PricePerRow.TICKSIZE,
                           "value area percent" = valueAreaPercent);
def vah = if IsNaN(vp.GetHighestValueArea()) then vah[1] else vp.GetHighestValueArea();
def val = if IsNaN(vp.GetLowestValueArea())  then val[1] else vp.GetLowestValueArea();

# ---- opening range -----------------------------------------------------------
def inOR   = SecondsFromTime(0930) >= 0 and SecondsFromTime(0930) < orLengthMinutes * 60;
def orHigh = if newDay then high else if inOR then Max(orHigh[1], high) else orHigh[1];
def orLow  = if newDay then low  else if inOR then Min(orLow[1],  low)  else orLow[1];

# ---- the sweep ---------------------------------------------------------------
# A level breaks on volume expansion AND price closes beyond the value area,
# i.e. into thin territory. Closing back inside would be a failed sweep.
def volSpike   = volume >= avgVol * volSpikeMult;
def sweepUp    = barTime and not inOR and high > orHigh[1] and close > orHigh[1]
                 and close > vah and volSpike;
def sweepDown  = barTime and not inOR and low  < orLow[1]  and close < orLow[1]
                 and close < val and volSpike;

# don't chase: the bar that swept must not already be a full target's worth
def notExtended = (high - low) <= atr * 1.5;

def longOK  = sweepUp   and notExtended;
def shortOK = sweepDown and notExtended;

def longStop  = close - stopATR * atr;
def shortStop = close + stopATR * atr;
def longTgt   = close + targetATR * atr;
def shortTgt  = close - targetATR * atr;

AddOrder(OrderType.BUY_TO_OPEN,  longOK,  open[-1], tradeSize,
         Color.CYAN, Color.CYAN, "B-LONG");
AddOrder(OrderType.SELL_TO_CLOSE,
         low <= longStop[1] or high >= longTgt[1] or SecondsTillTime(endTime) <= 0,
         open[-1], tradeSize, Color.RED, Color.RED, "B-LX");

AddOrder(OrderType.SELL_TO_OPEN, shortOK, open[-1], tradeSize,
         Color.MAGENTA, Color.MAGENTA, "B-SHORT");
AddOrder(OrderType.BUY_TO_CLOSE,
         high >= shortStop[1] or low <= shortTgt[1] or SecondsTillTime(endTime) <= 0,
         open[-1], tradeSize, Color.CYAN, Color.CYAN, "B-SX");

AddLabel(yes, "B: sweep continuation  OR=[" + Round(orLow, 2) + "," +
              Round(orHigh, 2) + "]", Color.GRAY);
