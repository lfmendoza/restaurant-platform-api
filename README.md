# Backend — Restaurant Orders System

Node.js + Express + MongoDB Atlas — CC3089 Bases de Datos 2

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add your MONGO_URI from Atlas

# 3. Initialize the database (run once against Atlas)
mongosh "$MONGO_URI" scripts/init-database.js
mongosh "$MONGO_URI" scripts/create-indexes.js
mongosh "$MONGO_URI" scripts/seed-data.js   # Seeds 500 restaurants + 50,000+ menu_items

# 4. Start the server
npm start          # production
npm run dev        # development (nodemon)
```

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
