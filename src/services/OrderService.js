const { ObjectId } = require("mongodb");
const { getDb, getClient } = require("../db");
const AppError = require("../errors/AppError");

class OrderService {
  static async checkout(userId, cartId, deliveryAddress, paymentMethod) {
    const client = getClient();
    const db = getDb();
    const session = client.startSession();

    try {
      let createdOrder;

      await session.withTransaction(async () => {
        const cart = await db
          .collection("carts")
          .findOne(
            { _id: new ObjectId(cartId), userId: new ObjectId(userId) },
            { session }
          );

        if (!cart) throw AppError.badRequest("Cart not found or does not belong to user");
        if (cart.hasUnavailableItems) throw AppError.badRequest("Cart has unavailable items");
        if (cart.items.length === 0) throw AppError.badRequest("Cart is empty");

        const itemIds = cart.items.map((i) => i.menuItemId);
        const availableItems = await db
          .collection("menu_items")
          .find({ _id: { $in: itemIds }, available: true }, { session })
          .toArray();

        if (availableItems.length !== itemIds.length) {
          throw AppError.badRequest("Some items are no longer available");
        }

        const restaurant = await db.collection("restaurants").findOne(
          { _id: cart.restaurantId, isActive: true, isAcceptingOrders: true },
          { session }
        );
        if (!restaurant) throw AppError.badRequest("Restaurant not accepting orders");

        const zone = await db.collection("delivery_zones").findOne(
          {
            restaurantId: cart.restaurantId,
            area: { $geoIntersects: { $geometry: deliveryAddress.coordinates } },
            isActive: true,
          },
          { session }
        );
        if (!zone) throw AppError.badRequest("Delivery address outside coverage");

        const subtotal = cart.items.reduce((s, i) => s + i.subtotal, 0);
        const tax = Math.round(subtotal * 0.12 * 100) / 100;
        const total = Math.round((subtotal + tax + zone.deliveryFee) * 100) / 100;

        const now = new Date();
        const orderDoc = {
          orderNumber: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
          statusHistory: [{ status: "pending", timestamp: now, actor: "system" }],
          subtotal: Math.round(subtotal * 100) / 100,
          tax,
          deliveryFee: zone.deliveryFee,
          total,
          paymentMethod,
          cancellationReason: null,
          estimatedDelivery: new Date(now.getTime() + zone.estimatedMinutes * 60000),
          createdAt: now,
          updatedAt: now,
        };

        const result = await db.collection("orders").insertOne(orderDoc, { session });
        createdOrder = { _id: result.insertedId, ...orderDoc };

        for (const item of cart.items) {
          await db.collection("menu_items").updateOne(
            { _id: item.menuItemId },
            { $inc: { salesCount: item.quantity } },
            { session }
          );
        }

        await db.collection("carts").deleteOne({ _id: cart._id }, { session });

        await db.collection("users").updateOne(
          { _id: new ObjectId(userId) },
          {
            $push: {
              orderHistory: { $each: [result.insertedId], $slice: -50 },
            },
          },
          { session }
        );
      });

      return createdOrder;
    } finally {
      await session.endSession();
    }
  }
}

module.exports = OrderService;
