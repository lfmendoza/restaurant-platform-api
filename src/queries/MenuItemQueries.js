const { ObjectId } = require("mongodb");
const { getReadDb } = require("../db");
const AppError = require("../errors/AppError");

class MenuItemQueries {
  static async list({ restaurantId, category, available, allergen, price_lte, q, skip = 0, limit = 20, sort = "salesCount" }) {
    const db = getReadDb();

    const filter = {};
    if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);
    if (category) filter.category = category;
    if (available !== undefined) filter.available = available === "true";
    if (allergen) filter.allergens = allergen;
    if (price_lte) filter.price = { $lte: parseFloat(price_lte) };
    if (q) filter.$text = { $search: q };

    let sortObj = { _id: 1 };
    if (sort === "price") sortObj = { price: 1 };
    else if (sort === "-price") sortObj = { price: -1 };
    else if (sort === "-salesCount" || sort === "salesCount") sortObj = { salesCount: -1 };

    return db
      .collection("menu_items")
      .find(filter, {
        projection: {
          name: 1, description: 1, price: 1, category: 1, allergens: 1,
          tags: 1, available: 1, preparationTimeMin: 1, imageFileId: 1,
          salesCount: 1, restaurantId: 1,
        },
      })
      .sort(sortObj)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();
  }

  static async getById(id) {
    const db = getReadDb();
    const item = await db.collection("menu_items").findOne({ _id: new ObjectId(id) });
    if (!item) throw AppError.notFound("Item");
    return item;
  }
}

module.exports = MenuItemQueries;
