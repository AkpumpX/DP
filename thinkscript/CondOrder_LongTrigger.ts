# =============================================================================
# CondOrder_LongTrigger.ts
# The ONE study that thinkorswim will let you attach to a Conditional Order.
#
# HARD CONSTRAINT: a study used in a conditional order must expose EXACTLY ONE
# plot. Not two. Not a plot plus a label. One. That is why this file is a
# stripped copy of AbsorptionReclaim_Strategy.ts's long entry and nothing else.
#
# INSTALL
#   1. Studies > Edit Studies > Create > name it CondOrder_LongTrigger > paste.
#   2. Trade tab > build your BUY order (paperMoney account selected!).
#   3. Order row gear icon > Advanced Order > Conditional Order > Study.
#   4. Pick CondOrder_LongTrigger, symbol, aggregation (match your chart!),
#      condition "is true".
#   5. Attach an OCO bracket (see docs/03) BEFORE you send. Never arm an entry
#      without its exit already attached.
#
# BEHAVIOR: the order is submitted the moment the plot goes non-zero. It is
# ONE AND DONE -- it does not re-arm after it fills. Re-arm it manually, or
# accept one trade per session, which is the sane default while testing.
# =============================================================================

input volSpikeMult     = 2.0;
input volAvgLength     = 20;
input startTime        = 0935;
input endTime          = 1545;
input valueAreaPercent = 70.0;

def barTime = SecondsFromTime(startTime) >= 0 and SecondsTillTime(endTime) > 0;
def newDay  = GetDay() != GetDay()[1];

profile vp = VolumeProfile("startNewProfile" = newDay, "onExpansion" = no,
                           "numberOfProfiles" = 1, "pricePerRow" = PricePerRow.TICKSIZE,
                           "value area percent" = valueAreaPercent);
def val = if IsNaN(vp.GetLowestValueArea()) then val[1] else vp.GetLowestValueArea();

def volSpike   = volume >= Average(volume, volAvgLength) * volSpikeMult;
def tagLow     = low < val and close > val and volSpike;
def rejectedUp = (close - low) >= (high - low) * 0.6;

plot signal = barTime and tagLow and rejectedUp;
