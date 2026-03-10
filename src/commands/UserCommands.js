const { getDb } = require("../db");
const AppError = require("../errors/AppError");
const { requireFields, toObjectId } = require("../validation");

class UserCommands {
  static async create({ email, name, phone, role, defaultAddress }) {
    requireFields({ email, name }, ["email", "name"]);

    const db = getDb();

    const doc = {
      email,
      name,
      phone: phone || null,
      role: role || "customer",
      defaultAddress: defaultAddress || null,
      orderHistory: [],
      favoriteRestaurants: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const result = await db.collection("users").insertOne(doc);
      return { _id: result.insertedId, ...doc };
    } catch (err) {
      if (err.code === 11000) throw AppError.conflict("Email already registered");
      throw err;
    }
  }

  static async update(id, { name, phone, defaultAddress } = {}) {
    const _id = toObjectId(id, "userId");

    const db = getDb();

    const update = { $set: { updatedAt: new Date() } };
    if (name) update.$set.name = name;
    if (phone) update.$set.phone = phone;
    if (defaultAddress) update.$set.defaultAddress = defaultAddress;

    if (Object.keys(update.$set).length === 1) {
      throw AppError.badRequest("At least one field to update is required");
    }

    const result = await db.collection("users").updateOne({ _id }, update);
    if (result.matchedCount === 0) throw AppError.notFound("User");
    return { updated: result.modifiedCount };
  }

  static async addFavorite(id, restaurantId) {
    const _id = toObjectId(id, "userId");
    const restId = toObjectId(restaurantId, "restaurantId");

    const db = getDb();

    const result = await db.collection("users").updateOne(
      { _id },
      {
        $push: {
          favoriteRestaurants: { $each: [restId], $slice: -20 },
        },
        $set: { updatedAt: new Date() },
      }
    );

    if (result.matchedCount === 0) throw AppError.notFound("User");
    return { updated: result.modifiedCount };
  }

  static async delete(id) {
    const _id = toObjectId(id, "userId");
    const db = getDb();
    const result = await db.collection("users").deleteOne({ _id });
    if (result.deletedCount === 0) throw AppError.notFound("User");
    return { deleted: result.deletedCount };
  }
}

module.exports = UserCommands;
