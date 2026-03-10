# 9. Transacciones Multi-Documento y Consistencia

## 9.1 Transacción 1: Order Placement (Flow 4)

**Colecciones involucradas:** `carts` (read + delete), `menu_items` (read + update), `restaurants` (read), `delivery_zones` (read), `orders` (insert)

```javascript
const session = client.startSession();

try {
  await session.withTransaction(async () => {
    // 1. Validar carrito
    const cart = await db.carts.findOne({ _id: cartId, userId }, { session });
    if (!cart) throw new Error("Cart not found");
    if (cart.hasUnavailableItems) throw new Error("Cart has unavailable items");

    // 2. Validar disponibilidad de items
    const itemIds = cart.items.map(i => i.menuItemId);
    const availableItems = await db.menu_items.find(
      { _id: { $in: itemIds }, available: true }, { session }
    ).toArray();
    if (availableItems.length !== itemIds.length) {
      throw new Error("Some items are no longer available");
    }

    // 3. Validar restaurante abierto
    const restaurant = await db.restaurants.findOne(
      { _id: cart.restaurantId, isActive: true, isAcceptingOrders: true }, { session }
    );
    if (!restaurant) throw new Error("Restaurant not accepting orders");

    // 4. Validar zona de entrega
    const zone = await db.delivery_zones.findOne({
      restaurantId: cart.restaurantId,
      area: { $geoIntersects: { $geometry: deliveryAddress.coordinates } },
      isActive: true
    }, { session });
    if (!zone) throw new Error("Delivery address outside coverage");

    // 5. Calcular totales
    const subtotal = cart.items.reduce((sum, i) => sum + i.subtotal, 0);
    const tax = subtotal * 0.12;
    const total = subtotal + tax + zone.deliveryFee;

    // 6. Insertar orden
    await db.orders.insertOne({
      orderNumber: `ORD-${Date.now()}`,
      userId, restaurantId: cart.restaurantId,
      items: cart.items.map(i => ({
        menuItemId: i.menuItemId, name: i.name,
        quantity: i.quantity, unitPrice: i.price, subtotal: i.subtotal
      })),
      deliveryAddress,
      status: "pending",
      statusHistory: [{ status: "pending", timestamp: new Date(), actor: "system" }],
      subtotal, tax, deliveryFee: zone.deliveryFee, total,
      paymentMethod, cancellationReason: null,
      estimatedDelivery: new Date(Date.now() + zone.estimatedMinutes * 60000),
      createdAt: new Date(), updatedAt: new Date()
    }, { session });

    // 7. Incrementar salesCount
    for (const item of cart.items) {
      await db.menu_items.updateOne(
        { _id: item.menuItemId },
        { $inc: { salesCount: item.quantity } },
        { session }
      );
    }

    // 8. Eliminar carrito
    await db.carts.deleteOne({ _id: cartId }, { session });
  });
} finally {
  await session.endSession();
}
```

---

## 9.2 Transacción 2: Order Cancellation with Revert (Flow 5 reject)

**Colecciones involucradas:** `orders` (update), `menu_items` (update)

```javascript
const session = client.startSession();

try {
  await session.withTransaction(async () => {
    const order = await db.orders.findOne({ _id: orderId }, { session });
    if (!order) throw new Error("Order not found");
    if (!["pending", "confirmed", "preparing"].includes(order.status)) {
      throw new Error("Order cannot be cancelled in current status");
    }

    // Cancelar orden
    await db.orders.updateOne(
      { _id: orderId },
      {
        $set: { status: "cancelled", cancellationReason: reason, updatedAt: new Date() },
        $push: { statusHistory: { status: "cancelled", timestamp: new Date(), actor, durationFromPrevSec: diff } }
      },
      { session }
    );

    // Revertir salesCount
    for (const item of order.items) {
      await db.menu_items.updateOne(
        { _id: item.menuItemId },
        { $inc: { salesCount: -item.quantity } },
        { session }
      );
    }
  });
} finally {
  await session.endSession();
}
```

---

## 9.3 Transacción 3: Dish Availability Cascade (Flow 8)

**Colecciones involucradas:** `menu_items` (update), `carts` (updateMany)

```javascript
const session = client.startSession();

try {
  await session.withTransaction(async () => {
    // Actualizar disponibilidad del platillo
    await db.menu_items.updateOne(
      { _id: dishId },
      { $set: { available: false, updatedAt: new Date() } },
      { session }
    );

    // Cascada a todos los carritos activos con ese platillo
    await db.carts.updateMany(
      { "items.menuItemId": dishId },
      { $set: { "items.$[elem].available": false, hasUnavailableItems: true, updatedAt: new Date() } },
      { arrayFilters: [{ "elem.menuItemId": dishId }], session }
    );
  });
} finally {
  await session.endSession();
}
```

---

## 9.4 Modelo de Consistencia

### Write Concern por Tipo de Operación

| Operación | Write Concern | Justificación |
|-----------|---------------|---------------|
| Order placement/cancellation | `w: "majority"` | Dato crítico financiero. RPO = 0 |
| Review insert | `w: "majority"` | Integridad de rating |
| Cart mutations | `w: 1` | Efímero, pérdida tolerable |
| restaurant_stats update | `w: 1` | Derivado, reconciliable |
| daily_revenue $merge | `w: 1` | Batch recomputable |

### Read Concern por Tipo de Consulta

| Consulta | Read Concern | Read Preference | Justificación |
|----------|--------------|-----------------|---------------|
| Order status check | `majority` | `primary` | Strong consistency |
| Cart read | `local` | `primary` | Fast, ephemeral |
| Dashboard stats | `local` | `secondaryPreferred` | Eventual OK |
| Menu browsing | `local` | `secondaryPreferred` | Slight staleness OK |
| Geo search | `local` | `secondaryPreferred` | Eventual OK |

### Causal Consistency Sessions

Para flujos donde un usuario escribe y luego lee su propio dato:

```javascript
const session = client.startSession({ causalConsistency: true });

// Write: crear pedido
await db.orders.insertOne(order, { session });

// Read: inmediatamente ver el pedido
const myOrder = await db.orders.findOne({ _id: orderId }, { session });
// Garantiza que lee su propio write, incluso desde secondary
```
