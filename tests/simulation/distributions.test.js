const {
  exponentialRandom,
  logNormalRandom,
  weightedRandom,
  poissonNextArrival,
  uniformInt,
  shuffleArray,
  pickRandom,
} = require("../../src/simulation/distributions");

describe("exponentialRandom", () => {
  it("throws on non-positive rate", () => {
    expect(() => exponentialRandom(0)).toThrow("rate must be positive");
    expect(() => exponentialRandom(-1)).toThrow("rate must be positive");
  });

  it("returns positive values", () => {
    for (let i = 0; i < 100; i++) {
      expect(exponentialRandom(1)).toBeGreaterThan(0);
    }
  });

  it("mean converges to 1/rate for large samples", () => {
    const rate = 2;
    const samples = Array.from({ length: 10000 }, () => exponentialRandom(rate));
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    expect(mean).toBeCloseTo(1 / rate, 1);
  });
});

describe("logNormalRandom", () => {
  it("returns positive values", () => {
    for (let i = 0; i < 100; i++) {
      expect(logNormalRandom(0, 1)).toBeGreaterThan(0);
    }
  });

  it("median converges to exp(mu) for large samples", () => {
    const mu = 2;
    const sigma = 0.5;
    const samples = Array.from({ length: 10000 }, () => logNormalRandom(mu, sigma));
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    expect(median).toBeCloseTo(Math.exp(mu), 0);
  });
});

describe("weightedRandom", () => {
  it("throws on empty items", () => {
    expect(() => weightedRandom([], [])).toThrow("items must not be empty");
  });

  it("throws on mismatched lengths", () => {
    expect(() => weightedRandom(["a", "b"], [1])).toThrow("same length");
  });

  it("returns only the available items", () => {
    const items = ["a", "b", "c"];
    const weights = [1, 1, 1];
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(weightedRandom(items, weights));
    }
  });

  it("heavily weighted item is selected most often", () => {
    const items = ["rare", "common"];
    const weights = [1, 99];
    const counts = { rare: 0, common: 0 };
    for (let i = 0; i < 1000; i++) {
      counts[weightedRandom(items, weights)]++;
    }
    expect(counts.common).toBeGreaterThan(counts.rare * 5);
  });
});

describe("poissonNextArrival", () => {
  it("throws on non-positive rate", () => {
    expect(() => poissonNextArrival(0)).toThrow("lambdaPerMin must be positive");
  });

  it("returns positive millisecond values", () => {
    for (let i = 0; i < 100; i++) {
      const ms = poissonNextArrival(10);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(ms)).toBe(true);
    }
  });

  it("higher rate produces smaller average intervals", () => {
    const lowRate = Array.from({ length: 1000 }, () => poissonNextArrival(1));
    const highRate = Array.from({ length: 1000 }, () => poissonNextArrival(100));

    const lowMean = lowRate.reduce((s, v) => s + v, 0) / lowRate.length;
    const highMean = highRate.reduce((s, v) => s + v, 0) / highRate.length;

    expect(lowMean).toBeGreaterThan(highMean * 10);
  });
});

describe("uniformInt", () => {
  it("returns values within range", () => {
    for (let i = 0; i < 200; i++) {
      const val = uniformInt(5, 10);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(10);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it("returns single value when min === max", () => {
    expect(uniformInt(7, 7)).toBe(7);
  });
});

describe("shuffleArray", () => {
  it("returns a new array with same elements", () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled).toHaveLength(5);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not mutate the original", () => {
    const arr = [1, 2, 3];
    shuffleArray(arr);
    expect(arr).toEqual([1, 2, 3]);
  });

  it("handles empty array", () => {
    expect(shuffleArray([])).toEqual([]);
  });
});

describe("pickRandom", () => {
  it("returns an element from the array", () => {
    const arr = ["x", "y", "z"];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pickRandom(arr));
    }
  });
});
