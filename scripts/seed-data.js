// seed-data.js
// Idempotent seed: 200 users, 500 restaurants, 50,000+ menu items,
// 1,000 orders (various statuses), 500+ reviews, 50 carts.
// Ejecutar: mongosh "mongodb+srv://..." scripts/seed-data.js

const db = db.getSiblingDB("restaurant_orders");

// HELPERS

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function daysAgo(n) { return new Date(Date.now() - n * 86400000); }
function hoursAgo(n) { return new Date(Date.now() - n * 3600000); }
function roundTwo(n) { return Math.round(n * 100) / 100; }
function round5(n) { return Math.round(n * 100000) / 100000; }

// CLEANUP

print("\n=== CLEANUP ===");
["users", "restaurants", "menu_items", "orders", "reviews",
 "carts", "delivery_zones", "restaurant_stats", "daily_revenue"].forEach(function(c) {
  const count = db.getCollection(c).countDocuments();
  if (count > 0) {
    db.getCollection(c).deleteMany({});
    print("  Cleared " + c + " (" + count + " docs)");
  }
});
try {
  db.order_events.drop();
  db.createCollection("order_events", {
    timeseries: { timeField: "timestamp", metaField: "metadata", granularity: "minutes" },
    expireAfterSeconds: 7776000
  });
  print("  Recreated order_events (time series)");
} catch(e) {
  try { db.order_events.deleteMany({}); } catch(e2) {}
  print("  order_events: " + e.message);
}

// REFERENCE DATA

const DISHES_BY_CATEGORY = {
  "Entradas": [
    { name: "Nachos con Queso",       price: 45,  allergens: ["gluten", "lácteos"],            tags: ["compartir"] },
    { name: "Guacamole Fresco",       price: 35,  allergens: [],                               tags: ["vegano"] },
    { name: "Empanadas de Carne",     price: 42,  allergens: ["gluten"],                       tags: [] },
    { name: "Ceviche de Camarón",     price: 65,  allergens: ["mariscos"],                     tags: ["fresco"] },
    { name: "Bruschetta Clásica",     price: 38,  allergens: ["gluten"],                       tags: ["vegetariano"] },
    { name: "Alitas BBQ",            price: 55,  allergens: [],                               tags: ["picante"] },
    { name: "Tostadas de Tinga",      price: 40,  allergens: ["gluten"],                       tags: [] },
    { name: "Quesadilla de Queso",    price: 32,  allergens: ["gluten", "lácteos"],            tags: ["vegetariano"] },
    { name: "Croquetas de Jamón",     price: 48,  allergens: ["gluten", "lácteos"],            tags: [] },
    { name: "Hummus con Pita",        price: 36,  allergens: ["gluten"],                       tags: ["vegetariano"] },
  ],
  "Platos Principales": [
    { name: "Hamburguesa Clásica",    price: 75,  allergens: ["gluten", "lácteos"],            tags: [] },
    { name: "Pizza Margherita",       price: 89,  allergens: ["gluten", "lácteos"],            tags: ["vegetariano"] },
    { name: "Pasta Carbonara",        price: 85,  allergens: ["gluten", "lácteos", "huevo"],   tags: [] },
    { name: "Pollo a la Parrilla",    price: 78,  allergens: [],                               tags: [] },
    { name: "Tacos al Pastor",        price: 55,  allergens: ["gluten"],                       tags: ["picante"] },
    { name: "Sushi Roll Especial",    price: 95,  allergens: ["mariscos", "soya"],             tags: [] },
    { name: "Pad Thai",              price: 72,  allergens: ["maní", "soya"],                 tags: [] },
    { name: "Burrito Supreme",        price: 65,  allergens: ["gluten", "lácteos"],            tags: [] },
    { name: "Risotto de Hongos",      price: 88,  allergens: ["lácteos"],                      tags: ["vegetariano"] },
    { name: "Fish and Chips",         price: 82,  allergens: ["gluten", "mariscos"],           tags: [] },
    { name: "Chow Mein de Res",       price: 68,  allergens: ["soya", "gluten"],               tags: [] },
    { name: "Curry Rojo Thai",        price: 76,  allergens: ["maní"],                         tags: ["picante"] },
    { name: "Falafel Wrap",           price: 58,  allergens: ["gluten"],                       tags: ["vegetariano"] },
    { name: "Lomo Saltado",           price: 92,  allergens: ["soya"],                         tags: [] },
    { name: "Enchiladas Verdes",      price: 62,  allergens: ["gluten", "lácteos"],            tags: ["picante"] },
  ],
  "Ensaladas": [
    { name: "Ensalada César",         price: 52,  allergens: ["gluten", "lácteos", "huevo"],   tags: [] },
    { name: "Ensalada Griega",        price: 48,  allergens: ["lácteos"],                      tags: ["vegetariano"] },
    { name: "Ensalada de Quinoa",     price: 55,  allergens: [],                               tags: ["vegano"] },
    { name: "Ensalada Caprese",       price: 50,  allergens: ["lácteos"],                      tags: ["vegetariano"] },
    { name: "Ensalada Waldorf",       price: 54,  allergens: ["lácteos"],                      tags: ["vegetariano"] },
  ],
  "Sopas": [
    { name: "Sopa de Tomate",         price: 38,  allergens: ["lácteos"],                      tags: ["vegetariano"] },
    { name: "Crema de Hongos",        price: 42,  allergens: ["lácteos"],                      tags: ["vegetariano"] },
    { name: "Sopa de Tortilla",       price: 40,  allergens: ["gluten", "lácteos"],            tags: ["picante"] },
    { name: "Caldo de Pollo",         price: 45,  allergens: [],                               tags: [] },
    { name: "Sopa Miso",             price: 35,  allergens: ["soya"],                         tags: ["vegetariano"] },
  ],
  "Postres": [
    { name: "Tiramisú",              price: 48,  allergens: ["gluten", "lácteos", "huevo"],   tags: [] },
    { name: "Brownie con Helado",     price: 42,  allergens: ["gluten", "lácteos", "huevo"],   tags: [] },
    { name: "Flan Napolitano",        price: 35,  allergens: ["lácteos", "huevo"],             tags: [] },
    { name: "Helado Artesanal",       price: 30,  allergens: ["lácteos"],                      tags: ["vegetariano"] },
    { name: "Churros con Chocolate",  price: 38,  allergens: ["gluten", "lácteos"],            tags: [] },
    { name: "Pastel de Chocolate",    price: 45,  allergens: ["gluten", "lácteos", "huevo"],   tags: [] },
    { name: "Crème Brûlée",          price: 50,  allergens: ["lácteos", "huevo"],             tags: [] },
    { name: "Cheesecake",            price: 48,  allergens: ["gluten", "lácteos"],            tags: [] },
  ],
  "Bebidas": [
    { name: "Café Americano",         price: 18,  allergens: [],                               tags: [] },
    { name: "Té Verde",              price: 15,  allergens: [],                               tags: ["vegano"] },
    { name: "Limonada Natural",       price: 20,  allergens: [],                               tags: ["vegano"] },
    { name: "Agua Mineral",           price: 12,  allergens: [],                               tags: ["vegano"] },
    { name: "Jugo de Naranja",        price: 22,  allergens: [],                               tags: ["vegano"] },
    { name: "Smoothie de Frutas",     price: 35,  allergens: ["lácteos"],                      tags: [] },
    { name: "Coca-Cola",             price: 15,  allergens: [],                               tags: [] },
    { name: "Cerveza Artesanal",      price: 35,  allergens: ["gluten"],                       tags: [] },
  ],
};

// Flatten into ordered array preserving category
const ALL_DISHES = [];
Object.keys(DISHES_BY_CATEGORY).forEach(function(cat) {
  DISHES_BY_CATEGORY[cat].forEach(function(d) {
    ALL_DISHES.push({ name: d.name, price: d.price, allergens: d.allergens, tags: d.tags, category: cat });
  });
});
// ALL_DISHES.length = 51

const CUISINES = ["italiana", "mexicana", "japonesa", "china", "americana", "francesa", "guatemalteca", "peruana", "tailandesa", "india"];
const CUISINE_PREFIXES = {
  "italiana":      ["Bella Italia", "Trattoria Roma", "Il Forno", "La Dolce Vita", "Pasta e Basta"],
  "mexicana":      ["El Ranchero", "Taquería Don Juan", "La Cantina", "El Molcajete", "Casa Azteca"],
  "japonesa":      ["Sakura", "Tokyo House", "Zen Sushi", "Kabuki", "Hanami"],
  "china":         ["Dragón Dorado", "Gran Muralla", "Bambú Rojo", "Jade Palace", "Wok Express"],
  "americana":     ["Liberty Grill", "The Burger Joint", "Star Diner", "Route 66", "Golden Eagle"],
  "francesa":      ["Le Petit Bistro", "Chez Marcel", "La Belle Époque", "Croissant Doré", "Maison Blanche"],
  "guatemalteca":  ["Los Cebollines", "Kakik", "Hacienda Real", "Antigua Kitchen", "Chirmol"],
  "peruana":       ["Cevichería Lima", "Machu Picchu", "Inca Grill", "Pisco Sour", "Nazca"],
  "tailandesa":    ["Thai Garden", "Bangkok Street", "Pad Thai House", "Lotus Room", "Siam Kitchen"],
  "india":         ["Taj Mahal", "Curry Palace", "Spice Route", "Namaste", "Bollywood Kitchen"],
};
const REVIEW_TAGS = ["recomendado", "buen-servicio", "rápido", "delicioso", "buena-porción", "ambiente-agradable", "pet-friendly", "económico", "fecha-especial", "familiar"];
const PAYMENT_METHODS = ["card", "cash", "transfer"];

function makeRect(center, dlng, dlat) {
  var lng = center[0], lat = center[1];
  return [[lng - dlng, lat - dlat], [lng + dlng, lat - dlat], [lng + dlng, lat + dlat], [lng - dlng, lat + dlat], [lng - dlng, lat - dlat]];
}

const GUATEMALA_ZONES = [
  {
    name: "Zona 1 - Centro Histórico",
    center: [-90.5133, 14.6437],
    address: { street: "6a Avenida y 9a Calle", city: "Guatemala", zone: "Zona 1" },
    closePolygon: makeRect([-90.5133, 14.6437], 0.012, 0.009),
    extendedPolygon: makeRect([-90.5133, 14.6437], 0.027, 0.022),
    closeFee: 12, closeMinutes: 20, farFee: 25, farMinutes: 40
  },
  {
    name: "Zona 4 - Cuatro Grados Norte",
    center: [-90.5252, 14.6290],
    address: { street: "Ruta 2, Cuatro Grados Norte", city: "Guatemala", zone: "Zona 4" },
    closePolygon: makeRect([-90.5252, 14.6290], 0.012, 0.009),
    extendedPolygon: makeRect([-90.5252, 14.6290], 0.027, 0.022),
    closeFee: 10, closeMinutes: 18, farFee: 22, farMinutes: 35
  },
  {
    name: "Zona 7 - Calzada San Juan",
    center: [-90.5530, 14.6430],
    address: { street: "Calzada San Juan 7-00", city: "Guatemala", zone: "Zona 7" },
    closePolygon: makeRect([-90.5530, 14.6430], 0.012, 0.009),
    extendedPolygon: makeRect([-90.5530, 14.6430], 0.027, 0.022),
    closeFee: 14, closeMinutes: 22, farFee: 28, farMinutes: 42
  },
  {
    name: "Zona 9 - Plazuela España",
    center: [-90.5190, 14.6110],
    address: { street: "7a Avenida y Ruta 4", city: "Guatemala", zone: "Zona 9" },
    closePolygon: makeRect([-90.5190, 14.6110], 0.012, 0.009),
    extendedPolygon: makeRect([-90.5190, 14.6110], 0.027, 0.022),
    closeFee: 10, closeMinutes: 15, farFee: 20, farMinutes: 30
  },
  {
    name: "Zona 10 - Zona Viva",
    center: [-90.5065, 14.6070],
    address: { street: "13 Calle y 2a Avenida", city: "Guatemala", zone: "Zona 10" },
    closePolygon: makeRect([-90.5065, 14.6070], 0.012, 0.009),
    extendedPolygon: makeRect([-90.5065, 14.6070], 0.027, 0.022),
    closeFee: 10, closeMinutes: 15, farFee: 20, farMinutes: 30
  },
  {
    name: "Zona 11 - Miraflores",
    center: [-90.5470, 14.6060],
    address: { street: "Calzada Roosevelt 22-43", city: "Guatemala", zone: "Zona 11" },
    closePolygon: makeRect([-90.5470, 14.6060], 0.012, 0.009),
    extendedPolygon: makeRect([-90.5470, 14.6060], 0.027, 0.022),
    closeFee: 12, closeMinutes: 20, farFee: 25, farMinutes: 38
  },
  {
    name: "Zona 13 - Aurora",
    center: [-90.5280, 14.5870],
    address: { street: "Avenida La Castellana", city: "Guatemala", zone: "Zona 13" },
    closePolygon: makeRect([-90.5280, 14.5870], 0.012, 0.009),
    extendedPolygon: makeRect([-90.5280, 14.5870], 0.027, 0.022),
    closeFee: 13, closeMinutes: 22, farFee: 26, farMinutes: 40
  },
  {
    name: "Zona 14 - Las Américas",
    center: [-90.4970, 14.5930],
    address: { street: "Boulevard Los Próceres", city: "Guatemala", zone: "Zona 14" },
    closePolygon: makeRect([-90.4970, 14.5930], 0.012, 0.009),
    extendedPolygon: makeRect([-90.4970, 14.5930], 0.027, 0.022),
    closeFee: 11, closeMinutes: 18, farFee: 23, farMinutes: 35
  },
  {
    name: "Zona 15 - Vista Hermosa",
    center: [-90.4850, 14.5990],
    address: { street: "16 Calle Vista Hermosa", city: "Guatemala", zone: "Zona 15" },
    closePolygon: makeRect([-90.4850, 14.5990], 0.012, 0.009),
    extendedPolygon: makeRect([-90.4850, 14.5990], 0.027, 0.022),
    closeFee: 15, closeMinutes: 25, farFee: 30, farMinutes: 45
  },
  {
    name: "Zona 16 - Cayalá",
    center: [-90.4720, 14.5950],
    address: { street: "Boulevard Rafael Landívar", city: "Guatemala", zone: "Zona 16" },
    closePolygon: makeRect([-90.4720, 14.5950], 0.012, 0.009),
    extendedPolygon: makeRect([-90.4720, 14.5950], 0.027, 0.022),
    closeFee: 16, closeMinutes: 25, farFee: 32, farMinutes: 45
  },
  {
    name: "Mixco Centro",
    center: [-90.5850, 14.6340],
    address: { street: "Calzada San Cristóbal", city: "Mixco", zone: "Mixco" },
    closePolygon: makeRect([-90.5850, 14.6340], 0.012, 0.009),
    extendedPolygon: makeRect([-90.5850, 14.6340], 0.027, 0.022),
    closeFee: 18, closeMinutes: 28, farFee: 35, farMinutes: 50
  },
  {
    name: "Carretera a El Salvador",
    center: [-90.4600, 14.5850],
    address: { street: "Km 16.5 Carretera a El Salvador", city: "Guatemala", zone: "Carretera a El Salvador" },
    closePolygon: makeRect([-90.4600, 14.5850], 0.012, 0.009),
    extendedPolygon: makeRect([-90.4600, 14.5850], 0.027, 0.022),
    closeFee: 17, closeMinutes: 30, farFee: 35, farMinutes: 50
  }
];

const NUM_RESTAURANTS = 500;
const ITEMS_PER_RESTAURANT = 100;
const NUM_USERS = 200;
const NUM_ORDERS = 1000;
const NUM_REVIEWS = 500;
const NUM_CARTS = 50;

// SEED USERS

print("\n=== SEEDING USERS ===");
const userOps = [];
for (let i = 0; i < NUM_USERS; i++) {
  const role = i < 10 ? "restaurant_admin" : "customer";
  userOps.push({ insertOne: { document: {
    email: "user" + i + "@example.com",
    name: "Usuario " + i,
    phone: "+502 " + (5000 + i),
    role: role,
    defaultAddress: {
      street: (i + 1) + "a Avenida " + i + "-" + (i * 2),
      city: "Guatemala",
      zone: "Zona " + ((i % 15) + 1),
      coordinates: { type: "Point", coordinates: [round5(-90.55 + Math.random() * 0.1), round5(14.55 + Math.random() * 0.1)] }
    },
    orderHistory: [],
    favoriteRestaurants: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }}});
}
db.users.bulkWrite(userOps, { ordered: false });
const userIds = db.users.find({}, { _id: 1 }).toArray().map(function(u) { return u._id; });
print("  Users inserted: " + db.users.countDocuments());

// SEED RESTAURANTS

print("\n=== SEEDING RESTAURANTS ===");
var GRID_COLS = 7;
var GRID_SPACING = 0.003;
var restOps = [];
var zoneCounters = {};
for (var i = 0; i < NUM_RESTAURANTS; i++) {
  var cuisine1 = CUISINES[i % CUISINES.length];
  var cuisine2 = CUISINES[(i + 3) % CUISINES.length];
  var prefixes = CUISINE_PREFIXES[cuisine1];
  var name = prefixes[i % prefixes.length] + " #" + (Math.floor(i / CUISINES.length) + 1);
  var zoneIdx = i % GUATEMALA_ZONES.length;
  var zone = GUATEMALA_ZONES[zoneIdx];

  if (!zoneCounters[zoneIdx]) zoneCounters[zoneIdx] = 0;
  var localIdx = zoneCounters[zoneIdx]++;
  var col = localIdx % GRID_COLS;
  var row = Math.floor(localIdx / GRID_COLS);
  var totalRows = Math.ceil(Math.ceil(NUM_RESTAURANTS / GUATEMALA_ZONES.length) / GRID_COLS);
  var lng = round5(zone.center[0] + (col - (GRID_COLS - 1) / 2) * GRID_SPACING);
  var lat = round5(zone.center[1] + (row - (totalRows - 1) / 2) * GRID_SPACING * 0.75);

  restOps.push({ insertOne: { document: {
    name: name,
    description: "Restaurante de cocina " + cuisine1 + " y " + cuisine2,
    location: { type: "Point", coordinates: [lng, lat] },
    address: { street: zone.address.street + " Local " + (i + 1), city: zone.address.city, zone: zone.address.zone },
    operatingHours: {
      monday:    { open: "10:00", close: "22:00" },
      tuesday:   { open: "10:00", close: "22:00" },
      wednesday: { open: "10:00", close: "22:00" },
      thursday:  { open: "10:00", close: "22:00" },
      friday:    { open: "10:00", close: "23:00" },
      saturday:  { open: "11:00", close: "23:00" },
      sunday:    { open: "11:00", close: "21:00" }
    },
    cuisineTypes: [cuisine1, cuisine2],
    tags: i % 3 === 0 ? ["pet-friendly", "wifi"] : i % 3 === 1 ? ["terraza"] : ["estacionamiento"],
    isActive: true,
    isAcceptingOrders: true,
    logoFileId: null,
    menuItemCount: NumberInt(ITEMS_PER_RESTAURANT),
    createdAt: new Date(),
    updatedAt: new Date()
  }}});
}
db.restaurants.bulkWrite(restOps, { ordered: false });
const restaurantIds = db.restaurants.find({}, { _id: 1 }).toArray().map(function(r) { return r._id; });
print("  Restaurants inserted: " + db.restaurants.countDocuments());

// SEED DELIVERY ZONES

print("\n=== SEEDING DELIVERY ZONES ===");
const zoneOps = [];
for (let ri = 0; ri < restaurantIds.length; ri++) {
  const rid = restaurantIds[ri];
  const zoneIdx = ri % GUATEMALA_ZONES.length;
  const zone = GUATEMALA_ZONES[zoneIdx];

  zoneOps.push({ insertOne: { document: {
    restaurantId: rid,
    zoneName: zone.name + " (cercana)",
    area: { type: "Polygon", coordinates: [zone.closePolygon] },
    deliveryFee: zone.closeFee,
    estimatedMinutes: NumberInt(zone.closeMinutes),
    isActive: true
  }}});

  zoneOps.push({ insertOne: { document: {
    restaurantId: rid,
    zoneName: zone.name + " (extendida)",
    area: { type: "Polygon", coordinates: [zone.extendedPolygon] },
    deliveryFee: zone.farFee,
    estimatedMinutes: NumberInt(zone.farMinutes),
    isActive: true
  }}});
}
db.delivery_zones.bulkWrite(zoneOps, { ordered: false });
print("  Delivery zones inserted: " + db.delivery_zones.countDocuments());

// SEED MENU ITEMS

print("\n=== SEEDING MENU ITEMS ===");
const BATCH_SIZE = 5000;
let totalMenuInserted = 0;
const allDishCount = ALL_DISHES.length; // 51

for (let batch = 0; batch < Math.ceil(restaurantIds.length / (BATCH_SIZE / ITEMS_PER_RESTAURANT)); batch++) {
  const itemOps = [];
  const startIdx = batch * (BATCH_SIZE / ITEMS_PER_RESTAURANT);
  const endIdx = Math.min(startIdx + (BATCH_SIZE / ITEMS_PER_RESTAURANT), restaurantIds.length);

  for (let r = startIdx; r < endIdx; r++) {
    const rid = restaurantIds[r];
    for (let i = 0; i < ITEMS_PER_RESTAURANT; i++) {
      const base = ALL_DISHES[i % allDishCount];
      const variantNum = Math.floor(i / allDishCount);
      const itemName = variantNum === 0 ? base.name : base.name + " v" + variantNum;
      const priceVariation = roundTwo(base.price + (Math.random() * 20 - 10));
      const finalPrice = Math.max(priceVariation, 10);

      itemOps.push({ insertOne: { document: {
        restaurantId: rid,
        name: itemName,
        description: "Delicioso " + base.name.toLowerCase() + " preparado con ingredientes frescos",
        price: finalPrice,
        category: base.category,
        allergens: base.allergens,
        tags: base.tags,
        available: Math.random() > 0.05,
        preparationTimeMin: NumberInt(randBetween(5, 35)),
        imageFileId: null,
        salesCount: NumberInt(Math.floor(Math.random() * 100)),
        createdAt: new Date(),
        updatedAt: new Date()
      }}});
    }
  }

  if (itemOps.length > 0) {
    const result = db.menu_items.bulkWrite(itemOps, { ordered: false });
    totalMenuInserted += result.insertedCount;
    print("  Batch " + (batch + 1) + ": inserted " + result.insertedCount + " items");
  }
}
print("  Total menu_items: " + db.menu_items.countDocuments());

// Fetch some menu items for order creation
const menuItemsSample = db.menu_items.find({ available: true }, { _id: 1, restaurantId: 1, name: 1, price: 1 }).limit(5000).toArray();

// SEED ORDERS

print("\n=== SEEDING ORDERS ===");
const STATUS_FLOW = ["pending", "confirmed", "preparing", "ready_for_pickup", "picked_up", "delivered"];
const orderDocs = [];

for (let i = 0; i < NUM_ORDERS; i++) {
  const userId = pick(userIds);
  const rid = restaurantIds[i % restaurantIds.length];
  const createdAt = daysAgo(randBetween(1, 90));
  const now = new Date(createdAt.getTime());

  // Pick target status with weighted distribution
  let targetStatus;
  const roll = Math.random();
  if (roll < 0.50)      targetStatus = "delivered";
  else if (roll < 0.65) targetStatus = "cancelled";
  else if (roll < 0.75) targetStatus = "pending";
  else if (roll < 0.85) targetStatus = "confirmed";
  else if (roll < 0.92) targetStatus = "preparing";
  else if (roll < 0.96) targetStatus = "ready_for_pickup";
  else                   targetStatus = "picked_up";

  // Build statusHistory up to targetStatus
  const statusHistory = [];
  const isCancelled = targetStatus === "cancelled";
  const cancelAt = isCancelled ? randBetween(0, 2) : -1; // cancel after step 0,1,2

  let currentTime = new Date(createdAt.getTime());
  for (let si = 0; si < STATUS_FLOW.length; si++) {
    const st = STATUS_FLOW[si];
    const durSec = si === 0 ? 0 : randBetween(30, 600);
    currentTime = new Date(currentTime.getTime() + durSec * 1000);
    statusHistory.push({
      status: st,
      timestamp: new Date(currentTime.getTime()),
      actor: si === 0 ? "system" : si < 3 ? "restaurant" : "delivery",
      durationFromPrevSec: durSec
    });
    if (st === targetStatus) break;
    if (isCancelled && si === cancelAt) {
      currentTime = new Date(currentTime.getTime() + randBetween(30, 300) * 1000);
      statusHistory.push({
        status: "cancelled",
        timestamp: new Date(currentTime.getTime()),
        actor: cancelAt === 0 ? "restaurant" : "system",
        durationFromPrevSec: randBetween(30, 300)
      });
      break;
    }
  }

  const finalStatus = statusHistory[statusHistory.length - 1].status;

  // Pick 1-4 items from this restaurant's menu
  const restItems = menuItemsSample.filter(function(m) { return m.restaurantId.toString() === rid.toString(); });
  const orderItems = [];
  const numItems = Math.min(randBetween(1, 4), restItems.length || 1);
  const usedSet = {};
  for (let oi = 0; oi < numItems && restItems.length > 0; oi++) {
    let item;
    let attempts = 0;
    do { item = pick(restItems); attempts++; } while (usedSet[item._id.toString()] && attempts < 10);
    if (usedSet[item._id.toString()]) continue;
    usedSet[item._id.toString()] = true;
    const qty = randBetween(1, 3);
    orderItems.push({
      menuItemId: item._id,
      name: item.name,
      quantity: qty,
      unitPrice: item.price,
      subtotal: roundTwo(item.price * qty)
    });
  }

  if (orderItems.length === 0) {
    orderItems.push({ menuItemId: menuItemsSample[0]._id, name: menuItemsSample[0].name, quantity: 1, unitPrice: menuItemsSample[0].price, subtotal: menuItemsSample[0].price });
  }

  const subtotal = roundTwo(orderItems.reduce(function(s, it) { return s + it.subtotal; }, 0));
  const tax = roundTwo(subtotal * 0.12);
  const deliveryFee = roundTwo(10 + Math.random() * 15);
  const total = roundTwo(subtotal + tax + deliveryFee);

  const user = db.users.findOne({ _id: userId }, { defaultAddress: 1 });
  const addr = (user && user.defaultAddress) || { street: "Calle default", city: "Guatemala", zone: "Zona 1" };

  orderDocs.push({
    orderNumber: "ORD-" + (Date.now() + i) + "-" + randBetween(100, 999),
    userId: userId,
    restaurantId: rid,
    items: orderItems,
    deliveryAddress: { street: addr.street, city: addr.city, zone: addr.zone },
    status: finalStatus,
    statusHistory: statusHistory,
    subtotal: subtotal,
    tax: tax,
    deliveryFee: deliveryFee,
    total: total,
    paymentMethod: pick(PAYMENT_METHODS),
    cancellationReason: finalStatus === "cancelled" ? "Restaurante no disponible" : null,
    estimatedDelivery: new Date(createdAt.getTime() + 2700000),
    createdAt: createdAt,
    updatedAt: currentTime
  });
}

// Insert in batches
for (let ob = 0; ob < orderDocs.length; ob += 500) {
  const batch = orderDocs.slice(ob, ob + 500);
  db.orders.insertMany(batch);
  print("  Orders batch: inserted " + batch.length);
}
const orderCount = db.orders.countDocuments();
print("  Total orders: " + orderCount);

// Update user.orderHistory for inserted orders
const allOrders = db.orders.find({}, { _id: 1, userId: 1 }).toArray();
const ordersByUser = {};
allOrders.forEach(function(o) {
  const uid = o.userId.toString();
  if (!ordersByUser[uid]) ordersByUser[uid] = [];
  ordersByUser[uid].push(o._id);
});
Object.keys(ordersByUser).forEach(function(uid) {
  db.users.updateOne({ _id: new ObjectId(uid) }, {
    $set: { orderHistory: ordersByUser[uid].slice(-50) }
  });
});

// SEED REVIEWS

print("\n=== SEEDING REVIEWS ===");
const deliveredOrders = db.orders.find({ status: "delivered" }, { _id: 1, userId: 1, restaurantId: 1, createdAt: 1 }).limit(NUM_REVIEWS).toArray();

const reviewTitles = [
  "Excelente servicio", "Muy buena comida", "Recomendado", "Superó mis expectativas",
  "Buena experiencia", "Sabor auténtico", "Volveré pronto", "Porción generosa",
  "Entrega rápida", "Comida fresca", "Regular, puede mejorar", "No estuvo mal",
  "Delicioso", "La mejor pizza de la ciudad", "Gran variedad"
];
const reviewComments = [
  "La comida llegó caliente y en buen estado. Todo muy fresco.",
  "El sabor es auténtico, como en un restaurante de verdad.",
  "La porción es generosa y el precio es justo.",
  "El repartidor fue muy amable y puntual.",
  "Me encantó el empaque, muy bien presentado.",
  "La comida estaba bien pero tardó un poco más de lo esperado.",
  "Excelente relación calidad-precio. Definitivamente repetiré.",
  "Los ingredientes se notan frescos. Gran calidad.",
  "Perfecto para una cena familiar. Todos quedaron satisfechos.",
  "La presentación del plato fue impecable."
];

const reviewOps = [];
deliveredOrders.forEach(function(order) {
  const numTags = randBetween(1, 3);
  const tags = [];
  for (let t = 0; t < numTags; t++) {
    const tag = pick(REVIEW_TAGS);
    if (tags.indexOf(tag) === -1) tags.push(tag);
  }

  reviewOps.push({ insertOne: { document: {
    userId: order.userId,
    restaurantId: order.restaurantId,
    orderId: order._id,
    rating: NumberInt(randBetween(1, 5)),
    title: pick(reviewTitles),
    comment: pick(reviewComments),
    tags: tags,
    restaurantResponse: Math.random() > 0.6 ? {
      message: "Gracias por tu reseña. Esperamos verte pronto.",
      respondedAt: new Date()
    } : null,
    helpfulVotes: [],
    createdAt: new Date(order.createdAt.getTime() + randBetween(3600, 86400) * 1000)
  }}});
});
if (reviewOps.length > 0) db.reviews.bulkWrite(reviewOps, { ordered: false });
print("  Reviews inserted: " + db.reviews.countDocuments());

// SEED CARTS

print("\n=== SEEDING CARTS ===");
const cartOps = [];
for (let ci = 0; ci < NUM_CARTS; ci++) {
  const userId = userIds[ci + 10]; // skip admins
  const rid = restaurantIds[ci % restaurantIds.length];
  const restItems = menuItemsSample.filter(function(m) { return m.restaurantId.toString() === rid.toString(); });
  const cartItems = [];
  const numItems = Math.min(randBetween(1, 3), restItems.length || 1);
  for (let k = 0; k < numItems && restItems.length > 0; k++) {
    const item = restItems[k];
    const qty = randBetween(1, 3);
    cartItems.push({
      menuItemId: item._id,
      name: item.name,
      price: item.price,
      quantity: qty,
      subtotal: roundTwo(item.price * qty),
      available: true
    });
  }
  const subtotal = roundTwo(cartItems.reduce(function(s, it) { return s + it.subtotal; }, 0));

  cartOps.push({ insertOne: { document: {
    userId: userId,
    restaurantId: rid,
    items: cartItems,
    subtotal: subtotal,
    hasUnavailableItems: false,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date()
  }}});
}
if (cartOps.length > 0) db.carts.bulkWrite(cartOps, { ordered: false });
print("  Carts inserted: " + db.carts.countDocuments());

// SEED ORDER EVENTS

print("\n=== SEEDING ORDER EVENTS ===");
const eventBatches = [];
const ordersForEvents = db.orders.find({}).toArray();

ordersForEvents.forEach(function(order) {
  order.statusHistory.forEach(function(entry, idx) {
    const prev = idx > 0 ? order.statusHistory[idx - 1] : null;
    eventBatches.push({
      timestamp: entry.timestamp,
      metadata: {
        orderId: order._id,
        restaurantId: order.restaurantId,
        userId: order.userId
      },
      eventType: idx === 0 ? "created" : "status_change",
      fromStatus: prev ? prev.status : null,
      toStatus: entry.status,
      durationFromPrevSec: entry.durationFromPrevSec || 0,
      context: idx === 0
        ? { paymentMethod: order.paymentMethod, total: order.total }
        : { actor: entry.actor }
    });
  });
});

for (let eb = 0; eb < eventBatches.length; eb += 500) {
  const batch = eventBatches.slice(eb, eb + 500);
  db.order_events.insertMany(batch);
}
print("  Order events inserted: " + eventBatches.length);

// COMPUTE RESTAURANT STATS

print("\n=== COMPUTING RESTAURANT STATS ===");
const statsDocs = db.orders.aggregate([
  { $match: { status: "delivered" } },
  { $group: {
    _id: "$restaurantId",
    totalDelivered: { $sum: 1 },
    totalRevenue: { $sum: "$total" },
    avgOrderValue: { $avg: "$total" },
    lastOrderAt: { $max: "$createdAt" }
  }},
  { $lookup: { from: "reviews", localField: "_id", foreignField: "restaurantId", as: "revs" } },
  { $addFields: {
    totalReviews: { $size: "$revs" },
    avgRating: { $cond: [{ $gt: [{ $size: "$revs" }, 0] }, { $round: [{ $avg: "$revs.rating" }, 1] }, 0] },
    ratingDistribution: {
      "1": { $size: { $filter: { input: "$revs", cond: { $eq: ["$$this.rating", 1] } } } },
      "2": { $size: { $filter: { input: "$revs", cond: { $eq: ["$$this.rating", 2] } } } },
      "3": { $size: { $filter: { input: "$revs", cond: { $eq: ["$$this.rating", 3] } } } },
      "4": { $size: { $filter: { input: "$revs", cond: { $eq: ["$$this.rating", 4] } } } },
      "5": { $size: { $filter: { input: "$revs", cond: { $eq: ["$$this.rating", 5] } } } }
    }
  }},
  { $lookup: { from: "restaurants", localField: "_id", foreignField: "_id", as: "rest" } },
  { $unwind: { path: "$rest", preserveNullAndEmptyArrays: true } },
  { $project: {
    _id: 1,
    restaurantName: { $ifNull: ["$rest.name", "Unknown"] },
    totalOrders: "$totalDelivered",
    totalDelivered: 1,
    totalCancelled: { $literal: 0 },
    totalRevenue: { $round: ["$totalRevenue", 2] },
    avgOrderValue: { $round: ["$avgOrderValue", 2] },
    totalReviews: 1,
    avgRating: 1,
    ratingDistribution: 1,
    lastOrderAt: 1,
    lastUpdated: new Date()
  }}
]).toArray();
if (statsDocs.length > 0) {
  db.restaurant_stats.insertMany(statsDocs);
}

// Add cancelled count
db.orders.aggregate([
  { $match: { status: "cancelled" } },
  { $group: { _id: "$restaurantId", cnt: { $sum: 1 } } }
]).toArray().forEach(function(doc) {
  db.restaurant_stats.updateOne({ _id: doc._id }, { $set: { totalCancelled: doc.cnt } }, { upsert: true });
});
print("  Restaurant stats: " + db.restaurant_stats.countDocuments());

// COMPUTE DAILY REVENUE

print("\n=== COMPUTING DAILY REVENUE ===");
const revDocs = db.orders.aggregate([
  { $match: { status: "delivered" } },
  { $group: {
    _id: {
      restaurantId: "$restaurantId",
      date: { $dateTrunc: { date: "$createdAt", unit: "day" } }
    },
    revenue: { $sum: "$total" },
    orderCount: { $sum: 1 },
    avgOrderValue: { $avg: "$total" }
  }},
  { $addFields: {
    restaurantId: "$_id.restaurantId",
    date: "$_id.date",
    deliveredCount: "$orderCount",
    cancelledCount: 0,
    cancelRate: 0
  }},
  { $project: { _id: 0 } }
]).toArray();
if (revDocs.length > 0) {
  db.daily_revenue.insertMany(revDocs);
}
print("  Daily revenue: " + db.daily_revenue.countDocuments());

// Add user favorites
print("\n=== UPDATING USER FAVORITES ===");
for (let fi = 10; fi < 60; fi++) {
  const favs = [];
  for (let fj = 0; fj < randBetween(2, 8); fj++) {
    favs.push(pick(restaurantIds));
  }
  db.users.updateOne({ _id: userIds[fi] }, { $set: { favoriteRestaurants: favs } });
}
print("  Updated 50 users with favorites");

// SUMMARY

print("\n=== SEED COMPLETE ===");
db.getCollectionNames().forEach(function(coll) {
  if (!coll.startsWith("system.")) {
    print("  " + coll + ": " + db.getCollection(coll).countDocuments() + " documents");
  }
});
