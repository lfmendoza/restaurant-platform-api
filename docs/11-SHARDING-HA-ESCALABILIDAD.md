# 11. Sharding, Alta Disponibilidad y Escalabilidad

## 11.1 Topología de Replica Set (HA)

```mermaid
flowchart LR
  subgraph az1 [Availability Zone 1]
    P["Primary Node"]
  end
  subgraph az2 [Availability Zone 2]
    S1["Secondary Node 1"]
  end
  subgraph az3 [Availability Zone 3]
    S2["Secondary Node 2"]
  end

  P -->|"sync replication"| S1
  P -->|"sync replication"| S2
  S1 -.->|"auto-failover < 10s"| P
  S2 -.->|"auto-failover < 10s"| P
```

- **3 nodos** distribuidos en 3 Availability Zones
- **Auto-failover** en < 10 segundos si el Primary cae
- **writeConcern: majority** garantiza que datos están en al menos 2 nodos antes de confirmar
- **RPO = 0** (cero pérdida de datos con majority) y **RTO < 10s**

---

## 11.2 Shard Keys por Colección

| Colección | Shard Key | Tipo | Justificación |
|-----------|-----------|------|---------------|
| `orders` | `{ restaurantId: "hashed" }` | Hashed | Distribuye heavy writes uniformemente. Queries por restaurantId son targeted |
| `menu_items` | `{ restaurantId: 1 }` | Ranged | Co-localiza menú completo de un restaurante en el mismo chunk |
| `reviews` | `{ restaurantId: "hashed" }` | Hashed | Distribuye writes. Agregaciones por restaurante son targeted |
| `restaurants` | `{ _id: "hashed" }` | Hashed | Distribución uniforme. Reads por _id son targeted |
| `users` | `{ _id: "hashed" }` | Hashed | Distribución uniforme |
| `carts` | `{ userId: "hashed" }` | Hashed | Distribuye por usuario activo |
| `delivery_zones` | `{ restaurantId: 1 }` | Ranged | Co-localiza zonas de un restaurante |
| `order_events` | `{ metadata.restaurantId: "hashed" }` | Hashed | Distribuye eventos de Time Series |
| `restaurant_stats` | `{ _id: "hashed" }` | Hashed | _id = restaurantId, distribución uniforme |
| `daily_revenue` | `{ restaurantId: 1, date: -1 }` | Ranged | Queries por restaurante + rango de fechas son targeted |

---

## 11.3 Justificación Hashed vs Ranged

**Hashed** para colecciones con heavy write (orders, reviews, users): distribuye uniformemente sin hotspots. Trade-off: range queries requieren scatter-gather, pero nuestras queries filtran por equality (restaurantId) no por rango.

**Ranged** para colecciones donde la co-localización importa (menu_items, delivery_zones): el menú completo de un restaurante está en el mismo shard, evitando scatter-gather en browsing.

---

## 11.4 Estrategia de Crecimiento

```
Fase 1 (MVP):      Replica Set 3 nodos, sin sharding
                    Suficiente para < 100K docs por colección

Fase 2 (Growth):   Habilitar sharding en orders + menu_items
                    Cuando orders > 1M docs o write throughput > 1K ops/s

Fase 3 (Scale):    Sharding en todas las colecciones
                    Múltiples shards por colección
                    Zone sharding para distribución geográfica
```

---

## 11.5 Write/Read Concerns por Capa

| Parámetro | OLTP (Transactional) | OLAP (Analytical) |
|-----------|----------------------|-------------------|
| Write Concern | `w: "majority"` | `w: 1` |
| Read Concern | `readConcern: "majority"` | `readConcern: "local"` |
| Read Preference | `primary` | `secondaryPreferred` |
| Consistencia | Fuerte (causal sessions) | Eventual (< 5s staleness) |
| Retryable Writes | Habilitado | N/A (batch) |

---

## 11.6 Connection String Recomendado

```
mongodb+srv://user:pass@cluster.mongodb.net/restaurant_orders
  ?retryWrites=true
  &w=majority
  &readConcernLevel=majority
  &readPreference=primaryPreferred
  &maxPoolSize=50
  &minPoolSize=10
  &maxIdleTimeMS=30000
  &connectTimeoutMS=10000
  &socketTimeoutMS=45000
```
