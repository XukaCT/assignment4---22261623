// Simulated Store World: who shops, when, and what they put in the basket.

const GROUP_RULES = [
  [/ready|meal|deli|sandwich|hot food/, 'ready'],
  [/drink|beverage/, 'drinks'],
  [/snack|confection|chip|sweet|chocolate/, 'snacks'],
  [/dairy|chilled|milk|egg|yog/, 'dairy'],
  [/bakery|bread/, 'bakery'],
  [/fresh|produce|fruit|veg|meat/, 'fresh'],
  [/frozen/, 'frozen'],
  [/household|clean|laundry/, 'household'],
  [/personal|health|beauty|convenience|toiletr/, 'personal'],
  [/grocery|pantry|canned|staple|cereal/, 'grocery'],
];

function categoryGroup(category) {
  const c = String(category).toLowerCase();
  for (const [re, group] of GROUP_RULES) if (re.test(c)) return group;
  return 'other';
}

function isWeekend(day) {
  return ((day - 1) % 7) >= 5; 
}

function timeBand(hour) {
  if (hour <= 9) return 'morning';
  if (hour <= 14) return 'midday';
  if (hour <= 17) return 'afternoon';
  return 'evening';
}

// Product popularity is part of the frozen run configuration.
function drawPopularity(rng, product, params) {
  const p = params.product;
  const base = Math.exp(rng.normal() * p.popularitySigma);
  const priceEffect = Math.pow(p.priceAnchor / Math.max(product.unit_price, 1), p.priceExponent);
  return Number((base * priceEffect).toFixed(4));
}

// Returns the day's customers, ordered by arrival hour: [{ hour, mission }]
function generateCustomers(rng, day, params) {
  const c = params.customers;
  const weekend = isWeekend(day);
  const weekday = (day - 1) % 7;
  const mean = c.baseByWeekday[weekday] * Math.max(0.5, 1 + rng.normal() * c.dailyNoiseSigma);
  const count = Math.max(0, Math.round(mean));
  const profile = weekend ? c.hourlyWeekend : c.hourlyWeekday;
  const mix = params.missionMix[weekend ? 'weekend' : 'weekday'];
  const missionKeys = Object.keys(params.missions);

  const customers = [];
  for (let i = 0; i < count; i += 1) {
    const hour = c.openHour + rng.weightedIndex(profile);
    const weights = mix[timeBand(hour)];
    const mission = missionKeys[rng.weightedIndex(missionKeys.map((k) => weights[k] || 0))];
    customers.push({ hour, mission });
  }
  return customers.sort((a, b) => a.hour - b.hour);
}

// Builds a basket from products currently in stock. `available` items look like
// { id, group, popularity, unitPrice, qty } and are not mutated here.
function buildBasket(rng, mission, available, params) {
  const m = params.missions[mission];
  const size = 1 + rng.poisson(Math.max(m.basketMean - 1, 0));
  const pool = available.slice();
  const basket = [];

  while (basket.length < size && pool.length > 0) {
    const weights = pool.map((p) => p.popularity * (m.affinity[p.group] ?? params.otherAffinity));
    const idx = rng.weightedIndex(weights);
    if (idx < 0) break;
    const [item] = pool.splice(idx, 1);
    let qty = 1;
    if (item.unitPrice < params.product.multiUnitPriceLimit && rng.next() < params.product.multiUnitProbability) qty = 2;
    basket.push({ productId: item.id, qty: Math.min(qty, item.qty) });
  }
  return basket;
}

module.exports = { categoryGroup, isWeekend, drawPopularity, generateCustomers, buildBasket };
