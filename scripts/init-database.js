// init-database.js
// Idempotent: drops existing collections then creates with JSON Schema validation + Time Series
// Run: mongosh "mongodb+srv://..." scripts/init-database.js

const dbName = "restaurant_orders";
const db = db.getSiblingDB(dbName);

print("=== Initializing database: " + dbName + " ===\n");

print("Dropping existing collections (idempotent)...");
db.getCollectionNames().forEach(function(c) {
  if (!c.startsWith("system.")) {
    db.getCollection(c).drop();
    print("  Dropped: " + c);
  }
});


print("\nCreating collections...\n");

// ---------- users ----------
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "name", "role", "createdAt", "updatedAt"],
      properties: {
        email:    { bsonType: "string" },
        name:     { bsonType: "string", minLength: 1 },
        role:     { enum: ["customer", "restaurant_admin", "admin", "restaurant_owner", "delivery_driver"] },
        phone:    { bsonType: ["string", "null"] },
        defaultAddress: {
          bsonType: "object",
          properties: {
            street:      { bsonType: "string" },
            city:        { bsonType: "string" },
            zone:        { bsonType: "string" },
            coordinates: {
              bsonType: "object",
              properties: {
                type:        { enum: ["Point"] },
                coordinates: { bsonType: "array", minItems: 2, maxItems: 2 }
              }
            }
          }
        },
        orderHistory:        { bsonType: "array", items: { bsonType: "objectId" } },
        favoriteRestaurants: { bsonType: "array", items: { bsonType: "objectId" } },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict"
});
print("  Created: users");

// ---------- restaurants ----------
db.createCollection("restaurants", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "name", "location", "address", "isActive",
        "isAcceptingOrders", "menuItemCount", "createdAt", "updatedAt"
      ],
      properties: {
        name:        { bsonType: "string", minLength: 1 },
        description: { bsonType: "string" },
        location: {
          bsonType: "object",
          required: ["type", "coordinates"],
          properties: {
            type:        { enum: ["Point"] },
            coordinates: { bsonType: "array", minItems: 2, maxItems: 2 }
          }
        },
        address: {
          bsonType: "object",
          required: ["street", "city", "zone"],
          properties: {
            street: { bsonType: "string" },
            city:   { bsonType: "string" },
            zone:   { bsonType: "string" }
          }
        },
        operatingHours:   { bsonType: ["object", "null"] },
        cuisineTypes:     { bsonType: "array", items: { bsonType: "string" } },
        tags:             { bsonType: "array", items: { bsonType: "string" } },
        isActive:         { bsonType: "bool" },
        isAcceptingOrders: { bsonType: "bool" },
        menuItemCount:    { bsonType: "number", minimum: 0 },
        logoFileId:       { bsonType: ["objectId", "null"] },
        createdAt:        { bsonType: "date" },
        updatedAt:        { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict"
});
print("  Created: restaurants");

// ---------- menu_items ----------
db.createCollection("menu_items", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "restaurantId", "name", "price", "category",
        "available", "salesCount", "createdAt", "updatedAt"
      ],
      properties: {
        restaurantId:       { bsonType: "objectId" },
        name:               { bsonType: "string", minLength: 1 },
        description:        { bsonType: "string" },
        price:              { bsonType: "number", minimum: 0, exclusiveMinimum: true },
        category:           { bsonType: "string" },
        available:          { bsonType: "bool" },
        salesCount:         { bsonType: "number", minimum: 0 },
        allergens:          { bsonType: "array", items: { bsonType: "string" } },
        tags:               { bsonType: "array", items: { bsonType: "string" } },
        preparationTimeMin: { bsonType: "number" },
        imageFileId:        { bsonType: ["objectId", "null"] },
        createdAt:          { bsonType: "date" },
        updatedAt:          { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict"
});
print("  Created: menu_items");

// ---------- orders ----------
db.createCollection("orders", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "orderNumber", "userId", "restaurantId", "items",
        "deliveryAddress", "status", "statusHistory",
        "subtotal", "tax", "deliveryFee", "total",
        "paymentMethod", "createdAt", "updatedAt"
      ],
      properties: {
        orderNumber:  { bsonType: "string" },
        userId:       { bsonType: "objectId" },
        restaurantId: { bsonType: "objectId" },
        items: {
          bsonType: "array",
          minItems: 1,
          items: {
            bsonType: "object",
            required: ["menuItemId", "name", "quantity", "unitPrice", "subtotal"],
            properties: {
              menuItemId: { bsonType: "objectId" },
              name:       { bsonType: "string" },
              quantity:   { bsonType: "number", minimum: 1 },
              unitPrice:  { bsonType: "number", minimum: 0 },
              subtotal:   { bsonType: "number", minimum: 0 }
            }
          }
        },
        deliveryAddress: {
          bsonType: "object",
          required: ["street", "city", "zone"],
          properties: {
            street:      { bsonType: "string" },
            city:        { bsonType: "string" },
            zone:        { bsonType: "string" },
            coordinates: {
              bsonType: "object",
              properties: {
                type:        { enum: ["Point"] },
                coordinates: { bsonType: "array", minItems: 2, maxItems: 2 }
              }
            }
          }
        },
        status: {
          enum: [
            "pending", "confirmed", "preparing",
            "ready_for_pickup", "picked_up", "delivered", "cancelled"
          ]
        },
        statusHistory: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["status", "timestamp"],
            properties: {
              status: {
                enum: [
                  "pending", "confirmed", "preparing",
                  "ready_for_pickup", "picked_up", "delivered", "cancelled"
                ]
              },
              timestamp: { bsonType: "date" }
            }
          }
        },
        subtotal:           { bsonType: "number", minimum: 0 },
        tax:                { bsonType: "number", minimum: 0 },
        deliveryFee:        { bsonType: "number", minimum: 0 },
        total:              { bsonType: "number", minimum: 0 },
        paymentMethod:      { bsonType: "string" },
        cancellationReason: { bsonType: ["string", "null"] },
        estimatedDelivery:  { bsonType: "date" },
        createdAt:          { bsonType: "date" },
        updatedAt:          { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict"
});
print("  Created: orders");

// ---------- reviews ----------
db.createCollection("reviews", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "restaurantId", "orderId", "rating", "createdAt"],
      properties: {
        userId:       { bsonType: "objectId" },
        restaurantId: { bsonType: "objectId" },
        orderId:      { bsonType: "objectId" },
        rating:       { bsonType: "number", minimum: 1, maximum: 5 },
        title:        { bsonType: "string" },
        comment:      { bsonType: "string" },
        tags:         { bsonType: "array", items: { bsonType: "string" } },
        restaurantResponse: {
          bsonType: ["object", "null"],
          properties: {
            message:     { bsonType: "string" },
            respondedAt: { bsonType: "date" }
          }
        },
        helpfulVotes: { bsonType: "array", items: { bsonType: "objectId" } },
        createdAt:    { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict"
});
print("  Created: reviews");

// ---------- carts ----------
db.createCollection("carts", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "userId", "restaurantId", "items",
        "subtotal", "hasUnavailableItems", "expiresAt"
      ],
      properties: {
        userId:       { bsonType: "objectId" },
        restaurantId: { bsonType: "objectId" },
        items: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["menuItemId", "name", "price", "quantity", "subtotal", "available"],
            properties: {
              menuItemId: { bsonType: "objectId" },
              name:       { bsonType: "string" },
              price:      { bsonType: "number", minimum: 0 },
              quantity:   { bsonType: "number", minimum: 1 },
              subtotal:   { bsonType: "number", minimum: 0 },
              available:  { bsonType: "bool" }
            }
          }
        },
        subtotal:            { bsonType: "number", minimum: 0 },
        hasUnavailableItems: { bsonType: "bool" },
        expiresAt:           { bsonType: "date" },
        createdAt:           { bsonType: "date" },
        updatedAt:           { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict"
});
print("  Created: carts");

// ---------- delivery_zones ----------
db.createCollection("delivery_zones", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "restaurantId", "zoneName", "area",
        "deliveryFee", "estimatedMinutes", "isActive"
      ],
      properties: {
        restaurantId: { bsonType: "objectId" },
        zoneName:     { bsonType: "string" },
        area: {
          bsonType: "object",
          required: ["type", "coordinates"],
          properties: {
            type:        { enum: ["Polygon"] },
            coordinates: { bsonType: "array" }
          }
        },
        deliveryFee:      { bsonType: "number", minimum: 0 },
        estimatedMinutes: { bsonType: "number", minimum: 1 },
        isActive:         { bsonType: "bool" }
      }
    }
  },
  validationLevel: "strict"
});
print("  Created: delivery_zones");


print("\nCreating collections...\n");

// ---------- restaurant_stats (no schema - derived data) ----------
db.createCollection("restaurant_stats");
print("  Created: restaurant_stats (no schema)");

// ---------- order_events (Time Series) ----------
db.createCollection("order_events", {
  timeseries: {
    timeField: "timestamp",
    metaField: "metadata",
    granularity: "minutes"
  },
  expireAfterSeconds: 7776000
});
print("  Created: order_events (time series, TTL 90 days)");

// ---------- daily_revenue (no schema - derived data) ----------
db.createCollection("daily_revenue");
print("  Created: daily_revenue (no schema)");


const collections = db.getCollectionNames().sort();
print("\n=== Database initialization complete ===");
print("Database: " + dbName);
print("Total collections: " + collections.length);
print("Collections: " + collections.join(", "));
