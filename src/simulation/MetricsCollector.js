class MetricsCollector {
  constructor({ slidingWindowSec = 60, peakBucketSec = 300 } = {}) {
    this.slidingWindowMs = slidingWindowSec * 1000;
    this.peakBucketMs = peakBucketSec * 1000;
    this.reset();
  }

  reset() {
    this.totalCreated = 0;
    this.totalCompleted = 0;
    this.totalCancelled = 0;

    this.completionTimestamps = [];
    this.latencies = [];

    this.concurrency = 0;
    this.peakConcurrency = 0;
    this.concurrencyHistory = [];

    this.zoneHeatmap = {};
    this.statusDistribution = {
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready_for_pickup: 0,
      picked_up: 0,
      delivered: 0,
      cancelled: 0,
    };

    this.patternsByPayment = {};
    this.patternsByCuisine = {};
    this.patternsByHour = {};

    this.startTime = null;
  }

  start() {
    this.startTime = Date.now();
  }

  recordOrderCreated(order) {
    this.totalCreated++;
    this.concurrency++;

    if (this.concurrency > this.peakConcurrency) {
      this.peakConcurrency = this.concurrency;
    }

    this._recordConcurrencyPoint();

    this.statusDistribution.pending++;

    const zoneName = order.deliveryAddress?.zone || "unknown";
    this.zoneHeatmap[zoneName] = (this.zoneHeatmap[zoneName] || 0) + 1;

    const payment = order.paymentMethod || "unknown";
    this.patternsByPayment[payment] = (this.patternsByPayment[payment] || 0) + 1;

    if (order.cuisineType) {
      this.patternsByCuisine[order.cuisineType] =
        (this.patternsByCuisine[order.cuisineType] || 0) + 1;
    }

    const hour = new Date().getHours();
    const hourKey = `${String(hour).padStart(2, "0")}:00`;
    this.patternsByHour[hourKey] = (this.patternsByHour[hourKey] || 0) + 1;
  }

  recordTransition(fromStatus, toStatus, order) {
    if (fromStatus && this.statusDistribution[fromStatus] > 0) {
      this.statusDistribution[fromStatus]--;
    }
    this.statusDistribution[toStatus] = (this.statusDistribution[toStatus] || 0) + 1;

    const isTerminal = toStatus === "delivered" || toStatus === "cancelled";
    if (isTerminal) {
      this.concurrency = Math.max(0, this.concurrency - 1);
      this._recordConcurrencyPoint();
      this.completionTimestamps.push(Date.now());

      if (toStatus === "delivered") {
        this.totalCompleted++;
      } else {
        this.totalCancelled++;
      }

      if (order?.createdAt) {
        const latencyMs = Date.now() - new Date(order.createdAt).getTime();
        this.latencies.push(latencyMs);
      }
    }
  }

  _recordConcurrencyPoint() {
    this.concurrencyHistory.push({
      timestamp: Date.now(),
      value: this.concurrency,
    });
  }

  _throughput() {
    const cutoff = Date.now() - this.slidingWindowMs;
    const recent = this.completionTimestamps.filter((t) => t >= cutoff);
    return recent.length;
  }

  _percentile(sortedArr, p) {
    if (sortedArr.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, idx)];
  }

  _latencyStats() {
    if (this.latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0, count: 0 };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;

    return {
      p50: this._percentile(sorted, 50),
      p95: this._percentile(sorted, 95),
      p99: this._percentile(sorted, 99),
      avg: Math.round(avg),
      count: sorted.length,
    };
  }

  _peakConcurrencyByBucket() {
    if (this.concurrencyHistory.length === 0) return [];

    const buckets = {};
    for (const point of this.concurrencyHistory) {
      const bucketKey = Math.floor(point.timestamp / this.peakBucketMs) * this.peakBucketMs;
      if (!buckets[bucketKey] || point.value > buckets[bucketKey]) {
        buckets[bucketKey] = point.value;
      }
    }

    return Object.entries(buckets).map(([ts, peak]) => ({
      bucket: new Date(parseInt(ts)).toISOString(),
      peakConcurrency: peak,
    }));
  }

  snapshot() {
    const elapsedMs = this.startTime ? Date.now() - this.startTime : 0;
    const cancellationRate =
      this.totalCreated > 0
        ? Math.round((this.totalCancelled / this.totalCreated) * 10000) / 100
        : 0;

    return {
      elapsed: {
        ms: elapsedMs,
        seconds: Math.round(elapsedMs / 1000),
        formatted: this._formatDuration(elapsedMs),
      },
      orders: {
        totalCreated: this.totalCreated,
        totalCompleted: this.totalCompleted,
        totalCancelled: this.totalCancelled,
        cancellationRate,
      },
      throughput: {
        windowSeconds: this.slidingWindowMs / 1000,
        completedInWindow: this._throughput(),
      },
      latency: this._latencyStats(),
      concurrency: {
        current: this.concurrency,
        peak: this.peakConcurrency,
        byBucket: this._peakConcurrencyByBucket(),
      },
      zoneHeatmap: this.zoneHeatmap,
      statusDistribution: { ...this.statusDistribution },
      patterns: {
        byPaymentMethod: { ...this.patternsByPayment },
        byCuisine: { ...this.patternsByCuisine },
        byHour: { ...this.patternsByHour },
      },
    };
  }

  _formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec}s`;
  }
}

module.exports = MetricsCollector;
