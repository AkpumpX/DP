# =============================================================================
# AbsorptionReclaim_Strategy.ts
# Strategy A -- "absorption at a liquidity shelf", approximated with the only
# data thinkScript can actually see (time & sales + volume profile).
#
# IMPORTANT HONESTY NOTE
#   thinkScript has NO access to Level 2 / order-book depth. It cannot see the
#   Bookmap heatmap. What follows is a PROXY: the value-area edge of the volume
#   profile stands in for "a shelf of resting liquidity", and a volume spike
#   that fails to extend price stands in for "absorption". A proxy is not the
#   thing. Use Bookmap itself to confirm the read; use this to MEASURE.
#
# HOW TO USE
#   Charts > Studies > Edit Studies > Strategies tab > Create > paste > apply
#   to a 1m/2m /ES (or your symbol) chart. Right-click chart > Strategy Report
#   for the P/L table. Set commissions in the Strategy Report settings or the
#   numbers are fiction.
#
#   AddOrder produces SIMULATED trades only. It cannot and will not place a
#   real or paperMoney order. See docs/03-tos-paper-automation.md.
# =============================================================================

input tradeSize          = 1;
input volSpikeMult       = 2.0;    # volume vs its average to call it "aggression"
input volAvgLength       = 20;
input atrLength          = 14;
input stopATR            = 0.75;   # stop distance beyond the tag, in ATR
input targetIsPOC        = yes;    # exit at point of control (the magnet)
input targetATR          = 1.50;   # used when targetIsPOC = no
input startTime          = 0935;   # skip the opening auction noise
input endTime            = 1545;   # flat before the close
input valueAreaPercent   = 70.0;

def barTime   = SecondsFromTime(startTime) >= 0 and SecondsTillTime(endTime) > 0;
def newDay    = GetDay() != GetDay()[1];

# ---- volume profile: our stand-in for the liquidity map -----------------------
profile vp = VolumeProfile("startNewProfile" = newDay, "onExpansion" = no,
                           "numberOfProfiles" = 1, "pricePerRow" = PricePerRow.TICKSIZE,
                           "value area percent" = valueAreaPercent);
def poc = if IsNaN(vp.GetPointOfControl())    then poc[1] else vp.GetPointOfControl();
def vah = if IsNaN(vp.GetHighestValueArea())  then vah[1] else vp.GetHighestValueArea();
def val = if IsNaN(vp.GetLowestValueArea())   then val[1] else vp.GetLowestValueArea();

# ---- aggression proxy --------------------------------------------------------
def avgVol     = Average(volume, volAvgLength);
def volSpike   = volume >= avgVol * volSpikeMult;
def atr        = ATR(atrLength);

# ---- absorption proxy --------------------------------------------------------
# Price pokes THROUGH the value-area edge on heavy volume, but closes back
# inside. Heavy aggression that did not move price = someone passive ate it.
def tagLow     = low  <  val and close > val and volSpike;
def tagHigh    = high >  vah and close < vah and volSpike;

# require the bar to actually be rejected, not just wide
def rejectedUp = (close - low)  >= (high - low) * 0.6;
def rejectedDn = (high - close) >= (high - low) * 0.6;

def longSignal  = barTime and tagLow  and rejectedUp;
def shortSignal = barTime and tagHigh and rejectedDn;

# ---- risk ---------------------------------------------------------------------
def longStop  = low  - stopATR * atr;
def shortStop = high + stopATR * atr;
def longTgt   = if targetIsPOC then poc else close + targetATR * atr;
def shortTgt  = if targetIsPOC then poc else close - targetATR * atr;

# only take the trade if the target is actually further than the stop (>= 1R)
def longOK  = longSignal  and (longTgt  - close) >= (close - longStop);
def shortOK = shortSignal and (close - shortTgt) >= (shortStop - close);

# ---- orders (fill on the NEXT bar's open -- never on the signal bar's close) --
AddOrder(OrderType.BUY_TO_OPEN,  longOK,  open[-1], tradeSize,
         Color.GREEN, Color.GREEN, "A-LONG");
AddOrder(OrderType.SELL_TO_CLOSE,
         low <= longStop[1] or high >= longTgt[1] or SecondsTillTime(endTime) <= 0,
         open[-1], tradeSize, Color.RED, Color.RED, "A-LX");

AddOrder(OrderType.SELL_TO_OPEN, shortOK, open[-1], tradeSize,
         Color.RED, Color.RED, "A-SHORT");
AddOrder(OrderType.BUY_TO_CLOSE,
         high >= shortStop[1] or low <= shortTgt[1] or SecondsTillTime(endTime) <= 0,
         open[-1], tradeSize, Color.GREEN, Color.GREEN, "A-SX");

AddLabel(yes, "A: absorption/reclaim  POC=" + Round(poc, 2) +
              "  VA=[" + Round(val, 2) + "," + Round(vah, 2) + "]", Color.GRAY);
