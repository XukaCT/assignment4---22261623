// Single source of truth for client constraints and model parameters.
// A copy of MODEL_PARAMS is frozen into runs.config_json when a run is created,
// and the Model Declaration is generated from that stored copy.

const CLIENT = {
  simDays: 60,
  openingCash: 15000,
  inventoryBudget: 40000,
  leadTimeDays: 1,
  firstDayWeekday: 'Monday', // Day 1 = Monday; days 6,7,13,14... are weekends
};

const MODEL_PARAMS = {
  customers: {
    // Mean customers entering the store by weekday (Mon..Sun): CBD commuter trade
    // makes weekdays busier than weekends.
    baseByWeekday: [150, 155, 155, 160, 170, 120, 95],
    dailyNoiseSigma: 0.1, // day-to-day variation (weather, events)
    openHour: 6,
    // Relative arrival weight for each hour from openHour (06:00) to 23:00
    hourlyWeekday: [3, 8, 11, 6, 4, 6, 11, 9, 5, 5, 6, 10, 9, 6, 4, 3, 2, 1.5],
    hourlyWeekend: [1, 2, 3, 5, 8, 9, 10, 9, 8, 7, 6, 6, 6, 5, 4, 3, 2, 1],
  },

  // Shopping missions. basketMean = mean number of distinct products.
  // affinity = relative pull towards each category group (unlisted groups use `otherAffinity`).
  missions: {
    commuter: {
      label: 'Commuter grab-and-go',
      basketMean: 2.0,
      affinity: { drinks: 3, snacks: 2.5, ready: 3, bakery: 1.5, dairy: 0.7 },
    },
    office_lunch: {
      label: 'Office lunch',
      basketMean: 2.6,
      affinity: { ready: 4, drinks: 3, snacks: 2, fresh: 1.5, bakery: 1.5 },
    },
    top_up: {
      label: 'Top-up shop',
      basketMean: 4.0,
      affinity: { dairy: 3, bakery: 2.5, fresh: 3, grocery: 2.5, drinks: 1, household: 1, personal: 0.8, frozen: 1.5 },
    },
    household: {
      label: 'Household stock-up',
      basketMean: 5.0,
      affinity: { household: 3, personal: 3, grocery: 2.5, dairy: 1.5, drinks: 1.2, frozen: 1.5 },
    },
  },
  otherAffinity: 0.25,

  // Mission mix by time band. Bands: morning 06-09, midday 10-14, afternoon 15-17, evening 18-23.
  missionMix: {
    weekday: {
      morning:   { commuter: 0.6,  office_lunch: 0.15, top_up: 0.15, household: 0.1 },
      midday:    { commuter: 0.1,  office_lunch: 0.6,  top_up: 0.2,  household: 0.1 },
      afternoon: { commuter: 0.3,  office_lunch: 0.15, top_up: 0.35, household: 0.2 },
      evening:   { commuter: 0.25, office_lunch: 0.1,  top_up: 0.4,  household: 0.25 },
    },
    weekend: {
      morning:   { commuter: 0.2, office_lunch: 0.05, top_up: 0.45, household: 0.3 },
      midday:    { commuter: 0.2, office_lunch: 0.05, top_up: 0.45, household: 0.3 },
      afternoon: { commuter: 0.2, office_lunch: 0.05, top_up: 0.45, household: 0.3 },
      evening:   { commuter: 0.2, office_lunch: 0.05, top_up: 0.45, household: 0.3 },
    },
  },

  product: {
    // popularity = exp(N(0, sigma)) * (priceAnchor / price)^priceExponent, drawn once per product at run creation
    popularitySigma: 0.6,
    priceAnchor: 8,
    priceExponent: 0.25,
    multiUnitProbability: 0.2, // chance a cheap item (< multiUnitPriceLimit) is bought twice
    multiUnitPriceLimit: 8,
  },

  brain: {
    demandWindowDays: 7, // rolling window for average daily sales
    safetyDays: 2, // extra cover on top of the lead time (non-perishables)
    safetyDaysPerishable: 1,
    targetCoverDays: 5, // order up to this many days of demand after delivery
    expiryWarningDays: 2, // warn when a batch expires within this many days
    slowCoverDays: 25, // slow-moving if stock > this many days of demand
    slowMinHistoryDays: 7, // do not judge slow movers before this many days
  },
};

const EVENT_TYPES = [
  'low_stock',
  'sold_out',
  'expiry_warning',
  'expired',
  'slow_moving',
  'replenishment_ordered',
  'cash_constrained',
];

module.exports = { CLIENT, MODEL_PARAMS, EVENT_TYPES };
