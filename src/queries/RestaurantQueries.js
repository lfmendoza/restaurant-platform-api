const { ObjectId } = require("mongodb");
const { getReadDb } = require("../db");
const AppError = require("../errors/AppError");

class RestaurantQueries {
  static async search({ lat, lng, cuisine, skip = 0, limit = 20 }) {
    if (!lat || !lng) throw AppError.badRequest("lat and lng are required");

    const db = getReadDb();
    const userPoint = { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] };

    const zones = await db
      .collection("delivery_zones")
      .find({ area: { $geoIntersects: { $geometry: userPoint } }, isActive: true })
      .project({ restaurantId: 1, deliveryFee: 1, estimatedMinutes: 1 })
      .toArray();

    if (zones.length === 0) return { restaurants: [], total: 0 };

    const restaurantIds = zones.map((z) => z.restaurantId);
    const zoneByRestaurant = {};
    zones.forEach((z) => {
      zoneByRestaurant[z.restaurantId.toString()] = {
        deliveryFee: z.deliveryFee,
        estimatedMinutes: z.estimatedMinutes,
      };
    });

    const restFilter = { _id: { $in: restaurantIds }, isActive: true, isAcceptingOrders: true };
    if (cuisine) restFilter.cuisineTypes = cuisine;

    const [restaurants, stats] = await Promise.all([
      db
        .collection("restaurants")
        .find(restFilter, {
          projection: {
            name: 1, description: 1, location: 1, address: 1, cuisineTypes: 1,
            tags: 1, isAcceptingOrders: 1, logoFileId: 1, menuItemCount: 1,
          },
        })
        .sort({ name: 1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray(),
      db
        .collection("restaurant_stats")
        .find({ _id: { $in: restaurantIds } }, { projection: { avgRating: 1, totalReviews: 1, totalOrders: 1 } })
        .toArray(),
    ]);

    const statsById = {};
    stats.forEach((s) => { statsById[s._id.toString()] = s; });

    const result = restaurants.map((r) => ({
      ...r,
      avgRating: statsById[r._id.toString()]?.avgRating || 0,
      totalReviews: statsById[r._id.toString()]?.totalReviews || 0,
      deliveryFee: zoneByRestaurant[r._id.toString()]?.deliveryFee,
      estimatedMinutes: zoneByRestaurant[r._id.toString()]?.estimatedMinutes,
    }));

    return { restaurants: result, total: result.length };
  }

  static async getById(id) {
    const db = getReadDb();
    const _id = new ObjectId(id);

    const restaurant = await db.collection("restaurants").findOne({ _id });
    if (!restaurant) throw AppError.notFound("Restaurant");

    const stats = await db
      .collection("restaurant_stats")
      .findOne({ _id }, { projection: { avgRating: 1, totalReviews: 1, totalOrders: 1 } });

    return { ...restaurant, stats: stats || {} };
  }

  static async list({ cuisine, isActive, isAcceptingOrders, skip = 0, limit = 20 }) {
    const db = getReadDb();

    const filter = {};
    if (cuisine) filter.cuisineTypes = cuisine;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (isAcceptingOrders !== undefined) filter.isAcceptingOrders = isAcceptingOrders === "true";

    return db
      .collection("restaurants")
      .find(filter, {
        projection: {
          name: 1, description: 1, location: 1, address: 1, cuisineTypes: 1, tags: 1,
          isActive: 1, isAcceptingOrders: 1, menuItemCount: 1, logoFileId: 1,
        },
      })
      .sort({ name: 1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();
  }

  static async menuCategories(restaurantId) {
    const db = getReadDb();
    return db
      .collection("menu_items")
      .distinct("category", { restaurantId: new ObjectId(restaurantId), available: true });
  }

  static async deliveryZones(restaurantId) {
    const db = getReadDb();
    return db
      .collection("delivery_zones")
      .find(
        { restaurantId: new ObjectId(restaurantId), isActive: true },
        { projection: { restaurantId: 1, zoneName: 1, area: 1, deliveryFee: 1, estimatedMinutes: 1 } }
      )
      .toArray();
  }

  static async deliveryZonesBatch(restaurantIds) {
    const db = getReadDb();
    const ids = restaurantIds.map((id) => new ObjectId(id));
    return db
      .collection("delivery_zones")
      .find(
        { restaurantId: { $in: ids }, isActive: true },
        { projection: { restaurantId: 1, zoneName: 1, area: 1, deliveryFee: 1, estimatedMinutes: 1 } }
      )
      .toArray();
  }
}

module.exports = RestaurantQueries;
