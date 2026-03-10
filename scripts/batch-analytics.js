// batch-analytics.js
// Pipelines de batch processing para daily_revenue y restaurant_stats reconciliation
// Ejecutar: mongosh <connection_string> scripts/batch-analytics.js

const db = db.getSiblingDB("restaurant_orders");

// ========== JOB 1: Daily Revenue Aggregation ==========
print("=== Job 1: Daily Revenue Aggregation ===");

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday.setUTCHours(0, 0, 0, 0);
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

print(`Processing delivered orders from ${yesterday.toISOString()} to ${today.toISOString()}`);

db.orders.aggregate([
  { $match: { status: "delivered", updatedAt: { $gte: yesterday, $lt: today } } },
  { $group: {
    _id: { restaurantId: "$restaurantId", date: { $dateTrunc: { date: "$createdAt", unit: "day" } } },
    revenue: { $sum: "$total" },
    orderCount: { $sum: 1 },
    deliveredCount: { $sum: 1 },
    avgOrderValue: { $avg: "$total" }
  }},
  { $addFields: {
    restaurantId: "$_id.restaurantId",
    date: "$_id.date",
    cancelledCount: 0,
    cancelRate: 0
  }},
  { $project: { _id: 0 } },
  { $merge: { into: "daily_revenue", on: ["restaurantId", "date"], whenMatched: "replace", whenNotMatched: "insert" } }
]);

print(`daily_revenue documents: ${db.daily_revenue.countDocuments()}`);

// ========== JOB 2: Restaurant Stats Full Reconciliation ==========
print("\n=== Job 2: Restaurant Stats Full Reconciliation ===");

db.orders.aggregate([
  { $facet: {
    delivered: [
      { $match: { status: "delivered" } },
      { $group: {
        _id: "$restaurantId",
        totalOrders: { $sum: 1 },
        totalDelivered: { $sum: 1 },
        totalRevenue: { $sum: "$total" },
        avgOrderValue: { $avg: "$total" },
        lastOrderAt: { $max: "$createdAt" }
      }}
    ],
    cancelled: [
      { $match: { status: "cancelled" } },
      { $group: {
        _id: "$restaurantId",
        totalCancelled: { $sum: 1 }
      }}
    ]
  }}
]);

// Simplified version using sequential aggregation
db.orders.aggregate([
  { $match: { status: "delivered" } },
  { $group: {
    _id: "$restaurantId",
    totalDelivered: { $sum: 1 },
    totalRevenue: { $sum: "$total" },
    avgOrderValue: { $avg: "$total" },
    lastOrderAt: { $max: "$createdAt" }
  }},
  { $lookup: { from: "reviews", localField: "_id", foreignField: "restaurantId", as: "reviews" } },
  { $addFields: {
    totalReviews: { $size: "$reviews" },
    avgRating: { $cond: [{ $gt: [{ $size: "$reviews" }, 0] }, { $avg: "$reviews.rating" }, 0] }
  }},
  { $lookup: { from: "restaurants", localField: "_id", foreignField: "_id", as: "rest" } },
  { $unwind: { path: "$rest", preserveNullAndEmptyArrays: true } },
  { $project: {
    _id: 1,
    restaurantName: { $ifNull: ["$rest.name", "Unknown"] },
    totalOrders: "$totalDelivered",
    totalDelivered: 1,
    totalCancelled: { $literal: 0 },
    totalRevenue: { $round: ["$totalRevenue", 2] },
    avgOrderValue: { $round: ["$avgOrderValue", 2] },
    totalReviews: 1,
    avgRating: { $round: [{ $ifNull: ["$avgRating", 0] }, 1] },
    lastOrderAt: 1,
    lastUpdated: new Date()
  }},
  { $merge: { into: "restaurant_stats", on: "_id", whenMatched: "replace", whenNotMatched: "insert" } }
]);

print(`restaurant_stats documents: ${db.restaurant_stats.countDocuments()}`);

// ========== SUMMARY ==========
print("\n=== Batch Analytics Complete ===");
print(`daily_revenue: ${db.daily_revenue.countDocuments()} documents`);
print(`restaurant_stats: ${db.restaurant_stats.countDocuments()} documents`);
