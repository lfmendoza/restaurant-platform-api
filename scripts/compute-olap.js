// compute-olap.js — Compute restaurant_stats + daily_revenue from existing OLTP data
// Ejecutar: mongosh "mongodb+srv://..." scripts/compute-olap.js
const db = db.getSiblingDB("restaurant_orders");

// Clean OLAP
db.restaurant_stats.deleteMany({});
db.daily_revenue.deleteMany({});

// 1. Restaurant Stats
print("Computing restaurant_stats...");
const statsDocs = db.orders.aggregate([
  { $match: { status: "delivered" } },
  { $group: {
    _id: "$restaurantId",
    totalDelivered: { $sum: 1 },
    totalRevenue: { $sum: "$total" },
    avgOrderValue: { $avg: "$total" },
    lastOrderAt: { $max: "$createdAt" }
  }},
  { $lookup: { from: "reviews", localField: "_id", foreignField: "restaurantId", as: "revs" } },
  { $addFields: {
    totalReviews: { $size: "$revs" },
    avgRating: { $cond: [{ $gt: [{ $size: "$revs" }, 0] }, { $round: [{ $avg: "$revs.rating" }, 1] }, 0] },
    ratingDistribution: {
      "1": { $size: { $filter: { input: "$revs", cond: { $eq: ["$$this.rating", 1] } } } },
      "2": { $size: { $filter: { input: "$revs", cond: { $eq: ["$$this.rating", 2] } } } },
      "3": { $size: { $filter: { input: "$revs", cond: { $eq: ["$$this.rating", 3] } } } },
      "4": { $size: { $filter: { input: "$revs", cond: { $eq: ["$$this.rating", 4] } } } },
      "5": { $size: { $filter: { input: "$revs", cond: { $eq: ["$$this.rating", 5] } } } }
    }
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
    avgRating: 1,
    ratingDistribution: 1,
    lastOrderAt: 1,
    lastUpdated: new Date()
  }}
]).toArray();
if (statsDocs.length > 0) db.restaurant_stats.insertMany(statsDocs);

db.orders.aggregate([
  { $match: { status: "cancelled" } },
  { $group: { _id: "$restaurantId", cnt: { $sum: 1 } } }
]).toArray().forEach(function(doc) {
  db.restaurant_stats.updateOne({ _id: doc._id }, { $set: { totalCancelled: doc.cnt } }, { upsert: true });
});
print("  restaurant_stats: " + db.restaurant_stats.countDocuments());

// 2. Daily Revenue
print("Computing daily_revenue...");
const revDocs = db.orders.aggregate([
  { $match: { status: "delivered" } },
  { $group: {
    _id: { restaurantId: "$restaurantId", date: { $dateTrunc: { date: "$createdAt", unit: "day" } } },
    revenue: { $sum: "$total" },
    orderCount: { $sum: 1 },
    avgOrderValue: { $avg: "$total" }
  }},
  { $addFields: { restaurantId: "$_id.restaurantId", date: "$_id.date", deliveredCount: "$orderCount", cancelledCount: 0, cancelRate: 0 } },
  { $project: { _id: 0 } }
]).toArray();
if (revDocs.length > 0) db.daily_revenue.insertMany(revDocs);
print("  daily_revenue: " + db.daily_revenue.countDocuments());

print("\nOLAP computation complete.");
