const { getDb } = require("../db");
const AppError = require("../errors/AppError");
const { requireFields, toObjectId, requirePositiveNumber } = require("../validation");

class MenuItemCommands {
  static async create({ restaurantId, name, description, price, category, allergens, tags, preparationTimeMin }) {
    requireFields({ restaurantId, name, price, category }, ["restaurantId", "name", "price", "category"]);
    const restOid = toObjectId(restaurantId, "restaurantId");
    const parsedPrice = requirePositiveNumber(price, "price");

    const db = getDb();

    const doc = {
      restaurantId: restOid,
      name,
      description: description || "",
      price: parsedPrice,
      category,
      allergens: allergens || [],
      tags: tags || [],
      available: true,
      preparationTimeMin: parseInt(preparationTimeMin) || 20,
      imageFileId: null,
      salesCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("menu_items").insertOne(doc);
    return { _id: result.insertedId, ...doc };
  }

  static async createMany(restaurantId, items) {
    if (!restaurantId) throw AppError.badRequest("restaurantId is required");
    if (!Array.isArray(items) || items.length === 0) {
      throw AppError.badRequest("items array required");
    }

    const restOid = toObjectId(restaurantId, "restaurantId");

    for (const item of items) {
      requireFields(item, ["name", "price", "category"]);
    }

    const db = getDb();
    const docs = items.map((item) => ({
      restaurantId: restOid,
      name: item.name,
      description: item.description || "",
      price: requirePositiveNumber(item.price, "price"),
      category: item.category,
      allergens: item.allergens || [],
      tags: item.tags || [],
      available: true,
      preparationTimeMin: parseInt(item.preparationTimeMin) || 20,
      imageFileId: null,
      salesCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await db.collection("menu_items").insertMany(docs);
    return { insertedCount: result.insertedCount };
  }

  static async bulkWrite(operations) {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw AppError.badRequest("operations array required");
    }

    const db = getDb();
    const bulkOps = operations.map((op) => {
      if (op.insertOne) {
        const doc = op.insertOne.document;
        requireFields(doc, ["restaurantId", "name", "price", "category"]);
        return {
          insertOne: {
            document: {
              ...doc,
              restaurantId: toObjectId(doc.restaurantId, "restaurantId"),
              available: true,
              salesCount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        };
      }
      if (op.updateOne) {
        return {
          updateOne: {
            filter: { _id: toObjectId(op.updateOne.filter._id, "itemId") },
            update: {
              ...op.updateOne.update,
              $set: { ...(op.updateOne.update.$set || {}), updatedAt: new Date() },
            },
          },
        };
      }
      if (op.updateMany) {
        if (!op.updateMany.filter.restaurantId) {
          throw AppError.badRequest("updateMany requires restaurantId in filter");
        }
        return {
          updateMany: {
            filter: {
              restaurantId: toObjectId(op.updateMany.filter.restaurantId, "restaurantId"),
              ...(op.updateMany.filter.category ? { category: op.updateMany.filter.category } : {}),
            },
            update: {
              ...op.updateMany.update,
              $set: { ...(op.updateMany.update.$set || {}), updatedAt: new Date() },
            },
          },
        };
      }
      if (op.deleteOne) {
        return { deleteOne: { filter: { _id: toObjectId(op.deleteOne.filter._id, "itemId") } } };
      }
      throw AppError.badRequest("Unsupported bulk operation type");
    });

    const result = await db.collection("menu_items").bulkWrite(bulkOps, { ordered: false });

    return {
      insertedCount: result.insertedCount,
      modifiedCount: result.modifiedCount,
      deletedCount: result.deletedCount,
      upsertedCount: result.upsertedCount,
    };
  }

  static async update(id, { name, description, price, category, allergens, preparationTimeMin } = {}) {
    const _id = toObjectId(id, "itemId");

    const db = getDb();

    const update = { $set: { updatedAt: new Date() } };
    if (name) update.$set.name = name;
    if (description) update.$set.description = description;
    if (price !== undefined) update.$set.price = requirePositiveNumber(price, "price");
    if (category) update.$set.category = category;
    if (allergens) update.$set.allergens = allergens;
    if (preparationTimeMin) update.$set.preparationTimeMin = parseInt(preparationTimeMin);

    if (Object.keys(update.$set).length === 1) {
      throw AppError.badRequest("At least one field to update is required");
    }

    const result = await db.collection("menu_items").updateOne({ _id }, update);
    if (result.matchedCount === 0) throw AppError.notFound("Item");
    return { updated: result.modifiedCount };
  }

  static async toggleAvailability(id, available) {
    const _id = toObjectId(id, "itemId");

    if (available === undefined) {
      throw AppError.badRequest("available flag is required");
    }

    const db = getDb();

    const itemResult = await db.collection("menu_items").updateOne(
      { _id },
      { $set: { available: Boolean(available), updatedAt: new Date() } }
    );
    if (itemResult.matchedCount === 0) throw AppError.notFound("Item");

    const cartResult = await db.collection("carts").updateMany(
      { "items.menuItemId": _id },
      {
        $set: {
          "items.$[elem].available": Boolean(available),
          hasUnavailableItems: !available,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ "elem.menuItemId": _id }] }
    );

    return { itemUpdated: itemResult.modifiedCount, affectedCarts: cartResult.modifiedCount };
  }

  static async updateCategoryPrice(restaurantId, { category, multiplier }) {
    if (!restaurantId) throw AppError.badRequest("restaurantId is required");
    const restOid = toObjectId(restaurantId, "restaurantId");
    const mult = requirePositiveNumber(multiplier, "multiplier");

    const db = getDb();

    const result = await db.collection("menu_items").updateMany(
      {
        restaurantId: restOid,
        ...(category ? { category } : {}),
      },
      { $mul: { price: mult }, $set: { updatedAt: new Date() } }
    );

    return { updated: result.modifiedCount };
  }

  static async delete(id) {
    const _id = toObjectId(id, "itemId");
    const db = getDb();
    const result = await db.collection("menu_items").deleteOne({ _id });
    if (result.deletedCount === 0) throw AppError.notFound("Item");
    return { deleted: result.deletedCount };
  }

  static async deleteMany({ restaurantId, category }) {
    if (!restaurantId) throw AppError.badRequest("restaurantId required");
    const restOid = toObjectId(restaurantId, "restaurantId");

    const db = getDb();
    const filter = { restaurantId: restOid };
    if (category) filter.category = category;

    const result = await db.collection("menu_items").deleteMany(filter);
    return { deleted: result.deletedCount };
  }
}

module.exports = MenuItemCommands;
