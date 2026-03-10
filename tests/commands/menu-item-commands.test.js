jest.mock("../../src/db");

const { getDb } = require("../../src/db");
const MenuItemCommands = require("../../src/commands/MenuItemCommands");
const { setupMockDb } = require("../helpers/mock-db");
const { ID } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("MenuItemCommands.create — validation", () => {
  it("throws 400 when restaurantId missing", async () => {
    await expect(MenuItemCommands.create({ name: "X", price: 10, category: "Y" }))
      .rejects.toMatchObject({ statusCode: 400, message: /restaurantId/ });
  });

  it("throws 400 when name missing", async () => {
    await expect(MenuItemCommands.create({ restaurantId: ID.rest1.toString(), price: 10, category: "Y" }))
      .rejects.toMatchObject({ statusCode: 400, message: /name/ });
  });

  it("throws 400 when price missing", async () => {
    await expect(MenuItemCommands.create({ restaurantId: ID.rest1.toString(), name: "X", category: "Y" }))
      .rejects.toMatchObject({ statusCode: 400, message: /price/ });
  });

  it("throws 400 when category missing", async () => {
    await expect(MenuItemCommands.create({ restaurantId: ID.rest1.toString(), name: "X", price: 10 }))
      .rejects.toMatchObject({ statusCode: 400, message: /category/ });
  });

  it("throws 400 when price is negative", async () => {
    await expect(MenuItemCommands.create({
      restaurantId: ID.rest1.toString(), name: "X", price: -5, category: "Y",
    })).rejects.toMatchObject({ statusCode: 400, message: /price.*positive/i });
  });

  it("throws 400 on invalid restaurantId format", async () => {
    await expect(MenuItemCommands.create({
      restaurantId: "bad", name: "X", price: 10, category: "Y",
    })).rejects.toMatchObject({ statusCode: 400, message: /restaurantId/ });
  });
});

describe("MenuItemCommands.create", () => {
  it("inserts item with defaults", async () => {
    col("menu_items").insertOne.mockResolvedValue({ insertedId: ID.item1 });

    const item = await MenuItemCommands.create({
      restaurantId: ID.rest1.toString(), name: "Tacos", price: "45", category: "Platos",
    });

    expect(item._id).toEqual(ID.item1);
    expect(item.price).toBe(45);
    expect(item.available).toBe(true);
    expect(item.salesCount).toBe(0);
    expect(item.allergens).toEqual([]);
  });
});

describe("MenuItemCommands.createMany — validation", () => {
  it("throws 400 when restaurantId missing", async () => {
    await expect(MenuItemCommands.createMany(null, [{ name: "A", price: 10, category: "X" }]))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when an item is missing required fields", async () => {
    await expect(MenuItemCommands.createMany(ID.rest1.toString(), [{ name: "A" }]))
      .rejects.toMatchObject({ statusCode: 400, message: /price/ });
  });
});

describe("MenuItemCommands.createMany", () => {
  it("inserts array of items with enriched defaults", async () => {
    col("menu_items").insertMany.mockResolvedValue({ insertedCount: 2 });

    const result = await MenuItemCommands.createMany(ID.rest1.toString(), [
      { name: "A", price: 10, category: "X" },
      { name: "B", price: 20, category: "Y" },
    ]);

    expect(result.insertedCount).toBe(2);
    const docs = col("menu_items").insertMany.mock.calls[0][0];
    docs.forEach((d) => {
      expect(d.available).toBe(true);
      expect(d.salesCount).toBe(0);
      expect(d.restaurantId).toEqual(ID.rest1);
    });
  });

  it("throws 400 on empty items", async () => {
    await expect(MenuItemCommands.createMany(ID.rest1.toString(), []))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("MenuItemCommands.bulkWrite — validation", () => {
  it("throws 400 on empty operations", async () => {
    await expect(MenuItemCommands.bulkWrite([]))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 on unsupported operation type", async () => {
    await expect(MenuItemCommands.bulkWrite([{ replaceOne: {} }]))
      .rejects.toMatchObject({ statusCode: 400, message: /unsupported/i });
  });

  it("throws 400 when insertOne document lacks required fields", async () => {
    await expect(MenuItemCommands.bulkWrite([
      { insertOne: { document: { restaurantId: ID.rest1.toString(), name: "X" } } },
    ])).rejects.toMatchObject({ statusCode: 400, message: /price/ });
  });
});

describe("MenuItemCommands.bulkWrite", () => {
  it("processes mixed operations with ordered:false", async () => {
    col("menu_items").bulkWrite.mockResolvedValue({
      insertedCount: 1, modifiedCount: 1, deletedCount: 1, upsertedCount: 0,
    });

    const result = await MenuItemCommands.bulkWrite([
      { insertOne: { document: { restaurantId: ID.rest1.toString(), name: "New", price: 25, category: "Snack" } } },
      { updateOne: { filter: { _id: ID.item1.toString() }, update: { $set: { price: 100 } } } },
      { deleteOne: { filter: { _id: ID.item2.toString() } } },
    ]);

    expect(result.insertedCount).toBe(1);
    expect(result.modifiedCount).toBe(1);
    expect(result.deletedCount).toBe(1);
    const bulkCall = col("menu_items").bulkWrite.mock.calls[0];
    expect(bulkCall[1]).toEqual({ ordered: false });
  });
});

describe("MenuItemCommands.update — validation", () => {
  it("throws 400 on invalid id", async () => {
    await expect(MenuItemCommands.update("bad", { name: "X" }))
      .rejects.toMatchObject({ statusCode: 400, message: /itemId/ });
  });

  it("throws 400 when no fields provided", async () => {
    await expect(MenuItemCommands.update(ID.item1.toString(), {}))
      .rejects.toMatchObject({ statusCode: 400, message: /at least one field/i });
  });

  it("throws 400 when price is not a positive number", async () => {
    await expect(MenuItemCommands.update(ID.item1.toString(), { price: -10 }))
      .rejects.toMatchObject({ statusCode: 400, message: /price.*positive/i });
  });
});

describe("MenuItemCommands.update", () => {
  it("updates specified fields", async () => {
    col("menu_items").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await MenuItemCommands.update(ID.item1.toString(), { name: "New Name", price: 99 });

    expect(result.updated).toBe(1);
    const update = col("menu_items").updateOne.mock.calls[0][1];
    expect(update.$set.name).toBe("New Name");
    expect(update.$set.price).toBe(99);
  });

  it("throws 404 when not found", async () => {
    col("menu_items").updateOne.mockResolvedValue({ matchedCount: 0 });
    await expect(MenuItemCommands.update(ID.item1.toString(), { name: "X" }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("MenuItemCommands.toggleAvailability — validation", () => {
  it("throws 400 on invalid id", async () => {
    await expect(MenuItemCommands.toggleAvailability("bad", false))
      .rejects.toMatchObject({ statusCode: 400, message: /itemId/ });
  });

  it("throws 400 when available flag is missing", async () => {
    await expect(MenuItemCommands.toggleAvailability(ID.item1.toString(), undefined))
      .rejects.toMatchObject({ statusCode: 400, message: /available.*required/i });
  });
});

describe("MenuItemCommands.toggleAvailability", () => {
  it("updates item and cascades to carts via arrayFilters", async () => {
    col("menu_items").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    col("carts").updateMany.mockResolvedValue({ modifiedCount: 3 });

    const result = await MenuItemCommands.toggleAvailability(ID.item1.toString(), false);

    expect(result.itemUpdated).toBe(1);
    expect(result.affectedCarts).toBe(3);

    const cartUpdate = col("carts").updateMany.mock.calls[0];
    expect(cartUpdate[2].arrayFilters).toBeDefined();
    expect(cartUpdate[1].$set.hasUnavailableItems).toBe(true);
  });

  it("throws 404 when item not found", async () => {
    col("menu_items").updateOne.mockResolvedValue({ matchedCount: 0 });
    await expect(MenuItemCommands.toggleAvailability(ID.item1.toString(), false))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("MenuItemCommands.updateCategoryPrice — validation", () => {
  it("throws 400 when restaurantId missing", async () => {
    await expect(MenuItemCommands.updateCategoryPrice(null, { multiplier: 1.1 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when multiplier is not a positive number", async () => {
    await expect(MenuItemCommands.updateCategoryPrice(ID.rest1.toString(), { multiplier: -1 }))
      .rejects.toMatchObject({ statusCode: 400, message: /multiplier.*positive/i });
  });
});

describe("MenuItemCommands.updateCategoryPrice", () => {
  it("uses $mul with multiplier", async () => {
    col("menu_items").updateMany.mockResolvedValue({ modifiedCount: 5 });

    const result = await MenuItemCommands.updateCategoryPrice(ID.rest1.toString(), {
      category: "Bebidas", multiplier: "1.15",
    });

    expect(result.updated).toBe(5);
    const update = col("menu_items").updateMany.mock.calls[0][1];
    expect(update.$mul.price).toBe(1.15);
  });
});

describe("MenuItemCommands.delete — validation", () => {
  it("throws 400 on invalid id", async () => {
    await expect(MenuItemCommands.delete("bad"))
      .rejects.toMatchObject({ statusCode: 400, message: /itemId/ });
  });
});

describe("MenuItemCommands.delete", () => {
  it("deletes item", async () => {
    col("menu_items").deleteOne.mockResolvedValue({ deletedCount: 1 });
    const result = await MenuItemCommands.delete(ID.item1.toString());
    expect(result.deleted).toBe(1);
  });

  it("throws 404 when not found", async () => {
    col("menu_items").deleteOne.mockResolvedValue({ deletedCount: 0 });
    await expect(MenuItemCommands.delete(ID.item1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("MenuItemCommands.deleteMany", () => {
  it("deletes by restaurantId + category", async () => {
    col("menu_items").deleteMany.mockResolvedValue({ deletedCount: 10 });

    const result = await MenuItemCommands.deleteMany({
      restaurantId: ID.rest1.toString(), category: "Bebidas",
    });

    expect(result.deleted).toBe(10);
    const filter = col("menu_items").deleteMany.mock.calls[0][0];
    expect(filter.restaurantId).toEqual(ID.rest1);
    expect(filter.category).toBe("Bebidas");
  });

  it("throws 400 when restaurantId missing", async () => {
    await expect(MenuItemCommands.deleteMany({}))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
