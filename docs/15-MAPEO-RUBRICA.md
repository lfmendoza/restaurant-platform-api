# 15. Mapeo Detallado con Rúbrica de Evaluación

## ETAPA 01 — Diseño (15 puntos)

| Criterio | Puntos | Documento(s) | Estado |
|----------|--------|--------------|--------|
| Documentación del diseño completo | 10 | `00` a `15` (16 docs técnicos con diagramas Mermaid) | Cubierto |
| Modelado de datos (campos, tipos, sentido) | 5 | `03` (7 OLTP) + `04` (3 OLAP) + `schemas/` (10 JSON Schemas) | Cubierto |

---

## ETAPA 02 — Implementación (85 puntos base)

### Índices (5 pts)

| Requisito | Tipo | Colección | Documento |
|-----------|------|-----------|-----------|
| Índice simple | `{ email: 1 }` unique | users | `10` |
| Índice compuesto | `{ restaurantId: 1, status: 1, createdAt: -1 }` | orders | `10` |
| Índice multikey | `{ tags: 1 }`, `{ cuisineTypes: 1 }`, `{ allergens: 1 }` | reviews, restaurants, menu_items | `10` |
| Índice geoespacial | `{ location: "2dsphere" }`, `{ area: "2dsphere" }` | restaurants, delivery_zones | `10` |
| Índice texto | `{ title: "text", comment: "text" }` | reviews, menu_items | `10` |
| Validación explain() | Análisis por tipo de índice | Todas | `10` |

**Total: 22 índices definidos, 6 tipos (simple, compuesto, multikey, geoespacial, texto, TTL)**

### CRUD — Creación (10 pts)

| Requisito | Operación | Ejemplo | Documento |
|-----------|-----------|---------|-----------|
| Documento embebido | $push items a cart/order | Flow 3, 4 | `07` |
| Documentos referenciados | insertOne restaurant, insertMany menu_items | Flow 7 | `07` |
| Crear uno | insertOne | orders, reviews, restaurants | `07` |
| Crear varios | insertMany, bulkWrite | menu_items seed 50K+ | `07`, `12` |

### CRUD — Lectura (15 pts)

| Requisito | Implementación | Documento |
|-----------|----------------|-----------|
| Consultas multi-colección ($lookup) | orders + users + restaurants | `07` |
| Filtros | `{ status, restaurantId, available, price: { $lte } }` | `07` |
| Proyecciones | `{ name: 1, price: 1, _id: 0 }` | `07` |
| Ordenamiento | `.sort({ createdAt: -1 })`, `.sort({ salesCount: -1 })` | `07` |
| Skip | `.skip(10)` | `07` |
| Límite | `.limit(20)` | `07` |

### CRUD — Actualización (10 pts)

| Requisito | Operación | Ejemplo | Documento |
|-----------|-----------|---------|-----------|
| Actualizar 1 doc | updateOne | Order status change | `07`, `06` Flow 5,6 |
| Actualizar varios docs | updateMany | Dish availability cascade, price update | `07`, `06` Flow 8 |

### CRUD — Eliminación (10 pts)

| Requisito | Operación | Ejemplo | Documento |
|-----------|-----------|---------|-----------|
| Eliminar 1 doc | deleteOne | Eliminar reseña, eliminar cart | `07` |
| Eliminar varios docs | deleteMany | Eliminar órdenes canceladas antiguas | `07` |
| Eliminación automática | TTL index on carts | Auto-expire a las 24h | `10` |

### GridFS y Archivos (5 pts)

| Requisito | Implementación | Documento |
|-----------|----------------|-----------|
| Manejo de archivos | Upload/download/delete imágenes vía GridFS | `12` |
| ≥50,000 documentos | menu_items seed con bulkWrite (500 rest × 100 items) | `12` |

### Agregaciones Simples (5 pts)

| Operación | Ejemplo | Documento |
|-----------|---------|-----------|
| countDocuments | Total pedidos delivered por restaurante | `08` |
| distinct | Estados distintos, categorías distintas | `08` |

### Agregaciones Complejas (10 pts)

| Pipeline | Descripción | Documento |
|----------|-------------|-----------|
| Pipeline 1 | Restaurantes mejor calificados ($group + $lookup) | `08` |
| Pipeline 2 | Platillos más vendidos ($unwind + $group) | `08` |
| Pipeline 3 | Ventas por restaurante/mes ($group temporal) | `08` |
| Pipeline 4 | Distribución de ratings ($group + $push) | `08` |
| Pipeline 5 | Tiempo promedio por transición (Time Series) | `08` |
| Pipeline 6 | Order velocity (ventana 5 min) | `08` |
| Materialized view | Daily revenue $merge | `08`, `13` |
| Reconciliation | Stats full recompute $merge | `08`, `13` |

### Manejo de Arrays (10 pts)

| Operación | Ejemplo | Documento |
|-----------|---------|-----------|
| $push | Agregar item a cart, agregar statusHistory | `07`, `06` |
| $pull | Remover item de cart | `07`, `06` Flow 3 |
| $addToSet | Agregar tag sin duplicados | `07` |
| $slice (Subset Pattern) | Limitar favoriteRestaurants a 20 | `07`, `05` |
| arrayFilters | Cascade disponibilidad en carts | `07`, `06` Flow 8 |

### Manejo de Documentos Embebidos (5 pts)

| Patrón | Ejemplo | Documento |
|--------|---------|-----------|
| Extended Reference | orders.items[] con snapshot | `05`, `03` |
| Bucket Pattern | orders.statusHistory[] | `05`, `03` |
| Embedded 1:1 | deliveryAddress, operatingHours, address | `05`, `03` |
| Positional update | carts.items.$.quantity | `07`, `06` Flow 3 |

---

## Extras (20 puntos)

### bulkWrite (5 pts)

| Implementación | Documento |
|----------------|-----------|
| Seed 50K+ menu_items con bulkWrite ordered: false | `12`, `07` |
| Operaciones mixtas (insert + update + delete) | `07` |

### MongoDB Charts (5 pts)

| Chart | Tipo | Pts | Documento |
|-------|------|-----|-----------|
| Top 10 restaurantes por rating | Bar horizontal | 2 | `14` |
| Revenue trend 30 días | Line chart | 2 | `14` |
| Distribución de calificaciones | Stacked bar | 2 | `14` |
| **(Máximo 5 pts)** | | **5** | |

### Frontend (10 pts)

| Implementación | Stack | Documento |
|----------------|-------|-----------|
| Interfaz amigable con dashboard integrado | React + Vite + Tailwind | README |

---

## Resumen de Puntaje

| Sección | Base | Extra |
|---------|------|-------|
| Documentación diseño | 10 | — |
| Modelado datos | 5 | — |
| Índices | 5 | — |
| CRUD Creación | 10 | — |
| CRUD Lectura | 15 | — |
| CRUD Actualización | 10 | — |
| CRUD Eliminación | 10 | — |
| GridFS + 50K | 5 | — |
| Agregaciones simples | 5 | — |
| Agregaciones complejas | 10 | — |
| Arrays | 10 | — |
| Embebidos | 5 | — |
| bulkWrite | — | 5 |
| MongoDB Charts | — | 5 |
| Frontend | — | 10 |
| **TOTAL** | **100** | **20** |
| **GRAN TOTAL** | | **120/100** |
