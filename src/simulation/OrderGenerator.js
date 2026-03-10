const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const {
  poissonNextArrival,
  weightedRandom,
  uniformInt,
  pickRandom,
  shuffleArray,
} = require("./distributions");

const PAYMENT_METHODS = ["card", "cash", "transfer"];

class OrderGenerator {
  constructor({ onOrderCreated } = {}) {
    this.onOrderCreated = onOrderCreated || (() => {});
    this.seedData = null;
    this.paused = false;
    this._nextTimer = null;
    this._stopped = false;
  }

  async loadSeedData() {
    const db = getDb();

    const [users, restaurants, menuItems, zones] = await Promise.all([
      db.collection("users").find({}, { projection: { _id: 1, defaultAddress: 1 } }).limit(100).toArray(),
      db.collection("restaurants").find(
        { isActive: true, isAcceptingOrders: true },
        { projection: { _id: 1, name: 1, cuisineTypes: 1, menuItemCount: 1, address: 1 } }
      ).limit(200).toArray(),
      db.collection("menu_items").find(
        { available: true },
        { projection: { _id: 1, restaurantId: 1, name: 1, price: 1, category: 1 } }
      ).limit(5000).toArray(),
      db.collection("delivery_zones").find(
        { isActive: true },
        { projection: { _id: 1, restaurantId: 1, zoneName: 1, deliveryFee: 1, estimatedMinutes: 1, area: 1 } }
      ).limit(500).toArray(),
    ]);

    const menuByRestaurant = {};
    for (const item of menuItems) {
      const key = item.restaurantId.toString();
      if (!menuByRestaurant[key]) menuByRestaurant[key] = [];
      menuByRestaurant[key].push(item);
    }

    const zonesByRestaurant = {};
    for (const zone of zones) {
      const key = zone.restaurantId.toString();
      if (!zonesByRestaurant[key]) zonesByRestaurant[key] = [];
      zonesByRestaurant[key].push(zone);
    }

    this.seedData = {
      users,
      restaurants: restaurants.filter(
        (r) => menuByRestaurant[r._id.toString()]?.length > 0
      ),
      menuByRestaurant,
      zonesByRestaurant,
      zoneNames: [...new Set(zones.map((z) => z.zoneName))],
    };

    return this.seedData;
  }

  async runStratifiedSweep() {
    const { restaurants, zonesByRestaurant, zoneNames } = this.seedData;
    const maxSweep = 60;
    const restaurantsToUse = shuffleArray(restaurants).slice(0, maxSweep);

    const paymentCycle = [...PAYMENT_METHODS];
    const usedZones = new Set();
    const docs = [];

    for (const restaurant of restaurantsToUse) {
      if (this._stopped) break;
      if (usedZones.size >= zoneNames.length && paymentCycle.length === 0) break;

      const rZones = zonesByRestaurant[restaurant._id.toString()];
      if (!rZones || rZones.length === 0) continue;

      const zone = rZones[0];
      if (usedZones.has(zone.zoneName) && paymentCycle.length === 0) continue;

      usedZones.add(zone.zoneName);
      const payment = paymentCycle.length > 0 ? paymentCycle.shift() : pickRandom(PAYMENT_METHODS);

      const doc = this._buildOrderDoc(restaurant, zone, payment);
      if (doc) docs.push(doc);
    }

    if (docs.length === 0) return [];

    const db = getDb();
    const result = await db.collection("orders").insertMany(docs, { ordered: false });

    return docs.map((doc, i) => ({
      _id: result.insertedIds[i],
      ...doc,
    }));
  }

  startPoissonProcess({ baseRate = 10, peakMultiplier = 3 } = {}) {
    if (this._stopped || this.paused) return;

    const lambda = this._currentLambda(baseRate, peakMultiplier);
    const delayMs = poissonNextArrival(lambda);

    this._nextTimer = setTimeout(async () => {
      if (this._stopped || this.paused) return;

      try {
        const order = await this._createRandomOrder();
        if (order) this.onOrderCreated(order);
      } catch (err) {
        console.error("OrderGenerator Poisson error:", err.message);
      }

      this.startPoissonProcess({ baseRate, peakMultiplier });
    }, delayMs);
  }

  _currentLambda(baseRate, peakMultiplier) {
    const hour = new Date().getHours();
    const isLunchPeak = hour >= 12 && hour < 14;
    const isDinnerPeak = hour >= 19 && hour < 21;
    if (isLunchPeak || isDinnerPeak) return baseRate * peakMultiplier;
    return baseRate;
  }

  async _createRandomOrder() {
    const { restaurants, zonesByRestaurant } = this.seedData;

    const weights = restaurants.map((r) => r.menuItemCount || 1);
    const restaurant = weightedRandom(restaurants, weights);

    const rZones = zonesByRestaurant[restaurant._id.toString()];
    if (!rZones || rZones.length === 0) return null;

    const zone = pickRandom(rZones);
    const payment = pickRandom(PAYMENT_METHODS);

    return this._createOrder(restaurant, zone, payment);
  }

  _buildOrderDoc(restaurant, zone, paymentMethod) {
    const { users, menuByRestaurant } = this.seedData;

    const user = pickRandom(users);
    const restaurantMenu = menuByRestaurant[restaurant._id.toString()];
    if (!restaurantMenu || restaurantMenu.length === 0) return null;

    const numItems = uniformInt(1, Math.min(5, restaurantMenu.length));
    const selectedItems = shuffleArray(restaurantMenu).slice(0, numItems);

    const items = selectedItems.map((item) => {
      const quantity = uniformInt(1, 3);
      return {
        menuItemId: item._id,
        name: item.name,
        quantity,
        unitPrice: item.price,
        subtotal: Math.round(item.price * quantity * 100) / 100,
      };
    });

    const subtotal = Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
    const tax = Math.round(subtotal * 0.12 * 100) / 100;
    const deliveryFee = zone.deliveryFee || 15;
    const total = Math.round((subtotal + tax + deliveryFee) * 100) / 100;

    const now = new Date();
    const estimatedMinutes = zone.estimatedMinutes || 30;

    const deliveryCoords = user.defaultAddress?.coordinates || {
      type: "Point",
      coordinates: [-90.51, 14.59],
    };

    return {
      orderNumber: `SIM-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      userId: user._id,
      restaurantId: restaurant._id,
      items,
      deliveryAddress: {
        street: user.defaultAddress?.street || "Simulated Address",
        city: user.defaultAddress?.city || "Guatemala",
        zone: restaurant.address?.zone || "Zona 10",
        coordinates: deliveryCoords,
      },
      status: "pending",
      statusHistory: [{ status: "pending", timestamp: now, actor: "simulation", durationFromPrevSec: 0 }],
      subtotal,
      tax,
      deliveryFee,
      total,
      paymentMethod,
      cancellationReason: null,
      estimatedDelivery: new Date(now.getTime() + estimatedMinutes * 60000),
      createdAt: now,
      updatedAt: now,
      _simulated: true,
      cuisineType: restaurant.cuisineTypes?.[0] || null,
    };
  }

  async _createOrder(restaurant, zone, paymentMethod) {
    const doc = this._buildOrderDoc(restaurant, zone, paymentMethod);
    if (!doc) return null;

    const db = getDb();
    const result = await db.collection("orders").insertOne(doc);
    return { _id: result.insertedId, ...doc };
  }

  pause() {
    this.paused = true;
    if (this._nextTimer) {
      clearTimeout(this._nextTimer);
      this._nextTimer = null;
    }
  }

  resume(opts) {
    this.paused = false;
    this.startPoissonProcess(opts);
  }

  stop() {
    this._stopped = true;
    this.paused = true;
    if (this._nextTimer) {
      clearTimeout(this._nextTimer);
      this._nextTimer = null;
    }
  }
}

module.exports = OrderGenerator;
