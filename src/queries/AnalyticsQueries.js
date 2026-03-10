const { ObjectId } = require("mongodb");
const { getReadDb } = require("../db");
const AppError = require("../errors/AppError");

const _cache = new Map();
const CACHE_TTL_MS = 30_000;

function cached(key, fn) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return Promise.resolve(entry.data);

  return fn().then((data) => {
    _cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

function invalidateCache() {
  _cache.clear();
}

class AnalyticsQueries {
  static async count({ collection, restaurantId, status }) {
    if (!collection) throw AppError.badRequest("collection required");
    const db = getReadDb();

    const filter = {};
    if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);
    if (status) filter.status = status;

    const count = await db.collection(collection).countDocuments(filter);
    return { collection, filter, count };
  }

  static async distinct({ collection, field, restaurantId }) {
    if (!collection || !field) throw AppError.badRequest("collection and field required");
    const db = getReadDb();

    const filter = {};
    if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);

    const values = await db.collection(collection).distinct(field, filter);
    return { collection, field, values };
  }

  static async topRestaurants({ minReviews = 1, limit = 10 }) {
    const db = getReadDb();
    return db
      .collection("reviews")
      .aggregate([
        { $group: { _id: "$restaurantId", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
        { $match: { count: { $gte: parseInt(minReviews) } } },
        { $sort: { avgRating: -1 } },
        { $limit: parseInt(limit) },
        { $lookup: { from: "restaurants", localField: "_id", foreignField: "_id", as: "restaurant" } },
        { $unwind: "$restaurant" },
        {
          $project: {
            "restaurant.name": 1, "restaurant.cuisineTypes": 1, "restaurant.address": 1,
            avgRating: { $round: ["$avgRating", 1] }, reviewCount: "$count",
          },
        },
      ])
      .toArray();
  }

  static async bestSellingItems({ restaurantId, limit = 20 }) {
    const db = getReadDb();
    const matchStage = { status: "delivered" };
    if (restaurantId) matchStage.restaurantId = new ObjectId(restaurantId);

    return db
      .collection("orders")
      .aggregate([
        { $match: matchStage },
        { $unwind: "$items" },
        { $group: { _id: "$items.menuItemId", name: { $first: "$items.name" }, totalQty: { $sum: "$items.quantity" }, totalRevenue: { $sum: "$items.subtotal" } } },
        { $sort: { totalQty: -1 } },
        { $limit: parseInt(limit) },
        { $lookup: { from: "menu_items", localField: "_id", foreignField: "_id", as: "menuItem" } },
        { $unwind: { path: "$menuItem", preserveNullAndEmptyArrays: true } },
        { $project: { name: 1, totalQty: 1, totalRevenue: { $round: ["$totalRevenue", 2] }, category: "$menuItem.category", price: "$menuItem.price" } },
      ])
      .toArray();
  }

  static async revenueByMonth({ restaurantId }) {
    const db = getReadDb();
    const matchStage = { status: "delivered" };
    if (restaurantId) matchStage.restaurantId = new ObjectId(restaurantId);

    return db
      .collection("orders")
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { restaurantId: "$restaurantId", year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            totalRevenue: { $sum: "$total" }, orderCount: { $sum: 1 }, avgOrderValue: { $avg: "$total" },
          },
        },
        { $sort: { "_id.year": -1, "_id.month": -1 } },
        { $lookup: { from: "restaurants", localField: "_id.restaurantId", foreignField: "_id", as: "restaurant" } },
        { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            restaurantName: { $ifNull: ["$restaurant.name", "Unknown"] },
            year: "$_id.year", month: "$_id.month",
            totalRevenue: { $round: ["$totalRevenue", 2] }, orderCount: 1,
            avgOrderValue: { $round: ["$avgOrderValue", 2] },
          },
        },
      ])
      .toArray();
  }

  static async ratingDistribution(restaurantId) {
    const db = getReadDb();
    const results = await db
      .collection("reviews")
      .aggregate([
        { $match: { restaurantId: new ObjectId(restaurantId) } },
        { $group: { _id: "$rating", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $group: { _id: null, distribution: { $push: { rating: "$_id", count: "$count" } }, total: { $sum: "$count" }, avgRating: { $avg: { $multiply: ["$_id", "$count"] } } } },
        { $project: { _id: 0, distribution: 1, total: 1 } },
      ])
      .toArray();

    return results[0] || { distribution: [], total: 0 };
  }

  static async orderVelocity(restaurantId, { hoursBack = 1 }) {
    const db = getReadDb();
    const since = new Date(Date.now() - parseInt(hoursBack) * 3600000);

    return db
      .collection("order_events")
      .aggregate([
        { $match: { "metadata.restaurantId": new ObjectId(restaurantId), toStatus: "pending", timestamp: { $gte: since } } },
        { $group: { _id: { $dateTrunc: { date: "$timestamp", unit: "minute", binSize: 5 } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { window: "$_id", count: 1, _id: 0 } },
      ])
      .toArray();
  }

  static async avgTransitionTime(restaurantId) {
    const db = getReadDb();
    return db
      .collection("order_events")
      .aggregate([
        { $match: { "metadata.restaurantId": new ObjectId(restaurantId), eventType: "status_change" } },
        { $group: { _id: { from: "$fromStatus", to: "$toStatus" }, avgDurationSec: { $avg: "$durationFromPrevSec" }, count: { $sum: 1 } } },
        { $sort: { avgDurationSec: -1 } },
        { $project: { _id: 0, from: "$_id.from", to: "$_id.to", avgDurationSec: { $round: ["$avgDurationSec", 0] }, count: 1 } },
      ])
      .toArray();
  }

  static async tags({ limit = 15 }) {
    const db = getReadDb();
    return db
      .collection("reviews")
      .aggregate([
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: parseInt(limit) },
        { $project: { tag: "$_id", count: 1, _id: 0 } },
      ])
      .toArray();
  }

  static async allergens() {
    const db = getReadDb();
    return db
      .collection("menu_items")
      .aggregate([
        { $unwind: "$allergens" },
        { $group: { _id: "$allergens", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { allergen: "$_id", count: 1, _id: 0 } },
      ])
      .toArray();
  }

  static async revenueByCategory({ restaurantId }) {
    const db = getReadDb();
    const matchStage = { status: "delivered" };
    if (restaurantId) matchStage.restaurantId = new ObjectId(restaurantId);

    return db
      .collection("orders")
      .aggregate([
        { $match: matchStage },
        { $unwind: "$items" },
        { $lookup: { from: "menu_items", localField: "items.menuItemId", foreignField: "_id", as: "menuItem" } },
        { $unwind: { path: "$menuItem", preserveNullAndEmptyArrays: true } },
        { $group: { _id: { $ifNull: ["$menuItem.category", "Unknown"] }, totalRevenue: { $sum: "$items.subtotal" }, totalQty: { $sum: "$items.quantity" } } },
        { $sort: { totalRevenue: -1 } },
        { $project: { category: "$_id", totalRevenue: { $round: ["$totalRevenue", 2] }, totalQty: 1, _id: 0 } },
      ])
      .toArray();
  }

  static async dailyRevenue({ restaurantId, days = 30 }) {
    const db = getReadDb();
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));
    since.setUTCHours(0, 0, 0, 0);

    const matchStage = { status: "delivered", createdAt: { $gte: since } };
    if (restaurantId) matchStage.restaurantId = new ObjectId(restaurantId);

    return db
      .collection("orders")
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dateTrunc: { date: "$createdAt", unit: "day" } },
            totalRevenue: { $sum: "$total" },
            orderCount: { $sum: 1 },
            avgOrderValue: { $avg: "$total" },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            date: { $dateToString: { format: "%Y-%m-%d", date: "$_id" } },
            totalRevenue: { $round: ["$totalRevenue", 2] },
            orderCount: 1,
            avgOrderValue: { $round: ["$avgOrderValue", 2] },
          },
        },
      ])
      .toArray();
  }

  static async restaurantStats({ skip = 0, limit = 20 }) {
    const db = getReadDb();
    return db
      .collection("restaurant_stats")
      .aggregate([
        { $sort: { avgRating: -1 } },
        { $skip: parseInt(skip) },
        { $limit: parseInt(limit) },
        { $lookup: { from: "restaurants", localField: "_id", foreignField: "_id", as: "rest" } },
        { $unwind: { path: "$rest", preserveNullAndEmptyArrays: true } },
        { $addFields: { restaurantName: { $ifNull: ["$rest.name", "Unknown"] } } },
        { $project: { rest: 0 } },
      ])
      .toArray();
  }

  static async dashboard() {
    const [
      countOrders, countReviews,
      distinctStatus, distinctCategories,
      topRestaurants, bestItems,
      revMonth, revCategory,
      tags, allergens,
      restStats, dailyRev,
    ] = await Promise.all([
      cached("dash:count_orders", () => this.count({ collection: "orders", status: "delivered" })),
      cached("dash:count_reviews", () => this.count({ collection: "reviews" })),
      cached("dash:distinct_status", () => this.distinct({ collection: "orders", field: "status" })),
      cached("dash:distinct_categories", () => this.distinct({ collection: "menu_items", field: "category" })),
      cached("dash:top_rest", () => this.topRestaurants({ limit: 10 })),
      cached("dash:best_items", () => this.bestSellingItems({ limit: 10 })),
      cached("dash:rev_month", () => this.revenueByMonth({})),
      cached("dash:rev_category", () => this.revenueByCategory({})),
      cached("dash:tags", () => this.tags({ limit: 15 })),
      cached("dash:allergens", () => this.allergens()),
      cached("dash:rest_stats", () => this.restaurantStats({ limit: 10 })),
      cached("dash:daily_rev", () => this.dailyRevenue({ days: 30 })),
    ]);

    return {
      count_orders: countOrders,
      count_reviews: countReviews,
      distinct_status: distinctStatus,
      distinct_categories: distinctCategories,
      top_rest: topRestaurants,
      best_items: bestItems,
      rev_month: revMonth,
      rev_category: revCategory,
      tags,
      allergens,
      rest_stats: restStats,
      daily_rev: dailyRev,
    };
  }
}

AnalyticsQueries.invalidateCache = invalidateCache;

module.exports = AnalyticsQueries;
