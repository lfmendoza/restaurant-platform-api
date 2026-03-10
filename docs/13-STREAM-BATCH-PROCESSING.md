# 13. Stream Processing y Batch Processing

## 13.1 Stream Processing: Change Streams

### Processor #1: Orders → order_events + restaurant_stats

```javascript
const pipeline = [
  { $match: { operationType: { $in: ["insert", "update"] } } }
];

const changeStream = db.orders.watch(pipeline, { fullDocument: "updateLookup" });

changeStream.on("change", async (change) => {
  const order = change.fullDocument;

  if (change.operationType === "insert") {
    // Nuevo pedido → evento + stats
    await db.order_events.insertOne({
      timestamp: new Date(),
      metadata: { orderId: order._id, restaurantId: order.restaurantId, userId: order.userId },
      eventType: "created",
      fromStatus: null,
      toStatus: "pending",
      durationFromPrevSec: 0,
      context: { paymentMethod: order.paymentMethod, total: order.total }
    });

    await db.restaurant_stats.updateOne(
      { _id: order.restaurantId },
      { $inc: { totalOrders: 1 }, $set: { lastOrderAt: new Date(), lastUpdated: new Date() } },
      { upsert: true }
    );
  }

  if (change.operationType === "update" && change.updateDescription.updatedFields.status) {
    const newStatus = change.updateDescription.updatedFields.status;
    const lastHistory = order.statusHistory[order.statusHistory.length - 1];
    const prevHistory = order.statusHistory[order.statusHistory.length - 2];

    // Emitir evento de transición
    await db.order_events.insertOne({
      timestamp: new Date(),
      metadata: { orderId: order._id, restaurantId: order.restaurantId, userId: order.userId },
      eventType: "status_change",
      fromStatus: prevHistory?.status || null,
      toStatus: newStatus,
      durationFromPrevSec: lastHistory?.durationFromPrevSec || 0,
      context: { actor: lastHistory?.actor }
    });

    // Actualizar stats en eventos terminales
    if (newStatus === "delivered") {
      await db.restaurant_stats.updateOne(
        { _id: order.restaurantId },
        {
          $inc: { totalDelivered: 1, totalRevenue: order.total },
          $set: { lastUpdated: new Date() }
        }
      );
    }

    if (newStatus === "cancelled") {
      await db.restaurant_stats.updateOne(
        { _id: order.restaurantId },
        { $inc: { totalCancelled: 1 }, $set: { lastUpdated: new Date() } }
      );
    }
  }
});
```

### Processor #2: Reviews → restaurant_stats

```javascript
const reviewStream = db.reviews.watch(
  [{ $match: { operationType: "insert" } }],
  { fullDocument: "updateLookup" }
);

reviewStream.on("change", async (change) => {
  const review = change.fullDocument;

  const stats = await db.restaurant_stats.findOne({ _id: review.restaurantId });
  const oldCount = stats?.totalReviews || 0;
  const oldAvg = stats?.avgRating || 0;
  const newAvg = ((oldAvg * oldCount) + review.rating) / (oldCount + 1);

  await db.restaurant_stats.updateOne(
    { _id: review.restaurantId },
    {
      $inc: { totalReviews: 1, [`ratingDistribution.${review.rating}`]: 1 },
      $set: { avgRating: Math.round(newAvg * 10) / 10, lastReviewAt: new Date(), lastUpdated: new Date() }
    },
    { upsert: true }
  );
});
```

### Processor #3: Menu Items → restaurants

```javascript
const menuStream = db.menu_items.watch(
  [{ $match: { operationType: { $in: ["insert", "delete"] } } }]
);

menuStream.on("change", async (change) => {
  if (change.operationType === "insert") {
    await db.restaurants.updateOne(
      { _id: change.fullDocument.restaurantId },
      { $inc: { menuItemCount: 1 } }
    );
  }
  if (change.operationType === "delete") {
    const doc = change.documentKey;
    // Note: on delete, fullDocument is not available unless using preImage
    await db.restaurants.updateOne(
      { _id: change.ns.coll }, // requires preImage or separate tracking
      { $inc: { menuItemCount: -1 } }
    );
  }
});
```

---

## 13.2 Resumability de Change Streams

```javascript
let resumeToken = null;

changeStream.on("change", (change) => {
  resumeToken = change._id; // guardar token
  // procesar...
});

// Si el proceso se reinicia:
const resumedStream = db.orders.watch(pipeline, { resumeAfter: resumeToken });
```

Los Change Streams son **resumable**: si el proceso cae, puede reanudar desde el último token procesado sin perder eventos.

---

## 13.3 Batch Processing

### Job 1: Nightly Daily Revenue ($merge)

```javascript
// Ejecutar a las 02:00 UTC diariamente
async function computeDailyRevenue(targetDate) {
  const startOfDay = new Date(targetDate); startOfDay.setUTCHours(0,0,0,0);
  const endOfDay = new Date(targetDate); endOfDay.setUTCHours(23,59,59,999);

  await db.orders.aggregate([
    { $match: { status: "delivered", updatedAt: { $gte: startOfDay, $lte: endOfDay } } },
    { $group: {
      _id: { restaurantId: "$restaurantId", date: { $dateTrunc: { date: "$createdAt", unit: "day" } } },
      revenue: { $sum: "$total" },
      orderCount: { $sum: 1 },
      deliveredCount: { $sum: 1 },
      avgOrderValue: { $avg: "$total" }
    } },
    { $addFields: { restaurantId: "$_id.restaurantId", date: "$_id.date", cancelledCount: 0, cancelRate: 0 } },
    { $merge: { into: "daily_revenue", on: ["restaurantId", "date"], whenMatched: "replace", whenNotMatched: "insert" } }
  ]).toArray();
}
```

### Job 2: Weekly Stats Reconciliation

```javascript
// Ejecutar semanalmente
async function reconcileRestaurantStats() {
  await db.orders.aggregate([
    { $match: { status: "delivered" } },
    { $group: {
      _id: "$restaurantId",
      totalOrders: { $sum: 1 }, totalDelivered: { $sum: 1 },
      totalRevenue: { $sum: "$total" }, avgOrderValue: { $avg: "$total" },
      lastOrderAt: { $max: "$createdAt" }
    } },
    { $lookup: { from: "reviews", localField: "_id", foreignField: "restaurantId", as: "reviews" } },
    { $addFields: { totalReviews: { $size: "$reviews" }, avgRating: { $ifNull: [{ $avg: "$reviews.rating" }, 0] } } },
    { $lookup: { from: "restaurants", localField: "_id", foreignField: "_id", as: "rest" } },
    { $unwind: "$rest" },
    { $project: { _id: 1, restaurantName: "$rest.name", totalOrders: 1, totalDelivered: 1, totalRevenue: 1, avgOrderValue: 1, lastOrderAt: 1, totalReviews: 1, avgRating: 1, totalCancelled: 0, lastUpdated: new Date() } },
    { $merge: { into: "restaurant_stats", on: "_id", whenMatched: "replace", whenNotMatched: "insert" } }
  ]).toArray();
}
```
