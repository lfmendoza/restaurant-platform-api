const { connect, getClient } = require("../src/db");

beforeAll(async () => {
  await connect();
}, 30000);

afterAll(async () => {
  const client = getClient();
  if (client) await client.close();
}, 10000);
