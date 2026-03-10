# 2. Arquitectura del Sistema

## 2.1 Patrón Arquitectónico: CQRS + Event-Driven

El sistema implementa **CQRS (Command Query Responsibility Segregation)** donde:

- **Write Path (Command):** Todas las mutaciones van a las 7 colecciones OLTP (source of truth)
- **Event Bridge:** Change Streams escuchan mutaciones en `orders`, `reviews`, `menu_items` y propagan cambios
- **Read Path (Query):** Dashboards y analítica leen de 3 colecciones OLAP pre-computadas (0 $lookups at query time)

```mermaid
flowchart TB
  subgraph clientLayer [Capa Cliente]
    FE["Frontend React/Vite"]
    RestPanel["Panel Restaurante"]
    AdminDash["Dashboard Analytics"]
  end

  subgraph commandLayer [Command Layer]
    CmdOrders["POST /orders"]
    CmdCarts["PUT /carts"]
    CmdReviews["POST /reviews"]
    CmdMenuBulk["POST /menu-items/bulk"]
    CmdAvail["PATCH /availability"]
  end

  subgraph queryLayer [Query Layer]
    QrySearch["GET /restaurants/search"]
    QryMenu["GET /menu"]
    QryStats["GET /stats"]
    QryDash["GET /analytics"]
  end

  subgraph oltp [OLTP - Source of Truth]
    users["users"]
    restaurants["restaurants"]
    menu_items["menu_items 50K+"]
    orders["orders FSM"]
    reviews["reviews"]
    carts["carts TTL-24h"]
    delivery_zones["delivery_zones GeoPolygon"]
  end

  subgraph eventBridge [Event Bridge - Change Streams]
    CS1["CS: orders"]
    CS2["CS: reviews"]
    CS3["CS: menu_items"]
  end

  subgraph olap [OLAP - Derived]
    restaurant_stats["restaurant_stats"]
    order_events["order_events TimeSeries"]
    daily_revenue["daily_revenue Batch"]
  end

  subgraph batch [Batch Processing]
    NightlyAgg["Nightly $merge"]
    WeeklyRecon["Weekly reconcile"]
  end

  subgraph gfs [File Storage]
    GridFS["GridFS images"]
  end

  subgraph biL [BI]
    Charts["MongoDB Charts"]
  end

  FE --> commandLayer
  FE --> queryLayer
  RestPanel --> commandLayer
  RestPanel --> queryLayer
  AdminDash --> queryLayer

  commandLayer --> oltp
  queryLayer --> olap
  queryLayer --> oltp

  oltp --> eventBridge
  eventBridge --> olap

  batch --> oltp
  batch --> olap

  commandLayer --> GridFS
  olap --> Charts
  Charts --> AdminDash
```

---

## 2.2 Write Path (Detalle)

```mermaid
sequenceDiagram
  participant Client
  participant CommandAPI
  participant OLTP
  participant CS as Change Streams
  participant OLAP

  Client->>CommandAPI: POST /orders (crear pedido)
  CommandAPI->>OLTP: startTransaction()
  CommandAPI->>OLTP: validate + insertOne(orders) + updateMany(menu_items) + deleteOne(carts)
  CommandAPI->>OLTP: commitTransaction()
  OLTP->>CS: oplog event emitido automáticamente
  CS->>OLAP: insertOne(order_events) — Time Series
  CS->>OLAP: updateOne(restaurant_stats) — Materialized View
```

**Garantías del Write Path:**
- `writeConcern: { w: "majority" }` para pedidos y transacciones
- `retryWrites: true` habilitado en connection string
- Transacciones multi-documento con `session.withTransaction()`

---

## 2.3 Read Path (Detalle)

```mermaid
sequenceDiagram
  participant Dashboard
  participant QueryAPI
  participant OLAP
  participant OLTP

  Dashboard->>QueryAPI: GET /restaurants/:id/dashboard
  par Queries paralelas
    QueryAPI->>OLAP: findOne(restaurant_stats) — pre-computado
    QueryAPI->>OLAP: aggregate(order_events) — velocity 5min buckets
    QueryAPI->>OLAP: find(daily_revenue) — trend 30 días
    QueryAPI->>OLTP: find(orders, status: active) — tiempo real
  end
  QueryAPI-->>Dashboard: payload ensamblado
```

**Garantías del Read Path:**
- `readConcern: "local"` para OLAP (eventual consistency aceptable)
- `readPreference: "secondaryPreferred"` para dashboards (descargar al primary)
- Cero `$lookup` en queries de dashboard (todo pre-computado)

---

## 2.4 Event Bridge (Change Streams)

```
┌─────────────┐     ┌──────────────────────────────────────────────────────┐
│ orders      │────>│ Change Stream Processor #1                           │
│ (insert/    │     │  ├── insertOne(order_events) — Time Series event     │
│  update)    │     │  ├── updateOne(restaurant_stats) — $inc totals       │
│             │     │  └── On "delivered": $inc totalRevenue, avgOrderValue│
└─────────────┘     └──────────────────────────────────────────────────────┘

┌─────────────┐     ┌──────────────────────────────────────────────────────┐
│ reviews     │────>│ Change Stream Processor #2                           │
│ (insert)    │     │  ├── Incremental avgRating recalc (O(1))             │
│             │     │  ├── $inc totalReviews                               │
│             │     │  └── $inc ratingDistribution[rating]                 │
└─────────────┘     └──────────────────────────────────────────────────────┘

┌─────────────┐     ┌──────────────────────────────────────────────────────┐
│ menu_items  │────>│ Change Stream Processor #3                           │
│ (update     │     │  └── On bulk insert: $set restaurant menuItemCount   │
│  available) │     │                                                      │
└─────────────┘     └──────────────────────────────────────────────────────┘
```

---

## 2.5 Batch Processing Layer

| Job | Frecuencia | Source | Target | Operación |
|-----|------------|--------|--------|-----------|
| Daily Revenue | Nightly 02:00 UTC | `orders` (delivered) | `daily_revenue` | $match → $unwind → $group → $merge |
| Stats Reconciliation | Weekly | `orders` + `reviews` | `restaurant_stats` | Full recompute → $merge (overwrite) |
| Seed Data | One-time | Script | `menu_items` | bulkWrite 50K+ docs |

---

## 2.6 Alta Disponibilidad

```mermaid
flowchart LR
  subgraph az1 [AZ-1]
    P["Primary"]
  end
  subgraph az2 [AZ-2]
    S1["Secondary-1"]
  end
  subgraph az3 [AZ-3]
    S2["Secondary-2"]
  end

  P -->|"sync replication"| S1
  P -->|"sync replication"| S2
  S1 -.->|"auto-failover < 10s"| P
  S2 -.->|"auto-failover < 10s"| P
```

| Parámetro | Valor OLTP | Valor OLAP |
|-----------|------------|------------|
| Write Concern | `w: "majority"` | `w: 1` |
| Read Concern | `readConcern: "majority"` | `readConcern: "local"` |
| Read Preference | `primary` | `secondaryPreferred` |
| Consistencia | Fuerte (causal sessions) | Eventual |
| Retryable Writes | Sí | N/A |

---

## 2.7 Árbol de Dependencias entre Colecciones

```mermaid
flowchart TD
  users --> orders
  users --> reviews
  users --> carts
  restaurants --> orders
  restaurants --> reviews
  restaurants --> menu_items
  restaurants --> delivery_zones
  menu_items --> orders
  menu_items --> carts
  orders --> reviews
  
  orders -.->|"Change Stream"| order_events
  orders -.->|"Change Stream"| restaurant_stats
  reviews -.->|"Change Stream"| restaurant_stats
  orders -.->|"Batch $merge"| daily_revenue
```

Líneas sólidas = referencias directas (FK). Líneas punteadas = propagación asíncrona.
