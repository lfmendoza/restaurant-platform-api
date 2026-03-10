// create-indexes.js
// Crear todos los índices (22 total: simple, compuesto, multikey, geoespacial, texto, TTL)
// Ejecutar: mongosh <connection_string> scripts/create-indexes.js

const db = db.getSiblingDB("restaurant_orders");

// USERS
db.users.createIndex({ email: 1 }, { unique: true });

// RESTAURANTS
db.restaurants.createIndex({ location: "2dsphere" });
db.restaurants.createIndex({ cuisineTypes: 1 });

// ========== MENU_ITEMS ==========
db.menu_items.createIndex({ restaurantId: 1 });
db.menu_items.createIndex({ restaurantId: 1, category: 1, available: 1 });
db.menu_items.createIndex({ allergens: 1 });
db.menu_items.createIndex({ name: "text", description: "text" }, { default_language: "spanish" });

// ORDERS
db.orders.createIndex({ orderNumber: 1 }, { unique: true });
db.orders.createIndex({ status: 1 });
db.orders.createIndex({ restaurantId: 1, status: 1, createdAt: -1 });
db.orders.createIndex({ userId: 1, status: 1, createdAt: -1 });

// ========== REVIEWS ==========
db.reviews.createIndex({ restaurantId: 1 });
db.reviews.createIndex({ restaurantId: 1, rating: -1, createdAt: -1 });
db.reviews.createIndex({ tags: 1 });
db.reviews.createIndex({ title: "text", comment: "text" }, { default_language: "spanish" });

// CARTS
db.carts.createIndex({ userId: 1, restaurantId: 1 }, { unique: true });
db.carts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// DELIVERY_ZONES
db.delivery_zones.createIndex({ restaurantId: 1 });
db.delivery_zones.createIndex({ area: "2dsphere" });
db.delivery_zones.createIndex({ area: "2dsphere", isActive: 1 });

// RESTAURANT_STATS
db.restaurant_stats.createIndex({ avgRating: -1 });
db.restaurant_stats.createIndex({ totalRevenue: -1 });

// DAILY_REVENUE
db.daily_revenue.createIndex({ restaurantId: 1, date: -1 });

print("All indexes created successfully.");

// Verify
db.getCollectionNames().forEach(function(coll) {
  const indexes = db.getCollection(coll).getIndexes();
  print(coll + ": " + indexes.length + " indexes");
  indexes.forEach(function(idx) {
    print("  - " + JSON.stringify(idx.key) + (idx.unique ? " (unique)" : "") + (idx.expireAfterSeconds !== undefined ? " (TTL)" : ""));
  });
});
