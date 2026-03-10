/**
 * Asegura que los índices críticos para búsqueda por ubicación existan.
 * Se ejecuta al iniciar el servidor. createIndex es idempotente (no duplica si ya existe).
 */
async function ensureSearchIndexes(db) {
  const deliveryZones = db.collection("delivery_zones");
  await deliveryZones.createIndex(
    { area: "2dsphere", isActive: 1 },
    { name: "area_2dsphere_isActive_1", background: true }
  ).catch((err) => {
    if (err.code !== 85 && err.code !== 86) console.warn("ensureIndex delivery_zones:", err.message);
  });
}

module.exports = { ensureSearchIndexes };
