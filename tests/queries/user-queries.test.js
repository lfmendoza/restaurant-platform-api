jest.mock("../../src/db");

const { getDb, getReadDb } = require("../../src/db");
const UserQueries = require("../../src/queries/UserQueries");
const { setupMockDb, createCursor } = require("../helpers/mock-db");
const { ID, USERS } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, null, getReadDb));
});

describe("UserQueries.list", () => {
  it("returns paginated users with projection", async () => {
    col("users").find.mockReturnValue(createCursor([USERS.customer]));

    const result = await UserQueries.list({ skip: 0, limit: 10 });

    expect(result).toHaveLength(1);
    expect(col("users").find.mock.calls[0][1].projection).toHaveProperty("email");
  });

  it("applies role filter", async () => {
    col("users").find.mockReturnValue(createCursor([]));

    await UserQueries.list({ role: "restaurant_admin" });

    const filter = col("users").find.mock.calls[0][0];
    expect(filter.role).toBe("restaurant_admin");
  });
});

describe("UserQueries.getById", () => {
  it("returns user with orderHistory $slice", async () => {
    col("users").findOne.mockResolvedValue(USERS.customer);

    const user = await UserQueries.getById(ID.user1.toString());

    expect(user.name).toBe("Test Customer");
    const projection = col("users").findOne.mock.calls[0][1].projection;
    expect(projection.orderHistory.$slice).toBe(-10);
  });

  it("throws 404 when not found", async () => {
    col("users").findOne.mockResolvedValue(null);

    await expect(UserQueries.getById(ID.user1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
