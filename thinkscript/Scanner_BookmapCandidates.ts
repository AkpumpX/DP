# =============================================================================
# Scanner_BookmapCandidates.ts
# Not a trade trigger -- a WATCHLIST BUILDER. Its job is to hand you the three
# or four names worth putting a Bookmap heatmap on before the open, so you are
# not staring at an instrument with no liquidity story.
#
# INSTALL: Scan tab > Add Study Filter > pencil icon > thinkScript editor >
#          paste > set to "is true".
#
# Criteria: enough relative volume to have a real book, enough range to pay for
# the spread, and a price sitting near a decision level rather than mid-range.
# =============================================================================

input rvolLength     = 20;
input minRvol        = 1.5;
input minATRPercent  = 0.8;    # ATR as % of price -- filters out dead names
input nearLevelATR   = 0.5;    # how close to a value-area edge counts as "at" it

def rvol = volume / Average(volume, rvolLength);
def atr  = ATR(14);
def atrPct = 100 * atr / close;

def newDay = GetDay() != GetDay()[1];
profile vp = VolumeProfile("startNewProfile" = newDay, "onExpansion" = no,
                           "numberOfProfiles" = 1, "pricePerRow" = PricePerRow.TICKSIZE,
                           "value area percent" = 70.0);
def vah = if IsNaN(vp.GetHighestValueArea()) then vah[1] else vp.GetHighestValueArea();
def val = if IsNaN(vp.GetLowestValueArea())  then val[1] else vp.GetLowestValueArea();

def atLevel = AbsValue(close - vah) <= nearLevelATR * atr
           or AbsValue(close - val) <= nearLevelATR * atr;

plot scan = rvol >= minRvol and atrPct >= minATRPercent and atLevel;
