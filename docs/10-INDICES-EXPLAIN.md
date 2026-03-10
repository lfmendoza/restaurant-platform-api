# 10. Índices Definidos y Análisis con explain()

## 10.1 Configuración: Rechazar Consultas sin Índice

```javascript
db.adminCommand({ setParameter: 1, notablescan: 1 });
```

Con esta configuración, cualquier query que requiera COLLSCAN será rechazada. Todos los índices a continuación son necesarios para las operaciones del backend.

---

## 10.2 Índices por Tipo

### SIMPLE

```javascript
db.users.createIndex({ email: 1 }, { unique: true });
db.orders.createIndex({ orderNumber: 1 }, { unique: true });
db.orders.createIndex({ status: 1 });
db.menu_items.createIndex({ restaurantId: 1 });
db.reviews.createIndex({ restaurantId: 1 });
db.delivery_zones.createIndex({ restaurantId: 1 });
```

**explain() esperado para `orders.status`:**

```javascript
db.orders.find({ status: "pending" }).explain("executionStats");
// Expected:
// winningPlan.stage: "FETCH"
// winningPlan.inputStage.stage: "IXSCAN"
// winningPlan.inputStage.indexName: "status_1"
// executionStats.totalDocsExamined ≈ nReturned
// executionStats.totalKeysExamined ≈ nReturned
```

---

### COMPUESTO

```javascript
db.orders.createIndex({ restaurantId: 1, status: 1, createdAt: -1 });
db.orders.createIndex({ userId: 1, status: 1, createdAt: -1 });
db.menu_items.createIndex({ restaurantId: 1, category: 1, available: 1 });
db.reviews.createIndex({ restaurantId: 1, rating: -1, createdAt: -1 });
db.carts.createIndex({ userId: 1, restaurantId: 1 }, { unique: true });
db.daily_revenue.createIndex({ restaurantId: 1, date: -1 });
db.restaurant_stats.createIndex({ avgRating: -1 });
db.restaurant_stats.createIndex({ totalRevenue: -1 });
```

**explain() esperado para `orders { restaurantId, status, createdAt }`:**

```javascript
db.orders.find({ restaurantId: ObjectId("r1"), status: { $in: ["pending", "confirmed"] } })
  .sort({ createdAt: -1 }).limit(20)
  .explain("executionStats");
// Expected:
// winningPlan.inputStage.stage: "IXSCAN"
// winningPlan.inputStage.indexName: "restaurantId_1_status_1_createdAt_-1"
// executionStats.totalDocsExamined: 20
// executionStats.totalKeysExamined: ~20 (index covers sort)
// executionStats.executionTimeMillis: < 5ms
```

---

### MULTIKEY

```javascript
db.reviews.createIndex({ tags: 1 });
db.restaurants.createIndex({ cuisineTypes: 1 });
db.menu_items.createIndex({ allergens: 1 });
```

**explain() esperado para `reviews.tags`:**

```javascript
db.reviews.find({ tags: "recomendado" }).explain("executionStats");
// Expected:
// winningPlan.inputStage.stage: "IXSCAN"
// winningPlan.inputStage.indexName: "tags_1"
// winningPlan.inputStage.isMultiKey: true
// executionStats.totalKeysExamined: one key per matching tag entry
```

---

### GEOESPACIAL (2dsphere)

```javascript
db.restaurants.createIndex({ location: "2dsphere" });
db.delivery_zones.createIndex({ area: "2dsphere" });
```

**explain() esperado para `restaurants.location`:**

```javascript
db.restaurants.find({
  location: { $nearSphere: { $geometry: { type: "Point", coordinates: [-90.5, 14.6] }, $maxDistance: 5000 } }
}).explain("executionStats");
// Expected:
// winningPlan.stage: "GEO_NEAR_2DSPHERE"
// winningPlan.inputStage.indexName: "location_2dsphere"
```

**explain() esperado para `delivery_zones.area` ($geoIntersects):**

```javascript
db.delivery_zones.find({
  area: { $geoIntersects: { $geometry: { type: "Point", coordinates: [-90.5069, 14.5943] } } }
}).explain("executionStats");
// Expected:
// winningPlan.inputStage.stage: "IXSCAN"
// winningPlan.inputStage.indexName: "area_2dsphere"
```

---

### TEXTO

```javascript
db.reviews.createIndex({ title: "text", comment: "text" }, { default_language: "spanish" });
db.menu_items.createIndex({ name: "text", description: "text" }, { default_language: "spanish" });
```

**explain() esperado para full-text search:**

```javascript
db.reviews.find({ $text: { $search: "deliciosa pizza" } }).explain("executionStats");
// Expected:
// winningPlan.stage: "TEXT_MATCH"
// winningPlan.inputStage.stage: "TEXT_OR"
// winningPlan.inputStage.indexName: "title_text_comment_text"
```

---

### TTL

```javascript
db.carts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

Carritos se eliminan automáticamente cuando `expiresAt` <= ahora. MongoDB revisa cada ~60 segundos.

---

## 10.3 Resumen de Índices (17+ total)

| # | Colección | Índice | Tipo |
|---|-----------|--------|------|
| 1 | users | `{ email: 1 }` unique | Simple |
| 2 | orders | `{ orderNumber: 1 }` unique | Simple |
| 3 | orders | `{ status: 1 }` | Simple |
| 4 | orders | `{ restaurantId: 1, status: 1, createdAt: -1 }` | Compuesto |
| 5 | orders | `{ userId: 1, status: 1, createdAt: -1 }` | Compuesto |
| 6 | menu_items | `{ restaurantId: 1 }` | Simple |
| 7 | menu_items | `{ restaurantId: 1, category: 1, available: 1 }` | Compuesto |
| 8 | menu_items | `{ allergens: 1 }` | Multikey |
| 9 | menu_items | `{ name: "text", description: "text" }` | Texto |
| 10 | reviews | `{ restaurantId: 1 }` | Simple |
| 11 | reviews | `{ restaurantId: 1, rating: -1, createdAt: -1 }` | Compuesto |
| 12 | reviews | `{ tags: 1 }` | Multikey |
| 13 | reviews | `{ title: "text", comment: "text" }` | Texto |
| 14 | restaurants | `{ location: "2dsphere" }` | Geoespacial |
| 15 | restaurants | `{ cuisineTypes: 1 }` | Multikey |
| 16 | delivery_zones | `{ restaurantId: 1 }` | Simple |
| 17 | delivery_zones | `{ area: "2dsphere" }` | Geoespacial |
| 18 | carts | `{ userId: 1, restaurantId: 1 }` unique | Compuesto |
| 19 | carts | `{ expiresAt: 1 }` expireAfterSeconds: 0 | TTL |
| 20 | restaurant_stats | `{ avgRating: -1 }` | Simple |
| 21 | restaurant_stats | `{ totalRevenue: -1 }` | Simple |
| 22 | daily_revenue | `{ restaurantId: 1, date: -1 }` | Compuesto |

---

## 10.4 Interpretación de explain()

| Campo | Significado | Objetivo |
|-------|-------------|----------|
| `stage: "IXSCAN"` | Usa índice | Siempre |
| `stage: "COLLSCAN"` | Full scan (RECHAZADO con notablescan) | Nunca |
| `totalDocsExamined` | Docs leídos | ≈ nReturned |
| `totalKeysExamined` | Claves de índice | ≈ nReturned |
| `executionTimeMillis` | Tiempo total | < 50ms para p95 |
| `isMultiKey: true` | Índice sobre array | En multikey indices |
