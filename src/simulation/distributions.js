function exponentialRandom(rate) {
  if (rate <= 0) throw new Error("rate must be positive");
  return -Math.log(1 - Math.random()) / rate;
}

function logNormalRandom(mu, sigma) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + sigma * z);
}

function weightedRandom(items, weights) {
  if (items.length === 0) throw new Error("items must not be empty");
  if (items.length !== weights.length) throw new Error("items and weights must have same length");

  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function poissonNextArrival(lambdaPerMin) {
  if (lambdaPerMin <= 0) throw new Error("lambdaPerMin must be positive");
  const intervalMin = exponentialRandom(lambdaPerMin);
  return Math.round(intervalMin * 60 * 1000);
}

function uniformInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  exponentialRandom,
  logNormalRandom,
  weightedRandom,
  poissonNextArrival,
  uniformInt,
  shuffleArray,
  pickRandom,
};
