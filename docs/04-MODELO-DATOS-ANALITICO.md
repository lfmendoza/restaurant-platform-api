# 4. Modelo de Datos — Capa Analítica (3 Colecciones OLAP)

Estas colecciones son **derivadas** de las colecciones transaccionales. No son source of truth; son vistas pre-computadas optimizadas para lectura.

---

## 4.1 Colección: `restaurant_stats` (Materialized View)

**Propósito:** Vista materializada con métricas pre-computadas por restaurante. Actualizada en tiempo real por Change Streams sobre `orders` y `reviews`. Elimina la necesidad de $lookup + $group en tiempo de consulta.

**Refresh strategy:** Incremental via Change Streams (real-time) + Full reconciliation semanal (batch).

**Ejemplo de documento:**

```json
{
  "_id": "ObjectId('507f1f77bcf86cd799439012')",
  "restaurantName": "La Pizzería Artesanal",
  "avgRating": 4.3,
  "totalReviews": 156,
  "totalOrders": 1243,
  "totalDelivered": 1180,
  "totalCancelled": 63,
  "totalRevenue": 245890.50,
  "avgOrderValue": 208.40,
  "avgDeliveryTimeMin": 32,
  "topSellingItems": [
    { "menuItemId": "ObjectId('mi_001')", "name": "Pizza Margherita", "totalSold": 342 },
    { "menuItemId": "ObjectId('mi_002')", "name": "Pasta Carbonara", "totalSold": 287 },
    { "menuItemId": "ObjectId('mi_003')", "name": "Tiramisú", "totalSold": 198 },
    { "menuItemId": "ObjectId('mi_004')", "name": "Coca-Cola 600ml", "totalSold": 512 },
    { "menuItemId": "ObjectId('mi_005')", "name": "Ensalada César", "totalSold": 167 }
  ],
  "ratingDistribution": {
    "1": 5,
    "2": 12,
    "3": 28,
    "4": 65,
    "5": 46
  },
  "lastOrderAt": "2026-02-25T18:00:00Z",
  "lastReviewAt": "2026-02-26T08:30:00Z",
  "lastUpdated": "2026-02-26T08:30:01Z"
}
```

**Nota:** `_id` es el mismo que `restaurants._id` (Computed Pattern). No hay referencia separada; el _id ES el restaurantId.

**Campos y tipos:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `_id` | ObjectId | = restaurantId |
| `restaurantName` | string | Denormalizado para evitar $lookup |
| `avgRating` | double | Promedio incremental: `(oldAvg * oldCount + newRating) / (oldCount + 1)` |
| `totalReviews` | int32 | Contador |
| `totalOrders` | int32 | Pedidos totales |
| `totalDelivered` | int32 | Pedidos entregados |
| `totalCancelled` | int32 | Pedidos cancelados |
| `totalRevenue` | double | Ingresos de pedidos delivered |
| `avgOrderValue` | double | `totalRevenue / totalDelivered` |
| `avgDeliveryTimeMin` | double | Promedio de tiempo de entrega |
| `topSellingItems` | array[object] | Top 5 platillos por ventas |
| `ratingDistribution` | object | Distribución 1-5 estrellas |
| `lastOrderAt` | date | Última orden recibida |
| `lastReviewAt` | date | Última reseña recibida |
| `lastUpdated` | date | Última actualización de este doc |

---

## 4.2 Colección: `order_events` (Time Series)

**Propósito:** Registro inmutable de cada transición de estado en el ciclo de vida de un pedido. Implementa Event Sourcing sobre MongoDB Time Series Collections.

**Configuración de Time Series:**

```javascript
db.createCollection("order_events", {
  timeseries: {
    timeField: "timestamp",
    metaField: "metadata",
    granularity: "minutes"
  },
  expireAfterSeconds: 7776000  // 90 días de retención
});
```

**Ejemplo de documento:**

```json
{
  "timestamp": "2026-02-25T18:02:30Z",
  "metadata": {
    "orderId": "ObjectId('507f1f77bcf86cd799439014')",
    "restaurantId": "ObjectId('507f1f77bcf86cd799439012')",
    "userId": "ObjectId('507f1f77bcf86cd799439011')"
  },
  "eventType": "status_change",
  "fromStatus": "pending",
  "toStatus": "confirmed",
  "durationFromPrevSec": 150,
  "context": {
    "actor": "restaurant",
    "estimatedPrepTime": 25
  }
}
```

**Campos y tipos:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `timestamp` | date | **timeField** — momento del evento |
| `metadata` | object | **metaField** — identifica la orden, restaurante, usuario |
| `eventType` | string | `status_change`, `created`, `cancelled` |
| `fromStatus` | string | Estado anterior (null si es creación) |
| `toStatus` | string | Nuevo estado |
| `durationFromPrevSec` | int32 | Segundos desde la transición anterior |
| `context` | object | Datos adicionales del evento |

**Casos de uso analítico:**
- Tiempo promedio por transición (cuánto tarda un restaurante en confirmar)
- SLA monitoring (pedidos que exceden tiempo estimado)
- Order velocity (pedidos por ventana de 5 minutos)

---

## 4.3 Colección: `daily_revenue` (Batch Aggregated)

**Propósito:** Métricas financieras diarias pre-agregadas por restaurante. Generada por pipeline de agregación nocturno con `$merge`.

**Refresh strategy:** Nightly batch ($merge, whenMatched: "replace").

**Ejemplo de documento:**

```json
{
  "_id": "ObjectId('dr_2026-02-25_rest012')",
  "restaurantId": "ObjectId('507f1f77bcf86cd799439012')",
  "date": "2026-02-25T00:00:00Z",
  "orderCount": 47,
  "deliveredCount": 43,
  "cancelledCount": 4,
  "revenue": 9856.50,
  "avgOrderValue": 229.22,
  "cancelRate": 0.085,
  "peakHour": {
    "hour": 19,
    "count": 12
  },
  "topCategories": [
    { "category": "Pizzas", "revenue": 4230.00, "count": 22 },
    { "category": "Pastas", "revenue": 2890.50, "count": 15 },
    { "category": "Bebidas", "revenue": 1450.00, "count": 38 }
  ]
}
```

**Campos y tipos:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `_id` | ObjectId | PK |
| `restaurantId` | ObjectId | FK → restaurants |
| `date` | date | Día (truncado a 00:00:00Z) |
| `orderCount` | int32 | Total de pedidos del día |
| `deliveredCount` | int32 | Pedidos entregados |
| `cancelledCount` | int32 | Pedidos cancelados |
| `revenue` | double | Ingresos del día (solo delivered) |
| `avgOrderValue` | double | `revenue / deliveredCount` |
| `cancelRate` | double | `cancelledCount / orderCount` |
| `peakHour` | object | Hora con más pedidos |
| `topCategories` | array[object] | Revenue y count por categoría |

**Índice:** `{ restaurantId: 1, date: -1 }` — consultas de tendencia por restaurante.
