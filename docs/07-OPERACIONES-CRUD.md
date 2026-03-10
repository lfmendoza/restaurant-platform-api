# 7. Operaciones CRUD — Detalle de Implementación

## 7.1 Creación de Documentos

### Documento Embebido

**Agregar ítem a carrito (Extended Reference embebido):**

```javascript
db.carts.updateOne(
  { userId: ObjectId("u1"), restaurantId: ObjectId("r1") },
  {
    $push: { items: { menuItemId: ObjectId("mi1"), name: "Pizza Margherita", price: 89.00, quantity: 2, subtotal: 178.00, available: true } },
    $set: { updatedAt: new Date() },
    $setOnInsert: { createdAt: new Date(), expiresAt: new Date(Date.now() + 86400000), subtotal: 0, hasUnavailableItems: false }
  },
  { upsert: true }
);
```

**Crear orden con items embebidos (snapshot congelado):**

```javascript
db.orders.insertOne({
  orderNumber: "ORD-2026-00001",
  userId: ObjectId("u1"),
  restaurantId: ObjectId("r1"),
  items: [
    { menuItemId: ObjectId("mi1"), name: "Pizza Margherita", quantity: 2, unitPrice: 89.00, subtotal: 178.00 },
    { menuItemId: ObjectId("mi2"), name: "Coca-Cola 600ml", quantity: 2, unitPrice: 15.00, subtotal: 30.00 }
  ],
  deliveryAddress: { street: "6a Avenida 12-34", city: "Guatemala", zone: "Zona 10", coordinates: { type: "Point", coordinates: [-90.5069, 14.5943] } },
  status: "pending",
  statusHistory: [{ status: "pending", timestamp: new Date(), actor: "system" }],
  subtotal: 208.00, tax: 24.96, deliveryFee: 15.00, total: 247.96,
  paymentMethod: "card", cancellationReason: null,
  estimatedDelivery: new Date(Date.now() + 2700000),
  createdAt: new Date(), updatedAt: new Date()
});
```

### Documentos Referenciados

**Crear un restaurante:**

```javascript
db.restaurants.insertOne({
  name: "La Pizzería Artesanal",
  description: "Pizza napolitana auténtica",
  location: { type: "Point", coordinates: [-90.5128, 14.6013] },
  address: { street: "4a Calle 7-89", city: "Guatemala", zone: "Zona 10" },
  operatingHours: { monday: { open: "10:00", close: "22:00" }, /* ... */ },
  cuisineTypes: ["italiana", "pizza"], tags: ["pet-friendly"],
  isActive: true, isAcceptingOrders: true,
  logoFileId: null, menuItemCount: 0,
  createdAt: new Date(), updatedAt: new Date()
});
```

**Crear varios menu_items (insertMany):**

```javascript
db.menu_items.insertMany([
  { restaurantId: ObjectId("r1"), name: "Pizza Margherita", description: "Tomate, mozzarella, albahaca", price: 89.00, category: "Pizzas", allergens: ["gluten", "lácteos"], tags: ["vegetariano"], available: true, preparationTimeMin: 20, imageFileId: null, salesCount: 0, createdAt: new Date(), updatedAt: new Date() },
  { restaurantId: ObjectId("r1"), name: "Pasta Carbonara", description: "Guanciale, huevo, pecorino", price: 95.00, category: "Pastas", allergens: ["gluten", "lácteos", "huevo"], tags: [], available: true, preparationTimeMin: 15, imageFileId: null, salesCount: 0, createdAt: new Date(), updatedAt: new Date() }
]);
```

---

## 7.2 Lectura y Consultas

### Consulta Multi-Colección ($lookup)

**Pedidos con datos de usuario y restaurante:**

```javascript
db.orders.aggregate([
  { $match: { restaurantId: ObjectId("r1"), status: { $in: ["pending", "confirmed"] } } },
  { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
  { $lookup: { from: "restaurants", localField: "restaurantId", foreignField: "_id", as: "restaurant" } },
  { $unwind: "$user" },
  { $unwind: "$restaurant" },
  { $project: { orderNumber: 1, "user.name": 1, "user.phone": 1, "restaurant.name": 1, items: 1, total: 1, status: 1, createdAt: 1 } },
  { $sort: { createdAt: -1 } },
  { $skip: 0 },
  { $limit: 20 }
]);
```

### Filtros + Proyecciones + Ordenamiento + Skip + Límite

```javascript
db.menu_items.find(
  { restaurantId: ObjectId("r1"), available: true, category: "Pizzas", price: { $lte: 150 } },
  { name: 1, price: 1, allergens: 1, preparationTimeMin: 1, imageFileId: 1 }
)
.sort({ salesCount: -1 })
.skip(10)
.limit(10);
```

### Búsqueda Full-Text

```javascript
db.reviews.find(
  { $text: { $search: "deliciosa pizza servicio" } },
  { score: { $meta: "textScore" } }
).sort({ score: { $meta: "textScore" } }).limit(10);
```

### Búsqueda Geoespacial

```javascript
db.restaurants.find({
  location: { $nearSphere: { $geometry: { type: "Point", coordinates: [-90.5069, 14.5943] }, $maxDistance: 5000 } },
  isActive: true
}).limit(20);
```

---

## 7.3 Actualización de Documentos

### Actualizar 1 Documento

```javascript
db.orders.updateOne(
  { _id: ObjectId("ord1"), status: "confirmed" },
  { $set: { status: "preparing", updatedAt: new Date() }, $push: { statusHistory: { status: "preparing", timestamp: new Date(), actor: "restaurant", durationFromPrevSec: 30 } } }
);
```

### Actualizar Varios Documentos

```javascript
db.menu_items.updateMany(
  { restaurantId: ObjectId("r1"), category: "Bebidas" },
  { $mul: { price: 1.10 }, $set: { updatedAt: new Date() } }
);
```

### Manejo de Arrays

**$push — Agregar a favoritos (con Subset Pattern $slice):**

```javascript
db.users.updateOne(
  { _id: ObjectId("u1") },
  { $push: { favoriteRestaurants: { $each: [ObjectId("r2")], $slice: -20 } } }
);
```

**$pull — Remover ítem de carrito:**

```javascript
db.carts.updateOne(
  { userId: ObjectId("u1") },
  { $pull: { items: { menuItemId: ObjectId("mi1") } }, $set: { updatedAt: new Date() } }
);
```

**$addToSet — Agregar tag sin duplicados:**

```javascript
db.reviews.updateOne(
  { _id: ObjectId("rev1") },
  { $addToSet: { tags: "recomendado" } }
);
```

**arrayFilters — Actualización condicional en array (Flow 8 cascade):**

```javascript
db.carts.updateMany(
  { "items.menuItemId": ObjectId("mi1") },
  { $set: { "items.$[elem].available": false, hasUnavailableItems: true } },
  { arrayFilters: [{ "elem.menuItemId": ObjectId("mi1") }] }
);
```

---

## 7.4 Eliminación de Documentos

### Eliminar 1 Documento

```javascript
db.reviews.deleteOne({ _id: ObjectId("rev1") });
```

### Eliminar Varios Documentos

```javascript
db.orders.deleteMany({ restaurantId: ObjectId("r1"), status: "cancelled", createdAt: { $lt: new Date("2025-01-01") } });
```

### Eliminación Automática (TTL)

Carts se eliminan automáticamente cuando `expiresAt` expira (índice TTL). No requiere operación explícita.

---

## 7.5 Operaciones Bulk (Extra)

```javascript
db.menu_items.bulkWrite([
  { insertOne: { document: { restaurantId: ObjectId("r1"), name: "Ensalada César", price: 65.00, category: "Ensaladas", available: true, salesCount: 0, createdAt: new Date(), updatedAt: new Date() } } },
  { updateOne: { filter: { _id: ObjectId("mi1") }, update: { $set: { price: 95.00 } } } },
  { updateMany: { filter: { restaurantId: ObjectId("r1"), category: "Bebidas" }, update: { $set: { available: false } } } },
  { deleteOne: { filter: { _id: ObjectId("mi_old") } } }
], { ordered: false });
```
