# 0. Resumen Ejecutivo

## Sistema de Gestión de Pedidos y Reseñas de Restaurantes

---

## Visión

Sistema backend sobre MongoDB Atlas diseñado con arquitectura **CQRS (Command Query Responsibility Segregation)** inspirada en plataformas como Uber Eats y Wolt, preparado para:

- **Heavy write + heavy read** a escala de millones de transacciones
- **Alta disponibilidad** (5+ nines) con Replica Set Multi-AZ
- **Consistencia fuerte** en flujos transaccionales, eventual en analítica
- **Procesamiento dual:** Stream (Change Streams) + Batch (aggregation $merge)
- **Integración BI** con MongoDB Charts

---

## Arquitectura en una Diapositiva

```
WRITE PATH (Command)          EVENT BRIDGE              READ PATH (Query)
┌──────────────────┐    ┌────────────────────┐    ┌──────────────────────┐
│ 7 Colecciones    │    │ 3 Change Streams   │    │ 3 Colecciones        │
│ OLTP             │───>│ orders → stats     │───>│ OLAP                 │
│                  │    │ reviews → stats    │    │                      │
│ users            │    │ menu_items → stats │    │ restaurant_stats     │
│ restaurants      │    └────────────────────┘    │ (Materialized View)  │
│ menu_items (50K+)│                              │                      │
│ orders (FSM)     │    ┌────────────────────┐    │ order_events         │
│ reviews          │    │ Batch Processing   │    │ (Time Series)        │
│ carts (TTL 24h)  │    │ Nightly $merge     │    │                      │
│ delivery_zones   │    │ Weekly reconcile   │    │ daily_revenue        │
│ (GeoPolygon)     │    └────────────────────┘    │ (Batch Aggregated)   │
└──────────────────┘                              └──────────────────────┘
```

---

## Colecciones: 10 + GridFS

| Capa | Colección | Propósito |
|------|-----------|-----------|
| OLTP | `users` | Perfiles, direcciones, favoritos |
| OLTP | `restaurants` | Perfil, GeoJSON Point, horarios, estado |
| OLTP | `menu_items` | Catálogo ≥50K docs, disponibilidad, imágenes GridFS |
| OLTP | `orders` | Pedidos con FSM de 7 estados, items embebidos |
| OLTP | `reviews` | Reseñas con tags, respuesta de restaurante embebida |
| OLTP | `carts` | Carritos efímeros con TTL 24h, Extended Reference |
| OLTP | `delivery_zones` | Polígonos GeoJSON de cobertura por restaurante |
| OLAP | `restaurant_stats` | Vista materializada: ratings, revenue, top items |
| OLAP | `order_events` | Time Series: eventos de transición de estado |
| OLAP | `daily_revenue` | Métricas diarias pre-agregadas por batch |
| Storage | GridFS `images` | Imágenes de platillos y logos |

---

## 12 Flujos Críticos Modelados

1. Restaurant Discovery (geoespacial)
2. Menu Browsing
3. Cart Management (add/modify/remove)
4. **Order Placement** (transacción atómica, 4 colecciones)
5. Order Confirmation/Rejection (restaurante)
6. Order Status Progression (FSM con 7 estados)
7. Bulk Menu Item Upload (bulkWrite)
8. Dish Availability Toggle (cascada a carts)
9. Restaurant Availability Toggle (manual + automático)
10. Review Submission + Rating Propagation (incremental O(1))
11. Daily Revenue Batch ($merge)
12. Real-Time Dashboard (4 queries paralelas OLTP+OLAP)

---

## Cobertura de Rúbrica: 120/100

| Criterio | Pts | Cómo |
|----------|-----|------|
| Documentación diseño | 10 | 16 docs técnicos |
| Modelado datos | 5 | 10 colecciones CQRS |
| Índices 4+ tipos | 5 | 17+ índices, 5 tipos + TTL |
| CRUD embebido/referenciado | 10 | Flows 3,4,7,8 |
| Lectura multi-colección | 15 | Lookups, filtros, sort, skip, limit |
| Actualización 1/varios | 10 | updateOne/updateMany + arrays |
| Eliminación 1/varios | 10 | deleteOne/deleteMany + TTL |
| GridFS + 50K docs | 5 | Imágenes + seed menu_items |
| Agregaciones simples | 5 | count, distinct |
| Agregaciones complejas | 10 | 6+ pipelines + $merge |
| Arrays | 10 | $push/$pull/$addToSet/$slice |
| Embebidos | 5 | items, statusHistory, addresses |
| **Extra:** bulkWrite | 5 | Seed + batch ops |
| **Extra:** MongoDB Charts | 5 | 3+ gráficas de negocio |
| **Extra:** Frontend | 10 | React + Vite + Tailwind |
