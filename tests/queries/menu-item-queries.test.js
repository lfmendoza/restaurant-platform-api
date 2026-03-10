jest.mock("../../src/db");

const { getDb, getReadDb } = require("../../src/db");
const MenuItemQueries = require("../../src/queries/MenuItemQueries");
const { setupMockDb, createCursor } = require("../helpers/mock-db");
const { ID, MENU_ITEMS } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, null, getReadDb));
});

describe("MenuItemQueries.list", () => {
  it("applies all filters correctly", async () => {
    col("menu_items").find.mockReturnValue(createCursor([MENU_ITEMS.pizza]));

    await MenuItemQueries.list({
      restaurantId: ID.rest1.toString(),
      category: "Platos Principales",
      available: "true",
      allergen: "gluten",
      price_lte: "100",
      q: "pizza",
    });

    const filter = col("menu_items").find.mock.calls[0][0];
    expect(filter.restaurantId).toEqual(ID.rest1);
    expect(filter.category).toBe("Platos Principales");
    expect(filter.available).toBe(true);
    expect(filter.allergens).toBe("gluten");
    expect(filter.price.$lte).toBe(100);
    expect(filter.$text.$search).toBe("pizza");
  });

  it("sorts by price when requested", async () => {
    col("menu_items").find.mockReturnValue(createCursor([]));

    await MenuItemQueries.list({ sort: "price" });

    const sortCall = col("menu_items").find().sort.mock.calls[0][0];
    expect(sortCall).toEqual({ price: 1 });
  });

  it("defaults to sorting by salesCount", async () => {
    col("menu_items").find.mockReturnValue(createCursor([]));

    await MenuItemQueries.list({});

    const sortCall = col("menu_items").find().sort.mock.calls[0][0];
    expect(sortCall).toEqual({ salesCount: -1 });
  });
});

describe("MenuItemQueries.getById", () => {
  it("returns item when found", async () => {
    col("menu_items").findOne.mockResolvedValue(MENU_ITEMS.pizza);
    const item = await MenuItemQueries.getById(ID.item1.toString());
    expect(item.name).toBe("Pizza Margherita");
  });

  it("throws 404 when not found", async () => {
    col("menu_items").findOne.mockResolvedValue(null);
    await expect(MenuItemQueries.getById(ID.item1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
