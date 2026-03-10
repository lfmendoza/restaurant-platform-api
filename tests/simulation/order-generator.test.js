jest.mock("../../src/db");

const { ObjectId } = require("mongodb");
const { getDb } = require("../../src/db");
const OrderGenerator = require("../../src/simulation/OrderGenerator");
const { setupMockDb, createCursor } = require("../helpers/mock-db");

let col;
let generator;
const createdOrders = [];

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
  createdOrders.length = 0;
  generator = new OrderGenerator({
    onOrderCreated: (order) => createdOrders.push(order),
  });
});

afterEach(() => {
  generator.stop();
});

const MOCK_USERS = [
  {
    _id: new ObjectId(),
    defaultAddress: {
      street: "7a Avenida",
      city: "Guatemala",
      zone: "Zona 10",
      coordinates: { type: "Point", coordinates: [-90.51, 14.59] },
    },
  },
];

const REST_ID = new ObjectId();
const MOCK_RESTAURANTS = [
  {
    _id: REST_ID,
    name: "Test Restaurant",
    cuisineTypes: ["italiana"],
    menuItemCount: 5,
    address: { zone: "Zona 10" },
  },
];

const MOCK_MENU_ITEMS = [
  { _id: new ObjectId(), restaurantId: REST_ID, name: "Pizza", price: 89, category: "Platos Principales" },
  { _id: new ObjectId(), restaurantId: REST_ID, name: "Pasta", price: 75, category: "Platos Principales" },
  { _id: new ObjectId(), restaurantId: REST_ID, name: "Coffee", price: 18, category: "Bebidas" },
];

const ZONE_ID = new ObjectId();
const MOCK_ZONES = [
  {
    _id: ZONE_ID,
    restaurantId: REST_ID,
    zoneName: "Zona Centro (3 km)",
    deliveryFee: 15,
    estimatedMinutes: 25,
    isActive: true,
    area: { type: "Polygon", coordinates: [[[-90.53, 14.57], [-90.49, 14.57], [-90.49, 14.61], [-90.53, 14.61], [-90.53, 14.57]]] },
  },
];

function setupSeedMocks() {
  col("users").find.mockReturnValue({
    limit: jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue(MOCK_USERS),
    }),
  });

  col("restaurants").find.mockReturnValue({
    toArray: jest.fn().mockResolvedValue(MOCK_RESTAURANTS),
  });

  col("menu_items").find.mockReturnValue({
    toArray: jest.fn().mockResolvedValue(MOCK_MENU_ITEMS),
  });

  col("delivery_zones").find.mockReturnValue({
    toArray: jest.fn().mockResolvedValue(MOCK_ZONES),
  });

  col("orders").insertOne.mockResolvedValue({ insertedId: new ObjectId() });
  col("orders").insertMany.mockImplementation((docs) => {
    const insertedIds = {};
    docs.forEach((_, i) => { insertedIds[i] = new ObjectId(); });
    return Promise.resolve({ insertedIds, insertedCount: docs.length });
  });
}

describe("OrderGenerator.loadSeedData", () => {
  it("loads users, restaurants, menu items, and zones", async () => {
    setupSeedMocks();

    const data = await generator.loadSeedData();

    expect(data.users).toHaveLength(1);
    expect(data.restaurants).toHaveLength(1);
    expect(data.zoneNames).toContain("Zona Centro (3 km)");
    expect(data.menuByRestaurant[REST_ID.toString()]).toHaveLength(3);
    expect(data.zonesByRestaurant[REST_ID.toString()]).toHaveLength(1);
  });

  it("filters restaurants with no menu items", async () => {
    col("users").find.mockReturnValue({ limit: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(MOCK_USERS) }) });
    col("restaurants").find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([
      ...MOCK_RESTAURANTS,
      { _id: new ObjectId(), name: "Empty", cuisineTypes: [], menuItemCount: 0, address: {} },
    ]) });
    col("menu_items").find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(MOCK_MENU_ITEMS) });
    col("delivery_zones").find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(MOCK_ZONES) });

    const data = await generator.loadSeedData();
    expect(data.restaurants).toHaveLength(1);
  });
});

describe("OrderGenerator.runStratifiedSweep", () => {
  it("creates orders via insertMany during stratified phase", async () => {
    setupSeedMocks();
    await generator.loadSeedData();

    const orders = await generator.runStratifiedSweep();

    expect(orders.length).toBeGreaterThan(0);
    expect(col("orders").insertMany).toHaveBeenCalledTimes(1);
  });

  it("creates order documents with proper schema", async () => {
    setupSeedMocks();
    await generator.loadSeedData();

    await generator.runStratifiedSweep();

    const batchDocs = col("orders").insertMany.mock.calls[0][0];
    const insertedDoc = batchDocs[0];
    expect(insertedDoc).toHaveProperty("orderNumber");
    expect(insertedDoc.orderNumber).toMatch(/^SIM-/);
    expect(insertedDoc).toHaveProperty("userId");
    expect(insertedDoc).toHaveProperty("restaurantId");
    expect(insertedDoc).toHaveProperty("items");
    expect(insertedDoc.items.length).toBeGreaterThan(0);
    expect(insertedDoc).toHaveProperty("status", "pending");
    expect(insertedDoc).toHaveProperty("statusHistory");
    expect(insertedDoc.statusHistory[0].actor).toBe("simulation");
    expect(insertedDoc).toHaveProperty("subtotal");
    expect(insertedDoc).toHaveProperty("tax");
    expect(insertedDoc).toHaveProperty("deliveryFee");
    expect(insertedDoc).toHaveProperty("total");
    expect(insertedDoc).toHaveProperty("paymentMethod");
    expect(["card", "cash", "transfer"]).toContain(insertedDoc.paymentMethod);
    expect(insertedDoc).toHaveProperty("deliveryAddress");
    expect(insertedDoc.deliveryAddress).toHaveProperty("coordinates");
    expect(insertedDoc).toHaveProperty("_simulated", true);
  });

  it("covers all payment methods", async () => {
    const restIds = [];
    const moreRestaurants = [];
    const moreMenu = [];
    const moreZones = [];
    for (let i = 0; i < 5; i++) {
      const rid = new ObjectId();
      restIds.push(rid);
      moreRestaurants.push({ _id: rid, name: `R${i}`, cuisineTypes: ["italiana"], menuItemCount: 3, address: { zone: `Z${i}` } });
      moreMenu.push({ _id: new ObjectId(), restaurantId: rid, name: `Item${i}`, price: 50, category: "Main" });
      moreZones.push({ _id: new ObjectId(), restaurantId: rid, zoneName: `Zone${i}`, deliveryFee: 10, estimatedMinutes: 20, isActive: true, area: {} });
    }

    col("users").find.mockReturnValue({ limit: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(MOCK_USERS) }) });
    col("restaurants").find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(moreRestaurants) });
    col("menu_items").find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(moreMenu) });
    col("delivery_zones").find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(moreZones) });
    col("orders").insertMany.mockImplementation((docs) => {
      const insertedIds = {};
      docs.forEach((_, i) => { insertedIds[i] = new ObjectId(); });
      return Promise.resolve({ insertedIds, insertedCount: docs.length });
    });

    await generator.loadSeedData();
    await generator.runStratifiedSweep();

    const batchDocs = col("orders").insertMany.mock.calls[0][0];
    const payments = new Set(batchDocs.map((d) => d.paymentMethod));
    expect(payments).toEqual(new Set(["card", "cash", "transfer"]));
  });
});

describe("OrderGenerator.pause / resume / stop", () => {
  it("pauses without errors", () => {
    generator.pause();
    expect(generator.paused).toBe(true);
  });

  it("stop prevents further generation", () => {
    generator.stop();
    expect(generator._stopped).toBe(true);
    expect(generator.paused).toBe(true);
  });

  it("resume restarts process", async () => {
    setupSeedMocks();
    await generator.loadSeedData();

    generator.pause();
    expect(generator.paused).toBe(true);

    generator.resume({ baseRate: 10, peakMultiplier: 1 });
    expect(generator.paused).toBe(false);

    generator.stop();
  });
});

describe("Order item structure", () => {
  it("items have required fields", async () => {
    setupSeedMocks();
    await generator.loadSeedData();
    await generator.runStratifiedSweep();

    const batchDocs = col("orders").insertMany.mock.calls[0][0];
    const item = batchDocs[0].items[0];
    expect(item).toHaveProperty("menuItemId");
    expect(item).toHaveProperty("name");
    expect(item).toHaveProperty("quantity");
    expect(item.quantity).toBeGreaterThanOrEqual(1);
    expect(item).toHaveProperty("unitPrice");
    expect(item.unitPrice).toBeGreaterThan(0);
    expect(item).toHaveProperty("subtotal");
    expect(item.subtotal).toBe(item.unitPrice * item.quantity);
  });
});
