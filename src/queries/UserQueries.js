const { ObjectId } = require("mongodb");
const { getReadDb } = require("../db");
const AppError = require("../errors/AppError");

class UserQueries {
  static async list({ role, skip = 0, limit = 20 }) {
    const db = getReadDb();

    const filter = {};
    if (role) filter.role = role;

    return db
      .collection("users")
      .find(filter, {
        projection: { email: 1, name: 1, phone: 1, role: 1, createdAt: 1 },
      })
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();
  }

  static async getById(id) {
    const db = getReadDb();
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(id) },
      {
        projection: {
          email: 1, name: 1, phone: 1, role: 1, defaultAddress: 1,
          orderHistory: { $slice: -10 }, favoriteRestaurants: 1, createdAt: 1,
        },
      }
    );
    if (!user) throw AppError.notFound("User");
    return user;
  }
}

module.exports = UserQueries;
