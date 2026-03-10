# Backend — Restaurant Orders System

Node.js + Express + MongoDB Atlas — CC3089 Bases de Datos 2

## Repositorios

- **Backend (API)**: [restaurant-platform-api](https://github.com/lfmendoza/restaurant-platform-api)
- **Frontend (cliente web)**: [restaurant-platform-web](https://github.com/lfmendoza/restaurant-platform-web)

## Setup (primera vez)

```bash
# 0. Prerrequisitos
# - Node.js 20+ y npm
# - Cuenta de MongoDB Atlas con un cluster creado

# 1. Clonar repos
git clone https://github.com/lfmendoza/restaurant-platform-api.git
git clone https://github.com/lfmendoza/restaurant-platform-web.git
cd restaurant-platform-api

# 2. Instalar dependencias
npm install

# 3. Configurar Atlas y variables de entorno
cp .env.example .env
# Edita .env y reemplaza MONGO_URI con tu connection string de Atlas
# (incluyendo usuario, password y el nombre de base de datos restaurant_orders)

# 4. Inicializar la base de datos (solo una vez contra Atlas)
mongosh "$MONGO_URI" scripts/init-database.js
mongosh "$MONGO_URI" scripts/create-indexes.js
mongosh "$MONGO_URI" scripts/seed-data.js   # 500 restaurantes + 50,000+ menu_items

# 5. Levantar el servidor API
npm run dev        # desarrollo (nodemon en http://localhost:3000)
# o
npm start          # producción
```

### Cómo validar que todo quedó bien

- **Healthcheck**: `GET http://localhost:3000/health` → debe responder `{"status":"ok","db":"restaurant_orders"}`.
- **Datos de prueba**: por ejemplo `GET http://localhost:3000/restaurants?limit=5` y `GET http://localhost:3000/menu-items?limit=5` deberían devolver datos sembrados.
- **Analítica**: `GET http://localhost:3000/analytics/top-restaurants` para validar colecciones OLAP y pipelines.

### Cómo explorar todo lo que ofrece el API

- **Tablas de endpoints**: usa la sección **API Endpoints** de este README como índice rápido (similar a la doc pública de APIs como Airbnb/Zapier).
- **Herramientas cliente**: importa estos endpoints en Postman/Insomnia (colección recomendada):
  - Agrupa por recurso: `Users`, `Restaurants`, `Menu Items`, `Carts`, `Orders`, `Reviews`, `Files`, `Analytics`.
  - Usa una variable de entorno `{{baseUrl}} = http://localhost:3000`.
- **Cliente web**: en el repo `restaurant-platform-web` configura la misma `MONGO_URI`/backend y levanta el frontend para navegar el flujo completo de usuario (descubrir restaurantes, armar carrito, ordenar, reseñar).
- **Documentación interactiva (Swagger UI)**: con el servidor levantado, visita `http://localhost:3000/docs` para ver y probar la especificación OpenAPI de la API directamente en el navegador.

### Próximos pasos (tests y onboarding)

- **Tests**: una vez verificado el flujo end-to-end, se pueden agregar pruebas de integración con supertest sobre rutas clave (`/orders`, `/analytics/*`, etc.) para automatizar regresiones.
- **Onboarding adicional**: los documentos en `docs/` (`00-RESUMEN-EJECUTIVO.md`, `02-ARQUITECTURA-SISTEMA.md`, `07-OPERACIONES-CRUD.md`, `08-AGREGACIONES-PIPELINES.md`, etc.) profundizan en modelo de datos, flujos críticos y decisiones de diseño.

### Checklist rápido antes de cada despliegue

- Confirmar que `.env` apunta al cluster y base correctos (`DB_NAME=restaurant_orders` para dev).
- Ejecutar (si es un cluster nuevo): `init-database.js`, `create-indexes.js`, `seed-data.js`.
- Levantar el servidor y verificar `GET /health`.
- Probar al menos: `GET /restaurants`, `GET /menu-items`, `GET /analytics/top-restaurants`.
- Ejecutar `npm test` y asegurarse de que todas las pruebas pasan.

## Guías de uso (recetas rápidas)

### Crear un flujo completo de pedido

1. **Crear un usuario**
   - `POST /users`
   - Body de ejemplo:
   ```json
   {
     "email": "demo@example.com",
     "name": "Usuario Demo",
     "role": "customer"
   }
   ```

2. **Descubrir restaurantes cercanos**
   - `GET /restaurants/search?lat=14.6&lng=-90.5&cuisine=italiana`

3. **Listar menú de un restaurante**
   - `GET /menu-items?restaurantId=<restaurantId>&limit=20`

4. **Armar carrito**
   - `POST /carts/items`
   - Body de ejemplo:
   ```json
   {
     "userId": "<userId>",
     "restaurantId": "<restaurantId>",
     "menuItemId": "<menuItemId>",
     "quantity": 2
   }
   ```

5. **Confirmar orden**
   - `POST /orders`
   - Body de ejemplo (simplificado):
   ```json
   {
     "userId": "<userId>",
     "restaurantId": "<restaurantId>",
     "deliveryAddress": {
       "street": "6a Avenida 12-34",
       "city": "Guatemala",
       "zone": "Zona 10"
     },
     "paymentMethod": "card"
   }
   ```

6. **Avanzar estado de la orden**
   - `PATCH /orders/:id/status` con body:
   ```json
   {
     "status": "confirmed"
   }
   ```

7. **Dejar una reseña**
   - `POST /reviews`
   - Body de ejemplo:
   ```json
   {
     "orderId": "<orderId>",
     "rating": 5,
     "title": "Excelente servicio",
     "comment": "La comida llegó a tiempo y caliente",
     "tags": ["recomendado"]
   }
   ```

8. **Consultar analítica básica**
   - `GET /analytics/top-restaurants`
   - `GET /analytics/best-selling-items`

### Códigos de estado y errores comunes

- **200 / 201**: Operación exitosa.
- **400**: Error de validación (body o query params inválidos, transiciones de estado ilegales, etc.).
- **404**: Recurso no encontrado (por ejemplo `orderId` inexistente o no asociado al usuario).
- **409**: Conflicto de negocio (por ejemplo carrito inconsistente, restaurante cerrado, fuera de zona de entrega).
- **500**: Error interno inesperado (revisar logs del servidor).

## API Endpoints

### Users
| Method | Path | Description |
|--------|------|-------------|
| POST | /users | Create user |
| GET | /users | List users (filter, sort, skip, limit) |
| GET | /users/:id | Get user |
| PATCH | /users/:id | Update user |
| PATCH | /users/:id/favorites | Add favorite restaurant ($push $slice) |
| DELETE | /users/:id | Delete user |

### Restaurants
| Method | Path | Description |
|--------|------|-------------|
| POST | /restaurants | Create restaurant |
| GET | /restaurants/search?lat&lng&cuisine | Geospatial search ($geoIntersects) |
| GET | /restaurants | List restaurants |
| GET | /restaurants/:id | Get restaurant + stats |
| PATCH | /restaurants/:id/status | Toggle isAcceptingOrders |
| DELETE | /restaurants/:id | Delete restaurant |

### Menu Items
| Method | Path | Description |
|--------|------|-------------|
| POST | /menu-items | Create item |
| POST | /menu-items/many | insertMany |
| POST | /menu-items/bulk | bulkWrite (insert+update+delete) |
| GET | /menu-items | List (filter, sort, skip, limit, $text) |
| PATCH | /menu-items/:id/availability | Toggle + cascade to carts (arrayFilters) |
| PATCH | /menu-items/restaurant/:id/category-price | updateMany price |
| DELETE | /menu-items/:id | deleteOne |
| DELETE | /menu-items | deleteMany |

### Carts
| Method | Path | Description |
|--------|------|-------------|
| GET | /carts | Get cart |
| POST | /carts/items | Add item ($push upsert, embedded) |
| PATCH | /carts/items/:menuItemId | Update qty (positional $) |
| DELETE | /carts/items/:menuItemId | Remove item ($pull) |
| DELETE | /carts | Delete cart |

### Orders
| Method | Path | Description |
|--------|------|-------------|
| POST | /orders | Create order (multi-doc transaction) |
| GET | /orders | List ($lookup users+restaurants, filter, sort, skip, limit) |
| GET | /orders/:id | Get order |
| PATCH | /orders/:id/status | FSM transition ($push statusHistory) |
| DELETE | /orders/cancelled | deleteMany cancelled |
| DELETE | /orders/:id | deleteOne |

### Reviews
| Method | Path | Description |
|--------|------|-------------|
| POST | /reviews | Create review (validates delivered order) |
| GET | /reviews | List (filter, sort, skip, limit) |
| PATCH | /reviews/:id/tag | Add tag ($addToSet) |
| PATCH | /reviews/:id/response | Restaurant response (embedded 1:1) |
| DELETE | /reviews/:id | deleteOne |
| DELETE | /reviews | deleteMany |

### Files (GridFS)
| Method | Path | Description |
|--------|------|-------------|
| POST | /files/upload | Upload image (multipart) |
| GET | /files/:id | Stream image download |
| GET | /files | List files |
| DELETE | /files/:id | Delete from GridFS + unlink |

### Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | /analytics/count | countDocuments (simple) |
| GET | /analytics/distinct | distinct values (simple) |
| GET | /analytics/top-restaurants | $group + $lookup (complex P1) |
| GET | /analytics/best-selling-items | $unwind + $group (complex P2) |
| GET | /analytics/revenue-by-month | $group temporal (complex P3) |
| GET | /analytics/rating-distribution/:id | $group + $push (complex P4) |
| GET | /analytics/order-velocity/:id | $dateTrunc 5min (complex P5, Time Series) |
| GET | /analytics/avg-transition-time/:id | FSM avg duration |
| GET | /analytics/tags | $unwind tags array |
| GET | /analytics/allergens | $unwind allergens array |
| GET | /analytics/revenue-by-category | embedded $unwind + $lookup |
| GET | /analytics/daily-revenue | Query OLAP daily_revenue |
| GET | /analytics/restaurant-stats | Query OLAP restaurant_stats |
| POST | /analytics/run-batch | Trigger batch jobs ($merge) |

## Rubric Coverage

| Criterion | Points | Implementation |
|-----------|--------|----------------|
| Indexes | 5 | `scripts/create-indexes.js` (22 indexes) |
| CRUD Create | 10 | POST /orders (tx), /carts (embedded), /restaurants, /menu-items/bulk |
| CRUD Read | 15 | GET /orders ($lookup, filter, sort, skip, limit) |
| CRUD Update | 10 | PATCH /orders/:id/status, /menu-items/:id/availability (cascade) |
| CRUD Delete | 10 | DELETE /reviews/:id, /orders/cancelled, TTL carts |
| GridFS + 50K | 5 | POST/GET/DELETE /files + 50K menu_items via seed |
| Simple Aggregations | 5 | /analytics/count, /analytics/distinct |
| Complex Aggregations | 10 | /analytics/* (6 pipelines + $merge) |
| Arrays | 10 | $push, $pull, $addToSet, $slice, arrayFilters |
| Embedded Docs | 5 | orders.items, statusHistory, deliveryAddress, positional |
| bulkWrite (extra) | 5 | POST /menu-items/bulk |
