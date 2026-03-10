# 6. Flujos Críticos de Datos (12 Critical Paths)

Cada flujo describe cómo la información **viaja, se transforma y se recibe** a través de las capas del sistema.

---

## Flow 1: Restaurant Discovery (Búsqueda Geoespacial)

**Trigger:** Usuario busca restaurantes cercanos.

```mermaid
sequenceDiagram
  participant User
  participant API
  participant dz as delivery_zones
  participant rest as restaurants
  participant stats as restaurant_stats

  User->>API: GET /restaurants/search?lat=14.6&lng=-90.5&cuisine=italiana
  API->>dz: find({ area: { $geoIntersects: { $geometry: userPoint } }, isActive: true })
  dz-->>API: [{ restaurantId, deliveryFee, estimatedMinutes }]
  API->>rest: find({ _id: { $in: ids }, isActive: true, isAcceptingOrders: true, cuisineTypes: "italiana" })
  API->>stats: find({ _id: { $in: ids } }).project({ avgRating: 1, totalOrders: 1 })
  API->>API: merge restaurants + stats + zones, sort by distance or avgRating
  API-->>User: paginated list [{ restaurant, avgRating, deliveryFee, estimatedMinutes }]
```

**Transformación:** User Point → $geoIntersects Polygon zones → restaurantIds → filter active + cuisine → enrich with pre-computed stats + deliveryFee → sort + paginate.

**Colecciones:** `delivery_zones` (read) → `restaurants` (read) → `restaurant_stats` (read)

---

## Flow 2: Menu Browsing

**Trigger:** Usuario selecciona un restaurante.

```mermaid
sequenceDiagram
  participant User
  participant API
  participant mi as menu_items
  participant gfs as GridFS

  User->>API: GET /restaurants/:id/menu?category=Pizzas
  API->>mi: find({ restaurantId: id, available: true, category: "Pizzas" }).sort({ salesCount: -1 }).project({ name, description, price, allergens, imageFileId, preparationTimeMin })
  mi-->>API: [items]
  API->>gfs: resolve imageFileIds → signed URLs
  API->>API: group items by category
  API-->>User: { categories: [{ name: "Pizzas", items: [...] }] }
```

**Transformación:** Flat documents → filter available + category → project minimal fields → resolve image URLs → group by category.

**Colecciones:** `menu_items` (read) + `GridFS` (read)

---

## Flow 3: Cart Management (Add / Modify / Remove)

**Trigger:** Usuario interactúa con su carrito.

```mermaid
sequenceDiagram
  participant User
  participant API
  participant mi as menu_items
  participant carts as carts

  Note over User, carts: ADD ITEM
  User->>API: POST /carts/items { menuItemId, quantity: 2 }
  API->>mi: findOne({ _id: menuItemId, available: true })
  mi-->>API: { name, price, restaurantId }
  API->>carts: updateOne({ userId, restaurantId }, { $push: { items: { menuItemId, name, price, quantity, subtotal, available: true } }, $set: { updatedAt: now }, $setOnInsert: { expiresAt: now+24h } }, { upsert: true })
  API->>carts: recalculate subtotal with aggregation
  API-->>User: updated cart with subtotal

  Note over User, carts: MODIFY QUANTITY
  User->>API: PATCH /carts/items/:menuItemId { quantity: 3 }
  API->>carts: updateOne({ userId, "items.menuItemId": id }, { $set: { "items.$.quantity": 3, "items.$.subtotal": price*3, updatedAt: now } })
  API-->>User: updated cart

  Note over User, carts: REMOVE ITEM
  User->>API: DELETE /carts/items/:menuItemId
  API->>carts: updateOne({ userId }, { $pull: { items: { menuItemId: id } }, $set: { updatedAt: now } })
  API-->>User: updated cart
```

**Transformación:** Menu item ref → Extended Reference snapshot into `carts.items[]` (denormalized name + price) → subtotal recalculated on every mutation.

**Operaciones MongoDB:** `$push`, `$set` con positional `$`, `$pull`, `upsert: true`, `$setOnInsert`.

**Colecciones:** `menu_items` (read) → `carts` (write). Auto-expire via TTL index on `expiresAt`.

---

## Flow 4: Order Placement (Transacción Atómica Crítica)

**Trigger:** Usuario confirma checkout.

```mermaid
sequenceDiagram
  participant User
  participant API
  participant Session
  participant carts as carts
  participant mi as menu_items
  participant rest as restaurants
  participant dz as delivery_zones
  participant orders as orders
  participant CS as ChangeStream

  User->>API: POST /orders { cartId, deliveryAddress, paymentMethod }
  API->>Session: startTransaction()

  API->>carts: findOne({ _id: cartId, userId })
  Note over API: 1. Validate cart exists and belongs to user

  API->>mi: find({ _id: { $in: itemIds }, available: true })
  Note over API: 2. ALL items still available? If any unavailable → ABORT

  API->>rest: findOne({ _id: restaurantId, isAcceptingOrders: true })
  Note over API: 3. Restaurant open? Check operatingHours. If closed → ABORT

  API->>dz: findOne({ restaurantId, area: { $geoIntersects: deliveryPoint } })
  Note over API: 4. In delivery coverage? Get deliveryFee. If outside → ABORT

  API->>API: 5. Calculate: total = subtotal + tax(12%) + deliveryFee

  API->>orders: insertOne({ orderNumber: generateUUID(), status: "pending", items: cart.items, statusHistory: [{ status: "pending", timestamp: now, actor: "system" }], deliveryAddress, total, ... })
  API->>mi: updateMany({ _id: { $in: itemIds } }, { $inc: { salesCount: qty } })
  API->>carts: deleteOne({ _id: cartId })

  API->>Session: commitTransaction()

  Note over orders, CS: Async propagation via Change Stream
  orders->>CS: insert event detected
  CS->>CS: insertOne(order_events, { toStatus: "pending" })
  CS->>CS: updateOne(restaurant_stats, { $inc: { totalOrders: 1 } })

  API-->>User: { orderId, orderNumber, status: "pending", estimatedDelivery }
```

**Atomicidad:** 4 colecciones en 1 transacción: `carts` (read+delete), `menu_items` (update), `restaurants` (read), `delivery_zones` (read), `orders` (insert). Rollback completo si cualquier validación falla.

**Transformación:** Cart snapshot → congelado en `orders.items[]` (inmutable) → salesCount incrementado → carrito destruido → evento emitido async.

---

## Flow 5: Order Confirmation / Rejection (Restaurante)

**Trigger:** Restaurante acepta o rechaza pedido.

```mermaid
sequenceDiagram
  participant Rest as Restaurant
  participant API
  participant orders as orders
  participant mi as menu_items
  participant CS as ChangeStream
  participant oe as order_events
  participant stats as restaurant_stats

  Note over Rest, stats: ACCEPT
  Rest->>API: PATCH /orders/:id/confirm { estimatedPrepTime: 25 }
  API->>orders: updateOne({ _id, status: "pending" }, { $set: { status: "confirmed", estimatedDelivery: now+25min, updatedAt: now }, $push: { statusHistory: { status: "confirmed", timestamp: now, actor: "restaurant", durationFromPrevSec: diff } } })
  orders->>CS: update event
  CS->>oe: insertOne({ fromStatus: "pending", toStatus: "confirmed", durationFromPrevSec: diff })
  API-->>Rest: { status: "confirmed" }

  Note over Rest, stats: REJECT (Transacción)
  Rest->>API: PATCH /orders/:id/cancel { reason: "sin ingredientes" }
  API->>API: startTransaction()
  API->>orders: updateOne({ $set: { status: "cancelled", cancellationReason }, $push: { statusHistory: {...} } })
  API->>mi: updateMany({ _id: { $in: itemIds } }, { $inc: { salesCount: -qty } })
  API->>API: commitTransaction()
  orders->>CS: update event
  CS->>oe: insertOne({ toStatus: "cancelled" })
  CS->>stats: updateOne({ $inc: { totalCancelled: 1 } })
```

**Transformación:** Status mutation + `statusHistory[]` push (Bucket Pattern) → Change Stream → immutable event to Time Series → stats updated.

---

## Flow 6: Order Status Progression (State Machine)

**Trigger:** Actor (restaurante, repartidor, sistema) avanza el estado del pedido.

```mermaid
sequenceDiagram
  participant Actor
  participant API
  participant orders as orders
  participant CS as ChangeStream
  participant oe as order_events
  participant stats as restaurant_stats

  Actor->>API: PATCH /orders/:id/status { status: "preparing" }
  API->>API: Validate FSM: confirmed → preparing is LEGAL
  API->>orders: findOne({ _id }) get current status + last statusHistory timestamp
  API->>orders: updateOne({ _id, status: "confirmed" }, { $set: { status: "preparing", updatedAt: now }, $push: { statusHistory: { status: "preparing", timestamp: now, durationFromPrevSec: diff, actor: "restaurant" } } })
  orders->>CS: update event
  CS->>oe: insertOne({ fromStatus: "confirmed", toStatus: "preparing", durationFromPrevSec: diff })

  Note over CS, stats: On "delivered" only
  CS->>stats: updateOne({ $inc: { totalDelivered: 1, totalRevenue: order.total }, $set: { avgOrderValue: recalc, lastOrderAt: now } })
```

**Reglas FSM (validadas en API):**

```
VALID_TRANSITIONS = {
  pending:          → [confirmed, cancelled]
  confirmed:        → [preparing, cancelled]
  preparing:        → [ready_for_pickup, cancelled]
  ready_for_pickup: → [picked_up]
  picked_up:        → [delivered]
  delivered:        → []  (terminal)
  cancelled:        → []  (terminal)
}
```

---

## Flow 7: Bulk Menu Item Upload

**Trigger:** Restaurante carga platillos masivamente.

```mermaid
sequenceDiagram
  participant Rest as Restaurant
  participant API
  participant gfs as GridFS
  participant mi as menu_items
  participant rest as restaurants

  Rest->>API: POST /restaurants/:id/menu/bulk [items array]
  API->>API: Validate each item against JSON Schema
  API->>API: Transform: inject restaurantId, available: true, salesCount: 0, createdAt: now

  opt With images
    API->>gfs: upload images in parallel → fileIds
    API->>API: attach imageFileId to each item
  end

  API->>mi: bulkWrite(items.map(i => ({ insertOne: { document: i } })), { ordered: false })
  mi-->>API: { insertedCount, errors }
  API->>rest: updateOne({ _id: rid }, { $inc: { menuItemCount: insertedCount } })
  API-->>Rest: { inserted: N, failed: M, errors: [...] }
```

**Transformación:** Raw array → schema validation → enriched with defaults → optional GridFS upload → `bulkWrite` ordered:false (parallelism) → restaurant metadata updated. Partial failures collected, not fatal.

---

## Flow 8: Dish Availability Toggle (Cascada a Carts)

**Trigger:** Restaurante marca platillo como no disponible.

```mermaid
sequenceDiagram
  participant Rest as Restaurant
  participant API
  participant mi as menu_items
  participant carts as carts

  Rest->>API: PATCH /menu-items/:id/availability { available: false }
  API->>mi: updateOne({ _id: dishId }, { $set: { available: false, updatedAt: now } })

  Note over API, carts: Cascade to active carts
  API->>carts: updateMany({ "items.menuItemId": dishId }, { $set: { "items.$[elem].available": false, hasUnavailableItems: true } }, { arrayFilters: [{ "elem.menuItemId": dishId }] })
  API-->>Rest: { updated: true, affectedCarts: N }

  Note over Rest, carts: RESTORE AVAILABILITY
  Rest->>API: PATCH /menu-items/:id/availability { available: true }
  API->>mi: updateOne({ _id: dishId }, { $set: { available: true, updatedAt: now } })
  API->>carts: updateMany({ "items.menuItemId": dishId }, { $set: { "items.$[elem].available": true } }, { arrayFilters: [{ "elem.menuItemId": dishId }] })
```

**Transformación:** Single field toggle on `menu_items` → cascade via `arrayFilters` to all active `carts` containing that item → `hasUnavailableItems` flag updated for checkout validation in Flow 4.

---

## Flow 9: Restaurant Availability Toggle

**Trigger:** Restaurante se abre/cierra manualmente o automáticamente.

```mermaid
sequenceDiagram
  participant Rest as Restaurant
  participant API
  participant restaurants as restaurants

  Note over Rest, restaurants: MANUAL TOGGLE
  Rest->>API: PATCH /restaurants/:id/status { isAcceptingOrders: false }
  API->>restaurants: updateOne({ _id }, { $set: { isAcceptingOrders: false, updatedAt: now } })
  API-->>Rest: { status: "not_accepting_orders" }

  Note over Rest, restaurants: AUTOMATIC via schedule
  API->>API: Scheduled job: compare operatingHours[dayOfWeek] vs current time
  API->>restaurants: updateMany({ matching schedule rule }, { $set: { isAcceptingOrders: true/false } })
```

**Sin cascada.** In-progress orders CONTINÚAN. Active carts PERMANECEN pero checkout bloqueado en validación (Flow 4, paso 3).

---

## Flow 10: Review Submission + Rating Propagation

**Trigger:** Usuario deja reseña tras pedido entregado.

```mermaid
sequenceDiagram
  participant User
  participant API
  participant orders as orders
  participant reviews as reviews
  participant CS as ChangeStream
  participant stats as restaurant_stats

  User->>API: POST /reviews { orderId, rating: 4, title, comment, tags }
  API->>orders: findOne({ _id: orderId, userId, status: "delivered" })
  Note over API: Validate: order exists + belongs to user + is delivered
  API->>reviews: findOne({ orderId, userId })
  Note over API: Validate: no duplicate review for this order

  API->>reviews: insertOne({ userId, restaurantId, orderId, rating, title, comment, tags, createdAt: now })
  reviews->>CS: insert event detected

  Note over CS, stats: Incremental Average O(1)
  CS->>stats: updateOne({ _id: restaurantId }, { $inc: { totalReviews: 1, "ratingDistribution.4": 1 }, $set: { avgRating: newAvg, lastReviewAt: now, lastUpdated: now } })
  Note over CS: newAvg = (oldAvg * oldCount + newRating) / (oldCount + 1)

  API-->>User: { reviewId, status: "published" }
```

**Transformación:** Review validated → stored with references → Change Stream triggers O(1) incremental average recalculation (no full recompute).

---

## Flow 11: Daily Revenue Batch Aggregation

**Trigger:** Scheduled job nightly at 02:00 UTC.

```mermaid
sequenceDiagram
  participant Scheduler
  participant Pipeline
  participant orders as orders
  participant dr as daily_revenue
  participant stats as restaurant_stats

  Note over Scheduler, stats: NIGHTLY 02:00 UTC
  Scheduler->>Pipeline: trigger
  Pipeline->>orders: aggregate([ { $match: { status: "delivered", updatedAt: { $gte: yesterday, $lt: today } } }, { $unwind: "$items" }, { $group: { _id: { restaurantId, date }, revenue: { $sum: "$total" }, orderCount: { $sum: 1 }, ... } }, { $merge: { into: "daily_revenue", whenMatched: "replace" } } ])
  Pipeline-->>dr: upsert per restaurant per day

  Note over Scheduler, stats: WEEKLY RECONCILIATION
  Scheduler->>Pipeline: full recompute
  Pipeline->>orders: aggregate all delivered orders → recompute restaurant_stats
  Pipeline->>stats: $merge whenMatched: "replace"
```

**Transformación:** Raw orders (OLTP) → $match delivered → $unwind items → $group by restaurant+date → compute aggregates → $merge into `daily_revenue` (OLAP). Weekly: full reconciliation overwriting `restaurant_stats`.

---

## Flow 12: Real-Time Dashboard Queries (Paralelo)

**Trigger:** Admin o restaurante accede al dashboard.

```mermaid
sequenceDiagram
  participant Dashboard
  participant API
  participant stats as restaurant_stats
  participant oe as order_events
  participant dr as daily_revenue
  participant orders as orders

  Dashboard->>API: GET /restaurants/:id/dashboard

  par 4 Parallel Queries
    API->>stats: findOne({ _id: restaurantId })
    Note over API: Pre-computed: avgRating, totalOrders, revenue, topItems

    API->>oe: aggregate([ { $match: { "metadata.restaurantId": rid, timestamp: { $gte: now-1h } } }, { $group: { _id: { $dateTrunc: { date: "$timestamp", unit: "minute", binSize: 5 } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } } ])
    Note over API: Order velocity: orders per 5-min window last hour

    API->>dr: find({ restaurantId: rid }).sort({ date: -1 }).limit(30)
    Note over API: 30-day revenue trend

    API->>orders: find({ restaurantId: rid, status: { $in: ["pending", "confirmed", "preparing"] } }).sort({ createdAt: -1 })
    Note over API: Active orders in real-time from OLTP
  end

  API->>API: Assemble dashboard payload
  API-->>Dashboard: { overview: stats, velocity: [...], revenueTrend: [...], activeOrders: [...] }
```

**Transformación:** 4 queries paralelas (3 OLAP + 1 OLTP) → no cross-collection $lookups → assembled into dashboard response. Read preference `secondaryPreferred` for OLAP queries.
