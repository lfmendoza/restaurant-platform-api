// setup-change-streams.js
// Configura los 3 procesadores de Change Streams
// Este script es de referencia para la implementación en Node.js
// En mongosh, Change Streams son síncronos; en producción usar el driver nativo

const db = db.getSiblingDB("restaurant_orders");

print("=== Change Stream Processor Definitions ===\n");

print("Processor #1: orders → order_events + restaurant_stats");
print("Watches: orders collection (insert + update)");
print("Actions:");
print("  - On insert: create order_events entry (status: pending), inc restaurant_stats.totalOrders");
print("  - On update (status change to delivered): inc totalDelivered, totalRevenue");
print("  - On update (status change to cancelled): inc totalCancelled");
print("");

print("Processor #2: reviews → restaurant_stats");
print("Watches: reviews collection (insert)");
print("Actions:");
print("  - Incremental average: newAvg = (oldAvg * oldCount + newRating) / (oldCount + 1)");
print("  - $inc totalReviews, ratingDistribution[rating]");
print("");

print("Processor #3: menu_items → restaurants.menuItemCount");
print("Watches: menu_items collection (insert + delete)");
print("Actions:");
print("  - On insert: $inc restaurants.menuItemCount +1");
print("  - On delete: $inc restaurants.menuItemCount -1");
print("");

// Demo: watch orders for 10 seconds
print("Demo: Watching orders collection for 10 seconds...");
print("(In production, this runs as a long-lived Node.js process)\n");

const cursor = db.orders.watch(
  [{ $match: { operationType: { $in: ["insert", "update"] } } }],
  { fullDocument: "updateLookup" }
);

const deadline = new Date(Date.now() + 10000);
while (cursor.hasNext() && new Date() < deadline) {
  try {
    if (cursor.tryNext()) {
      const change = cursor.tryNext();
      if (change) {
        print("Change detected: " + change.operationType + " on " + change.ns.coll);
        print("  Document ID: " + change.documentKey._id);
      }
    }
  } catch (e) {
    break;
  }
}
cursor.close();
print("Demo complete. In production, use the Node.js driver for long-lived streams.");
