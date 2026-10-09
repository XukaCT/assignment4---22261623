// Seeded PRNG (mulberry32) so every run is reproducible from its stored seed.
function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const normal = () => {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };

  const poisson = (lambda) => {
    if (lambda <= 0) return 0;
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= next();
    } while (p > limit);
    return k - 1;
  };

  // Pick an index from an array of non-negative weights.
  const weightedIndex = (weights) => {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return -1;
    let r = next() * total;
    for (let i = 0; i < weights.length; i += 1) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  };

  return { next, normal, poisson, weightedIndex };
}

module.exports = { createRng };
