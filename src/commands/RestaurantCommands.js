const { getDb } = require("../db");
const AppError = require("../errors/AppError");
const { requireFields, toObjectId } = require("../validation");

function buildDefaultZones(restaurantId, lng, lat, zoneName) {
  const closeD = 0.012;
  const farD = 0.027;
  const makeRect = (cLng, cLat, dLng, dLat) => [
    [cLng - dLng, cLat - dLat],
    [cLng + dLng, cLat - dLat],
    [cLng + dLng, cLat + dLat],
    [cLng - dLng, cLat + dLat],
    [cLng - dLng, cLat - dLat],
  ];

  return [
    {
      restaurantId,
      zoneName: (zoneName || "Zona") + " (cercana)",
      area: { type: "Polygon", coordinates: [makeRect(lng, lat, closeD, closeD * 0.75)] },
      deliveryFee: 12,
      estimatedMinutes: 20,
      isActive: true,
    },
    {
      restaurantId,
      zoneName: (zoneName || "Zona") + " (extendida)",
      area: { type: "Polygon", coordinates: [makeRect(lng, lat, farD, farD * 0.8)] },
      deliveryFee: 25,
      estimatedMinutes: 40,
      isActive: true,
    },
  ];
}

class RestaurantCommands {
  static async create({ name, description, location, address, operatingHours, cuisineTypes, tags }) {
    requireFields({ name, location, address }, ["name", "location", "address"]);

    if (!location.type || !location.coordinates) {
      throw AppError.badRequest("location must include type and coordinates");
    }

    const db = getDb();

    const doc = {
      name,
      description: description || "",
      location,
      address,
      operatingHours: operatingHours || null,
      cuisineTypes: cuisineTypes || [],
      tags: tags || [],
      isActive: true,
      isAcceptingOrders: true,
      logoFileId: null,
      menuItemCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const result = await db.collection("restaurants").insertOne(doc);
      const restaurantId = result.insertedId;

      const zones = buildDefaultZones(
        restaurantId,
        location.coordinates[0],
        location.coordinates[1],
        address?.zone || name
      );
      await db.collection("delivery_zones").insertMany(zones);

      return { _id: restaurantId, ...doc };
    } catch (err) {
      if (err.code === 11000) throw AppError.conflict("Restaurant already exists");
      throw err;
    }
  }

  static async createMany(restaurants) {
    if (!Array.isArray(restaurants) || restaurants.length === 0) {
      throw AppError.badRequest("restaurants array required");
    }

    for (const r of restaurants) {
      requireFields(r, ["name", "location", "address"]);
      if (!r.location?.type || !r.location?.coordinates || r.location.coordinates.length < 2) {
        throw AppError.badRequest(`Restaurant "${r.name}" must have location with type and coordinates [lng, lat]`);
      }
    }

    const db = getDb();
    const docs = restaurants.map((r) => ({
      ...r,
      isActive: true,
      isAcceptingOrders: true,
      logoFileId: null,
      menuItemCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    try {
      const result = await db.collection("restaurants").insertMany(docs);

      const insertedIds = Object.values(result.insertedIds);
      const allZones = [];
      docs.forEach((doc, i) => {
        const rid = insertedIds[i];
        const zones = buildDefaultZones(
          rid,
          doc.location.coordinates[0],
          doc.location.coordinates[1],
          doc.address?.zone || doc.name
        );
        allZones.push(...zones);
      });
      if (allZones.length > 0) {
        await db.collection("delivery_zones").insertMany(allZones);
      }

      return { insertedCount: result.insertedCount };
    } catch (err) {
      if (err.code === 11000) throw AppError.conflict("Duplicate restaurant in batch");
      throw err;
    }
  }

  static async update(id, { name, description, operatingHours, cuisineTypes, tags } = {}) {
    const _id = toObjectId(id, "restaurantId");

    const db = getDb();

    const update = { $set: { updatedAt: new Date() } };
    if (name) update.$set.name = name;
    if (description) update.$set.description = description;
    if (operatingHours) update.$set.operatingHours = operatingHours;
    if (cuisineTypes) update.$set.cuisineTypes = cuisineTypes;
    if (tags) update.$set.tags = tags;

    if (Object.keys(update.$set).length === 1) {
      throw AppError.badRequest("At least one field to update is required");
    }

    const result = await db.collection("restaurants").updateOne({ _id }, update);
    if (result.matchedCount === 0) throw AppError.notFound("Restaurant");
    return { updated: result.modifiedCount };
  }

  static async toggleStatus(id, { isAcceptingOrders, isActive } = {}) {
    const _id = toObjectId(id, "restaurantId");

    if (isAcceptingOrders === undefined && isActive === undefined) {
      throw AppError.badRequest("At least one status flag (isAcceptingOrders or isActive) is required");
    }

    const db = getDb();

    const update = { $set: { updatedAt: new Date() } };
    if (isAcceptingOrders !== undefined) update.$set.isAcceptingOrders = Boolean(isAcceptingOrders);
    if (isActive !== undefined) update.$set.isActive = Boolean(isActive);

    const result = await db.collection("restaurants").updateOne({ _id }, update);
    if (result.matchedCount === 0) throw AppError.notFound("Restaurant");
    return { updated: result.modifiedCount };
  }

  static async delete(id) {
    const _id = toObjectId(id, "restaurantId");
    const db = getDb();
    const result = await db.collection("restaurants").deleteOne({ _id });
    if (result.deletedCount === 0) throw AppError.notFound("Restaurant");
    await db.collection("delivery_zones").deleteMany({ restaurantId: _id });
    return { deleted: result.deletedCount };
  }

  static async fixMissingDeliveryZones() {
    const db = getDb();

    const allRestaurants = await db
      .collection("restaurants")
      .find(
        { "location.coordinates": { $exists: true } },
        { projection: { _id: 1, name: 1, location: 1, address: 1 } }
      )
      .toArray();

    const existingZones = await db
      .collection("delivery_zones")
      .aggregate([{ $group: { _id: "$restaurantId" } }])
      .toArray();
    const hasZones = new Set(existingZones.map((z) => z._id.toString()));

    const missing = allRestaurants.filter((r) => !hasZones.has(r._id.toString()));

    if (missing.length === 0) {
      return { fixed: 0, total: allRestaurants.length, restaurants: [] };
    }

    const allNewZones = [];
    for (const r of missing) {
      const [lng, lat] = r.location.coordinates;
      const zones = buildDefaultZones(r._id, lng, lat, r.address?.zone || r.name);
      allNewZones.push(...zones);
    }

    await db.collection("delivery_zones").insertMany(allNewZones);

    return {
      fixed: missing.length,
      zonesCreated: allNewZones.length,
      total: allRestaurants.length,
      restaurants: missing.map((r) => ({ _id: r._id, name: r.name })),
    };
  }

  static async redistribute() {
    const ZONE_CENTERS = [
      { name: "Zona 1", center: [-90.5133, 14.6437] },
      { name: "Zona 4", center: [-90.5252, 14.6290] },
      { name: "Zona 7", center: [-90.5530, 14.6430] },
      { name: "Zona 9", center: [-90.5190, 14.6110] },
      { name: "Zona 10", center: [-90.5065, 14.6070] },
      { name: "Zona 11", center: [-90.5470, 14.6060] },
      { name: "Zona 13", center: [-90.5280, 14.5870] },
      { name: "Zona 14", center: [-90.4970, 14.5930] },
      { name: "Zona 15", center: [-90.4850, 14.5990] },
      { name: "Zona 16", center: [-90.4720, 14.5950] },
      { name: "Mixco", center: [-90.5850, 14.6340] },
      { name: "Carr. Salvador", center: [-90.4600, 14.5850] },
    ];

    const GRID_COLS = 7;
    const GRID_SPACING = 0.003;

    const db = getDb();

    const restaurants = await db
      .collection("restaurants")
      .find({}, { projection: { _id: 1, name: 1, location: 1, address: 1 } })
      .sort({ _id: 1 })
      .toArray();

    if (restaurants.length === 0) {
      return { repositioned: 0 };
    }

    function nearestZone(r) {
      const coords = r.location?.coordinates;
      if (!coords || coords.length < 2) return 0;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < ZONE_CENTERS.length; i++) {
        const dx = coords[0] - ZONE_CENTERS[i].center[0];
        const dy = coords[1] - ZONE_CENTERS[i].center[1];
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    }

    const groups = {};
    for (const r of restaurants) {
      const zi = nearestZone(r);
      if (!groups[zi]) groups[zi] = [];
      groups[zi].push(r);
    }

    const locationOps = [];
    const allNewZones = [];

    for (const [ziStr, rests] of Object.entries(groups)) {
      const zi = parseInt(ziStr);
      const center = ZONE_CENTERS[zi].center;
      const totalRows = Math.ceil(rests.length / GRID_COLS);

      for (let idx = 0; idx < rests.length; idx++) {
        const r = rests[idx];
        const col = idx % GRID_COLS;
        const row = Math.floor(idx / GRID_COLS);
        const newLng =
          Math.round(
            (center[0] + (col - (GRID_COLS - 1) / 2) * GRID_SPACING) * 100000
          ) / 100000;
        const newLat =
          Math.round(
            (center[1] + (row - (totalRows - 1) / 2) * GRID_SPACING * 0.75) *
              100000
          ) / 100000;

        locationOps.push({
          updateOne: {
            filter: { _id: r._id },
            update: {
              $set: {
                location: {
                  type: "Point",
                  coordinates: [newLng, newLat],
                },
                updatedAt: new Date(),
              },
            },
          },
        });

        const zones = buildDefaultZones(
          r._id,
          newLng,
          newLat,
          r.address?.zone || r.name
        );
        allNewZones.push(...zones);
      }
    }

    await db.collection("restaurants").bulkWrite(locationOps, { ordered: false });

    await db.collection("delivery_zones").deleteMany({});
    if (allNewZones.length > 0) {
      await db.collection("delivery_zones").insertMany(allNewZones);
    }

    return {
      repositioned: locationOps.length,
      zonesRecreated: allNewZones.length,
      groups: Object.entries(groups).map(([zi, rests]) => ({
        zone: ZONE_CENTERS[parseInt(zi)].name,
        count: rests.length,
      })),
    };
  }
}

module.exports = RestaurantCommands;
