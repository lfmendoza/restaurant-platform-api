# 8. Agregaciones y Pipelines

## 8.1 Agregaciones Simples

```javascript
// Total de pedidos entregados por restaurante
db.orders.countDocuments({ restaurantId: ObjectId("r1"), status: "delivered" });

// Estados distintos de pedidos activos
db.orders.distinct("status", { restaurantId: ObjectId("r1") });

// Total de reseñas por restaurante
db.reviews.countDocuments({ restaurantId: ObjectId("r1") });

// Categorías distintas en menú
db.menu_items.distinct("category", { restaurantId: ObjectId("r1"), available: true });
```

---

## 8.2 Pipelines Complejas

### Pipeline 1: Restaurantes Mejor Calificados

```javascript
db.reviews.aggregate([
  { $group: { _id: "$restaurantId", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
  { $match: { count: { $gte: 5 } } },
  { $sort: { avgRating: -1 } },
  { $limit: 10 },
  { $lookup: { from: "restaurants", localField: "_id", foreignField: "_id", as: "restaurant" } },
  { $unwind: "$restaurant" },
  { $project: { "restaurant.name": 1, "restaurant.cuisineTypes": 1, avgRating: { $round: ["$avgRating", 1] }, reviewCount: "$count" } }
]);
```

### Pipeline 2: Platillos Más Vendidos (Global)

```javascript
db.orders.aggregate([
  { $match: { status: "delivered" } },
  { $unwind: "$items" },
  { $group: { _id: "$items.menuItemId", name: { $first: "$items.name" }, totalQty: { $sum: "$items.quantity" }, totalRevenue: { $sum: "$items.subtotal" } } },
  { $sort: { totalQty: -1 } },
  { $limit: 20 },
  { $lookup: { from: "menu_items", localField: "_id", foreignField: "_id", as: "menuItem" } },
  { $unwind: "$menuItem" },
  { $project: { name: 1, totalQty: 1, totalRevenue: 1, category: "$menuItem.category", restaurantId: "$menuItem.restaurantId" } }
]);
```

### Pipeline 3: Ventas por Restaurante y Mes

```javascript
db.orders.aggregate([
  { $match: { status: "delivered" } },
  { $group: {
    _id: { restaurantId: "$restaurantId", year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
    totalRevenue: { $sum: "$total" },
    orderCount: { $sum: 1 },
    avgOrderValue: { $avg: "$total" }
  } },
  { $sort: { "_id.year": -1, "_id.month": -1 } },
  { $lookup: { from: "restaurants", localField: "_id.restaurantId", foreignField: "_id", as: "restaurant" } },
  { $unwind: "$restaurant" },
  { $project: { restaurantName: "$restaurant.name", year: "$_id.year", month: "$_id.month", totalRevenue: { $round: ["$totalRevenue", 2] }, orderCount: 1, avgOrderValue: { $round: ["$avgOrderValue", 2] } } }
]);
```

### Pipeline 4: Distribución de Ratings por Restaurante

```javascript
db.reviews.aggregate([
  { $match: { restaurantId: ObjectId("r1") } },
  { $group: { _id: "$rating", count: { $sum: 1 } } },
  { $sort: { _id: 1 } },
  { $group: { _id: null, distribution: { $push: { rating: "$_id", count: "$count" } }, total: { $sum: "$count" } } },
  { $project: { _id: 0, distribution: 1, total: 1 } }
]);
```

### Pipeline 5: Tiempo Promedio por Transición de Estado (Time Series)

```javascript
db.order_events.aggregate([
  { $match: { "metadata.restaurantId": ObjectId("r1"), timestamp: { $gte: new Date("2026-02-01") } } },
  { $group: { _id: { from: "$fromStatus", to: "$toStatus" }, avgDuration: { $avg: "$durationFromPrevSec" }, count: { $sum: 1 } } },
  { $sort: { avgDuration: -1 } }
]);
```

### Pipeline 6: Order Velocity (Pedidos por Ventana de 5 min)

```javascript
db.order_events.aggregate([
  { $match: { "metadata.restaurantId": ObjectId("r1"), toStatus: "pending", timestamp: { $gte: new Date(Date.now() - 3600000) } } },
  { $group: { _id: { $dateTrunc: { date: "$timestamp", unit: "minute", binSize: 5 } }, count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]);
```

---

## 8.3 Materialized View Refresh ($merge)

### Nightly: Daily Revenue

```javascript
db.orders.aggregate([
  { $match: { status: "delivered", updatedAt: { $gte: ISODate("2026-02-25T00:00:00Z"), $lt: ISODate("2026-02-26T00:00:00Z") } } },
  { $unwind: "$items" },
  { $group: {
    _id: { restaurantId: "$restaurantId", date: { $dateTrunc: { date: "$createdAt", unit: "day" } } },
    revenue: { $sum: "$total" },
    orderCount: { $sum: 1 },
    avgOrderValue: { $avg: "$total" }
  } },
  { $addFields: { restaurantId: "$_id.restaurantId", date: "$_id.date" } },
  { $project: { _id: 0 } },
  { $merge: { into: "daily_revenue", on: ["restaurantId", "date"], whenMatched: "replace", whenNotMatched: "insert" } }
]);
```

### Weekly: Full Reconciliation of restaurant_stats

```javascript
db.orders.aggregate([
  { $match: { status: "delivered" } },
  { $group: {
    _id: "$restaurantId",
    totalOrders: { $sum: 1 },
    totalRevenue: { $sum: "$total" },
    avgOrderValue: { $avg: "$total" },
    lastOrderAt: { $max: "$createdAt" }
  } },
  { $lookup: { from: "reviews", localField: "_id", foreignField: "restaurantId", as: "reviews" } },
  { $addFields: {
    totalReviews: { $size: "$reviews" },
    avgRating: { $avg: "$reviews.rating" }
  } },
  { $lookup: { from: "restaurants", localField: "_id", foreignField: "_id", as: "rest" } },
  { $unwind: "$rest" },
  { $project: { _id: 1, restaurantName: "$rest.name", totalOrders: 1, totalRevenue: 1, avgOrderValue: 1, lastOrderAt: 1, totalReviews: 1, avgRating: 1, lastUpdated: new Date() } },
  { $merge: { into: "restaurant_stats", on: "_id", whenMatched: "replace", whenNotMatched: "insert" } }
]);
```

---

## 8.4 Manejo de Arrays en Agregaciones

```javascript
// Tags más usados en reseñas (multikey + $unwind)
db.reviews.aggregate([
  { $unwind: "$tags" },
  { $group: { _id: "$tags", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 15 }
]);

// Alérgenos más comunes en platillos
db.menu_items.aggregate([
  { $unwind: "$allergens" },
  { $group: { _id: "$allergens", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]);
```

## 8.5 Manejo de Documentos Embebidos en Agregaciones

```javascript
// Revenue por categoría desde items embebidos en orders
db.orders.aggregate([
  { $match: { status: "delivered" } },
  { $unwind: "$items" },
  { $lookup: { from: "menu_items", localField: "items.menuItemId", foreignField: "_id", as: "menuItem" } },
  { $unwind: "$menuItem" },
  { $group: { _id: "$menuItem.category", totalRevenue: { $sum: "$items.subtotal" }, totalQty: { $sum: "$items.quantity" } } },
  { $sort: { totalRevenue: -1 } }
]);
```
