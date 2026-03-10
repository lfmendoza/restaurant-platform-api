const { getDb } = require("../db");

async function runDailyRevenue(targetDate) {
  const db = getDb();
  const date = targetDate ? new Date(targetDate) : new Date();

  const startOfDay = new Date(date);
  startOfDay.setDate(startOfDay.getDate() - 1);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setUTCHours(0, 0, 0, 0);

  console.log(`Daily revenue: ${startOfDay.toISOString()} → ${endOfDay.toISOString()}`);

  await db.collection("orders").aggregate([
    {
      $match: {
        status: "delivered",
        updatedAt: { $gte: startOfDay, $lt: endOfDay },
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: {
          restaurantId: "$restaurantId",
          date: { $dateTrunc: { date: "$createdAt", unit: "day" } },
        },
        revenue: { $sum: "$total" },
        orderCount: { $sum: 1 },
        deliveredCount: { $sum: 1 },
        avgOrderValue: { $avg: "$total" },
      },
    },
    {
      $addFields: {
        restaurantId: "$_id.restaurantId",
        date: "$_id.date",
        cancelledCount: 0,
        cancelRate: 0,
      },
    },
    { $project: { _id: 0 } },
    {
      $merge: {
        into: "daily_revenue",
        on: ["restaurantId", "date"],
        whenMatched: "replace",
        whenNotMatched: "insert",
      },
    },
  ]).toArray();

  const count = await db.collection("daily_revenue").countDocuments();
  console.log(`Daily revenue complete. daily_revenue documents: ${count}`);
  return { count };
}

async function runWeeklyReconciliation() {
  const db = getDb();
  console.log("Starting weekly reconciliation...");

  await db.collection("orders").aggregate([
    { $match: { status: "delivered" } },
    {
      $group: {
        _id: "$restaurantId",
        totalDelivered: { $sum: 1 },
        totalRevenue: { $sum: "$total" },
        avgOrderValue: { $avg: "$total" },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
    {
      $lookup: {
        from: "reviews",
        localField: "_id",
        foreignField: "restaurantId",
        as: "reviews",
      },
    },
    {
      $addFields: {
        totalReviews: { $size: "$reviews" },
        avgRating: {
          $cond: [
            { $gt: [{ $size: "$reviews" }, 0] },
            { $avg: "$reviews.rating" },
            0,
          ],
        },
      },
    },
    {
      $lookup: {
        from: "restaurants",
        localField: "_id",
        foreignField: "_id",
        as: "rest",
      },
    },
    { $unwind: { path: "$rest", preserveNullAndEmptyArrays: true } },
    {
      $project: {
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
        lastUpdated: new Date(),
      },
    },
    {
      $merge: {
        into: "restaurant_stats",
        on: "_id",
        whenMatched: "replace",
        whenNotMatched: "insert",
      },
    },
  ]).toArray();

  const count = await db.collection("restaurant_stats").countDocuments();
  console.log(`Weekly reconciliation complete. restaurant_stats documents: ${count}`);
  return { count };
}

module.exports = { runDailyRevenue, runWeeklyReconciliation };
