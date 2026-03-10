# 1. Descripción del Problema, Alcance y Supuestos

## 1.1 Descripción del Problema

El sector de delivery de alimentos requiere sistemas que gestionen eficientemente **pedidos** y **reseñas** a escala, con patrones de acceso caracterizados por:

- **Heavy Write:** Creación continua de pedidos, actualizaciones de estado (7 transiciones por orden), reseñas, carritos efímeros, toggles de disponibilidad
- **Heavy Read:** Búsquedas geoespaciales de restaurantes, browsing de menús, dashboards en tiempo real, historial de pedidos, rankings
- **Alta Disponibilidad (5+ nines):** El sistema no puede tener downtime en horas pico; failover automático < 10 segundos
- **Consistencia Controlada:** Fuerte para transacciones de pedidos (ACID), eventual para analítica (aceptable staleness)
- **Procesamiento Dual:** Eventos en tiempo real (Change Streams) + agregación por lotes (nightly $merge)

El sistema permite a usuarios descubrir restaurantes por ubicación, navegar menús, construir carritos, realizar pedidos con validación atómica, y dejar reseñas; mientras que restaurantes gestionan menús, confirman/rechazan pedidos, y monitorean métricas de negocio en dashboards en tiempo real.

---

## 1.2 Requerimientos No Funcionales (NFRs)

| NFR | Target | Mecanismo |
|-----|--------|-----------|
| Disponibilidad | 99.999% (5 nines) | Replica Set 3 nodos Multi-AZ, auto-failover |
| Latencia de lectura | < 50ms p95 | Materialized views, índices compuestos, projections |
| Latencia de escritura | < 100ms p95 | Write concern majority, retryable writes |
| Throughput escritura | Miles de ops/seg | Sharding por restaurantId (hashed) |
| Consistencia transaccional | ACID multi-doc | Transactions con session.withTransaction() |
| Consistencia analítica | Eventual (< 5s) | Change Streams → materialized views |
| Recuperación ante fallos | RPO=0, RTO < 10s | Write concern majority + auto-failover |
| Escalabilidad horizontal | Lineal | Shard keys diseñadas por patrón de acceso |

---

## 1.3 Alcance

### In Scope

- 10 colecciones (7 OLTP + 3 OLAP) + GridFS
- CRUD completo sobre todas las colecciones transaccionales
- 12 flujos críticos de datos modelados end-to-end
- 3 transacciones multi-documento
- 17+ índices en 5 tipos + TTL
- Aggregation pipelines simples y complejas
- GridFS para imágenes con seed de 50,000+ documentos
- Change Streams para materialización en tiempo real
- Batch processing con $merge para reconciliación
- MongoDB Charts para BI
- Frontend React (extra)

### Out of Scope (Fase de Diseño)

- Implementación de código backend
- Despliegue en producción
- Autenticación/autorización (JWT, OAuth)
- Pasarelas de pago reales
- Notificaciones push

---

## 1.4 Supuestos

1. **MongoDB Atlas M10+** como entorno (soporte para transacciones multi-documento y Change Streams)
2. **Geolocalización** de restaurantes y zonas de entrega en Guatemala (coordenadas aprox. lng: -90.5, lat: 14.6)
3. **`menu_items`** como colección candidata para ≥50,000 documentos (500 restaurantes × 100 platillos)
4. **Idioma de reseñas:** Español e inglés soportados para índice de texto
5. **Zona horaria:** UTC para timestamps; conversión a local en capa de aplicación
6. **Carritos expiran** a las 24 horas si no se convierten en orden
7. **Un carrito por usuario por restaurante** (constraint de índice unique compuesto)
8. **Restaurantes pueden tener múltiples zonas de entrega** con diferente tarifa y tiempo estimado
9. **`notablescan: true`** — toda consulta sin índice es rechazada
10. **Order state machine** con 7 estados y transiciones validadas en capa de aplicación
