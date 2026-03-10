const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb, getClient } = require("../db");

const router = Router();

const VALID_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["picked_up"],
  picked_up: ["delivered"],
  delivered: [],
  cancelled: [],
};

// POST /orders — Create order with multi-doc transaction
// Rubrica: CRUD Creación doc embebido + Transacción multi-documento
router.post("/", async (req, res) => {
  const client = getClient();
  const db = getDb();
  const session = client.startSession();

  try {
    const { userId, cartId, deliveryAddress, paymentMethod } = req.body;

    let createdOrder;

    await session.withTransaction(async () => {
      // 1. Validate cart
      const cart = await db
        .collection("carts")
        .findOne({ _id: new ObjectId(cartId), userId: new ObjectId(userId) }, { session });

      if (!cart) throw new Error("Cart not found or does not belong to user");
      if (cart.hasUnavailableItems) throw new Error("Cart has unavailable items");
      if (cart.items.length === 0) throw new Error("Cart is empty");

      // 2. Validate all items still available
      const itemIds = cart.items.map((i) => i.menuItemId);
      const availableItems = await db
        .collection("menu_items")
        .find({ _id: { $in: itemIds }, available: true }, { session })
        .toArray();

      if (availableItems.length !== itemIds.length) {
        throw new Error("Some items are no longer available");
      }

      // 3. Validate restaurant is open
      const restaurant = await db
        .collection("restaurants")
        .findOne(
          { _id: cart.restaurantId, isActive: true, isAcceptingOrders: true },
          { session }
        );

      if (!restaurant) throw new Error("Restaurant not accepting orders");

      // 4. Validate delivery zone ($geoIntersects)
      const zone = await db.collection("delivery_zones").findOne(
        {
          restaurantId: cart.restaurantId,
          area: {
            $geoIntersects: {
              $geometry: deliveryAddress.coordinates,
            },
          },
          isActive: true,
        },
        { session }
      );

      if (!zone) throw new Error("Delivery address outside coverage");

      // 5. Calculate totals
      const subtotal = cart.items.reduce((s, i) => s + i.subtotal, 0);
      const tax = Math.round(subtotal * 0.12 * 100) / 100;
      const total = Math.round((subtotal + tax + zone.deliveryFee) * 100) / 100;

      const now = new Date();
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // 6. Insert order with embedded items snapshot + embedded deliveryAddress
      const orderDoc = {
        orderNumber,
        userId: new ObjectId(userId),
        restaurantId: cart.restaurantId,
        items: cart.items.map((i) => ({
          menuItemId: i.menuItemId,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.price,
          subtotal: i.subtotal,
        })),
        deliveryAddress,
        status: "pending",
        statusHistory: [
          { status: "pending", timestamp: now, actor: "system" },
        ],
        subtotal: Math.round(subtotal * 100) / 100,
        tax,
        deliveryFee: zone.deliveryFee,
        total,
        paymentMethod,
        cancellationReason: null,
        estimatedDelivery: new Date(
          now.getTime() + zone.estimatedMinutes * 60000
        ),
        createdAt: now,
        updatedAt: now,
      };

      const orderResult = await db
        .collection("orders")
        .insertOne(orderDoc, { session });

      createdOrder = { _id: orderResult.insertedId, ...orderDoc };

      // 7. Increment salesCount on menu_items
      for (const item of cart.items) {
        await db.collection("menu_items").updateOne(
          { _id: item.menuItemId },
          { $inc: { salesCount: item.quantity } },
          { session }
        );
      }

      // 8. Delete cart
      await db
        .collection("carts")
        .deleteOne({ _id: cart._id }, { session });

      // 9. Append to user orderHistory (Subset Pattern $slice)
      await db.collection("users").updateOne(
        { _id: new ObjectId(userId) },
        {
          $push: {
            orderHistory: {
              $each: [orderResult.insertedId],
              $slice: -50,
            },
          },
        },
        { session }
      );
    });

    res.status(201).json(createdOrder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

// GET /orders — List orders with $lookup users + restaurants + filters + sort + skip + limit
// Rubrica: CRUD Lectura multi-colección ($lookup), filtros, sort, skip, limit
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const {
      restaurantId,
      userId,
      status,
      skip = 0,
      limit = 20,
    } = req.query;

    const match = {};
    if (restaurantId) match.restaurantId = new ObjectId(restaurantId);
    if (userId) match.userId = new ObjectId(userId);
    if (status) match.status = status;

    const orders = await db
      .collection("orders")
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $lookup: {
            from: "restaurants",
            localField: "restaurantId",
            foreignField: "_id",
            as: "restaurant",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            orderNumber: 1,
            status: 1,
            total: 1,
            paymentMethod: 1,
            items: 1,
            deliveryAddress: 1,
            estimatedDelivery: 1,
            statusHistory: 1,
            createdAt: 1,
            updatedAt: 1,
            "user.name": 1,
            "user.phone": 1,
            "user.email": 1,
            "restaurant.name": 1,
            "restaurant.address": 1,
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: parseInt(skip) },
        { $limit: parseInt(limit) },
      ])
      .toArray();

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /orders/:id — Get single order
router.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const order = await db
      .collection("orders")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /orders/:id/status — FSM state transition
// Rubrica: updateOne + $push statusHistory (Bucket Pattern) + Embebidos
router.patch("/:id/status", async (req, res) => {
  try {
    const db = getDb();
    const { status: newStatus, actor = "system", reason } = req.body;

    const order = await db
      .collection("orders")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!order) return res.status(404).json({ error: "Order not found" });

    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({
        error: `Transition ${order.status} → ${newStatus} is not allowed`,
        allowed,
      });
    }

    const now = new Date();
    const lastHistory = order.statusHistory[order.statusHistory.length - 1];
    const durationFromPrevSec = lastHistory
      ? Math.floor((now - lastHistory.timestamp) / 1000)
      : 0;

    const historyEntry = {
      status: newStatus,
      timestamp: now,
      actor,
      durationFromPrevSec,
    };

    const update = {
      $set: { status: newStatus, updatedAt: now },
      $push: { statusHistory: historyEntry },
    };

    if (newStatus === "cancelled" && reason) {
      update.$set.cancellationReason = reason;
    }

    await db
      .collection("orders")
      .updateOne({ _id: new ObjectId(req.params.id) }, update);

    res.json({ status: newStatus, transition: `${order.status} → ${newStatus}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /orders/cancelled — deleteMany cancelled orders older than date
// Rubrica: CRUD Eliminación varios docs (deleteMany)
router.delete("/cancelled", async (req, res) => {
  try {
    const db = getDb();
    const { before } = req.query;

    const filter = { status: "cancelled" };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const result = await db.collection("orders").deleteMany(filter);
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /orders/:id — deleteOne
router.delete("/:id", async (req, res) => {
  try {
    const db = getDb();
    const result = await db
      .collection("orders")
      .deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: "Order not found" });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
