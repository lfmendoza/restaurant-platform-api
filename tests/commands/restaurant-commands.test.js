jest.mock("../../src/db");

const { ObjectId } = require("mongodb");
const { getDb } = require("../../src/db");
const RestaurantCommands = require("../../src/commands/RestaurantCommands");
const { setupMockDb } = require("../helpers/mock-db");
const { ID } = require("../helpers/fixtures");

let col;

const validRestaurant = {
  name: "Test Restaurant",
  location: { type: "Point", coordinates: [-90.51, 14.59] },
  address: { street: "Calle 1", city: "Guatemala", zone: "Zona 10" },
};

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("RestaurantCommands.create — validation", () => {
  it("throws 400 when name is missing", async () => {
    await expect(RestaurantCommands.create({ location: validRestaurant.location, address: validRestaurant.address }))
      .rejects.toMatchObject({ statusCode: 400, message: /name/ });
  });

  it("throws 400 when location is missing", async () => {
    await expect(RestaurantCommands.create({ name: "X", address: validRestaurant.address }))
      .rejects.toMatchObject({ statusCode: 400, message: /location/ });
  });

  it("throws 400 when address is missing", async () => {
    await expect(RestaurantCommands.create({ name: "X", location: validRestaurant.location }))
      .rejects.toMatchObject({ statusCode: 400, message: /address/ });
  });

  it("throws 400 when location lacks type or coordinates", async () => {
    await expect(RestaurantCommands.create({ name: "X", location: {}, address: validRestaurant.address }))
      .rejects.toMatchObject({ statusCode: 400, message: /type and coordinates/ });
  });

  it("throws 409 on duplicate (MongoDB 11000)", async () => {
    col("restaurants").insertOne.mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));

    await expect(RestaurantCommands.create(validRestaurant))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("RestaurantCommands.create", () => {
  it("inserts restaurant with defaults", async () => {
    col("restaurants").insertOne.mockResolvedValue({ insertedId: ID.rest1 });

    const rest = await RestaurantCommands.create({ ...validRestaurant, operatingHours: {} });

    expect(rest._id).toEqual(ID.rest1);
    expect(rest.isActive).toBe(true);
    expect(rest.isAcceptingOrders).toBe(true);
    expect(rest.menuItemCount).toBe(0);
    expect(rest.cuisineTypes).toEqual([]);
  });
});

describe("RestaurantCommands.createMany", () => {
  it("inserts multiple restaurants with defaults", async () => {
    col("restaurants").insertMany.mockResolvedValue({
      insertedCount: 2,
      insertedIds: { 0: new ObjectId(), 1: new ObjectId() },
    });
    col("delivery_zones").insertMany.mockResolvedValue({ insertedCount: 6 });

    const result = await RestaurantCommands.createMany([
      { ...validRestaurant, name: "A" },
      { ...validRestaurant, name: "B" },
    ]);

    expect(result.insertedCount).toBe(2);
    const docs = col("restaurants").insertMany.mock.calls[0][0];
    docs.forEach((d) => {
      expect(d.isActive).toBe(true);
      expect(d.menuItemCount).toBe(0);
    });
  });

  it("throws 400 on empty array", async () => {
    await expect(RestaurantCommands.createMany([]))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when an item in batch is missing required fields", async () => {
    await expect(RestaurantCommands.createMany([{ name: "A" }]))
      .rejects.toMatchObject({ statusCode: 400, message: /location/ });
  });
});

describe("RestaurantCommands.update — validation", () => {
  it("throws 400 on invalid id format", async () => {
    await expect(RestaurantCommands.update("not-an-id", { name: "X" }))
      .rejects.toMatchObject({ statusCode: 400, message: /restaurantId/ });
  });

  it("throws 400 when no update fields provided", async () => {
    await expect(RestaurantCommands.update(ID.rest1.toString(), {}))
      .rejects.toMatchObject({ statusCode: 400, message: /at least one field/i });
  });
});

describe("RestaurantCommands.update", () => {
  it("updates specified fields only", async () => {
    col("restaurants").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await RestaurantCommands.update(ID.rest1.toString(), {
      name: "New Name", cuisineTypes: ["thai"],
    });

    expect(result.updated).toBe(1);
    const update = col("restaurants").updateOne.mock.calls[0][1];
    expect(update.$set.name).toBe("New Name");
    expect(update.$set.cuisineTypes).toEqual(["thai"]);
  });

  it("throws 404 when not found", async () => {
    col("restaurants").updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(RestaurantCommands.update(ID.rest1.toString(), { name: "X" }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("RestaurantCommands.toggleStatus — validation", () => {
  it("throws 400 when no status flag provided", async () => {
    await expect(RestaurantCommands.toggleStatus(ID.rest1.toString(), {}))
      .rejects.toMatchObject({ statusCode: 400, message: /at least one status flag/i });
  });

  it("throws 400 on invalid id", async () => {
    await expect(RestaurantCommands.toggleStatus("bad", { isActive: true }))
      .rejects.toMatchObject({ statusCode: 400, message: /restaurantId/ });
  });
});

describe("RestaurantCommands.toggleStatus", () => {
  it("sets isAcceptingOrders and isActive", async () => {
    col("restaurants").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await RestaurantCommands.toggleStatus(ID.rest1.toString(), {
      isAcceptingOrders: false, isActive: true,
    });

    const update = col("restaurants").updateOne.mock.calls[0][1];
    expect(update.$set.isAcceptingOrders).toBe(false);
    expect(update.$set.isActive).toBe(true);
  });

  it("throws 404 when not found", async () => {
    col("restaurants").updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(RestaurantCommands.toggleStatus(ID.rest1.toString(), { isActive: false }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("RestaurantCommands.delete — validation", () => {
  it("throws 400 on invalid id", async () => {
    await expect(RestaurantCommands.delete("invalid"))
      .rejects.toMatchObject({ statusCode: 400, message: /restaurantId/ });
  });
});

describe("RestaurantCommands.delete", () => {
  it("deletes and returns count", async () => {
    col("restaurants").deleteOne.mockResolvedValue({ deletedCount: 1 });
    const result = await RestaurantCommands.delete(ID.rest1.toString());
    expect(result.deleted).toBe(1);
  });

  it("throws 404 when not found", async () => {
    col("restaurants").deleteOne.mockResolvedValue({ deletedCount: 0 });
    await expect(RestaurantCommands.delete(ID.rest1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
