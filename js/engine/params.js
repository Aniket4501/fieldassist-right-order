// Every coefficient of the Right Order engine, in one place. In production these would be
// per-tenant configuration. None of them comes from measured data: they are stated assumptions.

export const PARAMS = {
  engineVersion: 'v1-cover',
  rateWeeks: 4,             // run-rate: average weekly cases over the last 4 clean weeks
  candidateWeeks: 12,       // a product is a candidate when the outlet booked it in the last 12 weeks
  keyCount: 4,              // key products: the top 4 by expected demand
  shrinkWeight: 6,          // with fewer than 4 clean weeks, lean on similar outlets with this weight
  zSingleInSeason: 0.84,    // buffer for single-serve packs in ramp and peak (covers about 8 weeks in 10)
  cvClip: [0.25, 0.8],      // week-to-week variability is kept inside this range
  cvMinOrders: 4,           // own variability needs at least this many orders of the product
  kClip: [0.3, 2.0],        // seasonal step-up is kept inside this range
  ownStepUpDays: 14,        // last year's own window is read over at least two weeks (orders are lumpy)
  ownStepUpMinCases: 4,     // ...and needs at least this many cases in its 4 base weeks
  maxCoverDays: 14,         // one order covers at most 14 days
  ceilingExtraDays: 7,      // the ceiling is one more week of cover
  overTextCapWeeks: 8,      // "8+ weeks of stock"
  stockUncertainty: 0.35,   // an estimated stock figure is trusted to within 35%...
  stockUncertaintyMin: 0.5, // ...and never closer than half a case
  eventRatioCap: 2.0,       // an event multiplies a day's demand by at most 2
  eventRatioFloor: 0.3,
  eventMaterial: 0.3,       // last year's event week must differ from its neighbours by 30% to count
  eventMaxDays: 14,         // longer "events" (a season, a tournament) are part of the seasonal curve
  schemeNudgeGap: 2,        // talk about the scheme only within 2 cases of the next free case
  confidenceWeeks: 8,       // "enough history" = at least 8 weeks with an order
  stockUpWeeks: 1,          // "stock-up talk" when the outlet needs at least 1 week of its sales
  headlineMax: 60,
  reasonMax: 50,
  hintMax: 48,
  pitchMax: 150,
};
