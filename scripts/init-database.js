// init-database.js
// Crear colecciones con validación JSON Schema + Time Series
// Ejecutar: mongosh <connection_string> scripts/init-database.js

const dbName = "restaurant_orders";
const db = db.getSiblingDB(dbName);

// Drop existing (development only)
// db.dropDatabase();

// ========== OLTP COLLECTIONS ==========

db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "name", "role", "createdAt", "updatedAt"],
      properties: {
        email: { bsonType: "string" },
        name: { bsonType: "string", minLength: 1 },
        role: { enum: ["customer", "restaurant_admin"] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  }
});

db.createCollection("restaurants", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "location", "address", "operatingHours", "cuisineTypes", "isActive", "isAcceptingOrders", "menuItemCount", "createdAt", "updatedAt"],
      properties: {
        name: { bsonType: "string", minLength: 1 },
        location: {
          bsonType: "object",
          required: ["type", "coordinates"],
          properties: {
            type: { enum: ["Point"] },
            coordinates: { bsonType: "array", minItems: 2, maxItems: 2 }
          }
        },
        isActive: { bsonType: "bool" },
        isAcceptingOrders: { bsonType: "bool" },
        menuItemCount: { bsonType: "int", minimum: 0 },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  }
});

db.createCollection("menu_items", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["restaurantId", "name", "price", "category", "available", "salesCount", "createdAt", "updatedAt"],
      properties: {
        restaurantId: { bsonType: "objectId" },
        name: { bsonType: "string", minLength: 1 },
        price: { bsonType: "number", minimum: 0 },
        category: { bsonType: "string" },
        available: { bsonType: "bool" },
        salesCount: { bsonType: "int", minimum: 0 },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  }
});

db.createCollection("orders", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["orderNumber", "userId", "restaurantId", "items", "status", "statusHistory", "total", "paymentMethod", "createdAt", "updatedAt"],
      properties: {
        orderNumber: { bsonType: "string" },
        userId: { bsonType: "objectId" },
        restaurantId: { bsonType: "objectId" },
        items: { bsonType: "array", minItems: 1 },
        status: { enum: ["pending", "confirmed", "preparing", "ready_for_pickup", "picked_up", "delivered", "cancelled"] },
        total: { bsonType: "number" },
        paymentMethod: { bsonType: "string" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  }
});

db.createCollection("reviews", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "restaurantId", "rating", "createdAt"],
      properties: {
        userId: { bsonType: "objectId" },
        restaurantId: { bsonType: "objectId" },
        rating: { bsonType: "int", minimum: 1, maximum: 5 },
        createdAt: { bsonType: "date" }
      }
    }
  }
});

db.createCollection("carts", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "restaurantId", "items", "subtotal", "hasUnavailableItems", "expiresAt"],
      properties: {
        userId: { bsonType: "objectId" },
        restaurantId: { bsonType: "objectId" },
        items: { bsonType: "array" },
        subtotal: { bsonType: "number" },
        hasUnavailableItems: { bsonType: "bool" },
        expiresAt: { bsonType: "date" }
      }
    }
  }
});

db.createCollection("delivery_zones", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["restaurantId", "zoneName", "area", "deliveryFee", "estimatedMinutes", "isActive"],
      properties: {
        restaurantId: { bsonType: "objectId" },
        zoneName: { bsonType: "string" },
        area: { bsonType: "object" },
        deliveryFee: { bsonType: "number", minimum: 0 },
        estimatedMinutes: { bsonType: "int", minimum: 1 },
        isActive: { bsonType: "bool" }
      }
    }
  }
});

// ========== OLAP COLLECTIONS ==========

db.createCollection("restaurant_stats");

db.createCollection("order_events", {
  timeseries: {
    timeField: "timestamp",
    metaField: "metadata",
    granularity: "minutes"
  },
  expireAfterSeconds: 7776000
});

db.createCollection("daily_revenue");

print("All 10 collections created successfully.");
print("Collections: " + db.getCollectionNames().join(", "));
