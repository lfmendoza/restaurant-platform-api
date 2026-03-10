jest.mock("../../src/db");

const { getDb } = require("../../src/db");
const UserCommands = require("../../src/commands/UserCommands");
const { setupMockDb } = require("../helpers/mock-db");
const { ID, USERS } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("UserCommands.create — validation", () => {
  it("throws 400 when email is missing", async () => {
    await expect(UserCommands.create({ name: "X" }))
      .rejects.toMatchObject({ statusCode: 400, message: /email/ });
  });

  it("throws 400 when name is missing", async () => {
    await expect(UserCommands.create({ email: "a@b.com" }))
      .rejects.toMatchObject({ statusCode: 400, message: /name/ });
  });

  it("throws 400 when both email and name are missing", async () => {
    await expect(UserCommands.create({}))
      .rejects.toMatchObject({ statusCode: 400, message: /email.*name|name.*email/ });
  });
});

describe("UserCommands.create", () => {
  it("inserts user with defaults and returns document", async () => {
    col("users").insertOne.mockResolvedValue({ insertedId: ID.user1 });

    const user = await UserCommands.create({
      email: "new@test.com", name: "New User",
    });

    expect(user._id).toEqual(ID.user1);
    expect(user.email).toBe("new@test.com");
    expect(user.role).toBe("customer");
    expect(user.phone).toBeNull();
    expect(user.orderHistory).toEqual([]);
    expect(user.favoriteRestaurants).toEqual([]);
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it("throws 409 on duplicate email (MongoDB 11000)", async () => {
    const dupErr = new Error("dup");
    dupErr.code = 11000;
    col("users").insertOne.mockRejectedValue(dupErr);

    await expect(UserCommands.create({ email: "dup@test.com", name: "Dup" }))
      .rejects.toMatchObject({ statusCode: 409, message: /already registered/i });
  });

  it("re-throws non-duplicate errors", async () => {
    col("users").insertOne.mockRejectedValue(new Error("connection lost"));

    await expect(UserCommands.create({ email: "a@b.com", name: "X" }))
      .rejects.toThrow("connection lost");
  });
});

describe("UserCommands.update — validation", () => {
  it("throws 400 on invalid id format", async () => {
    await expect(UserCommands.update("not-valid-id", { name: "X" }))
      .rejects.toMatchObject({ statusCode: 400, message: /userId/ });
  });

  it("throws 400 when no update fields provided", async () => {
    await expect(UserCommands.update(ID.user1.toString(), {}))
      .rejects.toMatchObject({ statusCode: 400, message: /at least one field/i });
  });
});

describe("UserCommands.update", () => {
  it("updates name and phone", async () => {
    col("users").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await UserCommands.update(ID.user1.toString(), { name: "Updated", phone: "+502 9999" });

    expect(result.updated).toBe(1);
    const updateDoc = col("users").updateOne.mock.calls[0][1];
    expect(updateDoc.$set.name).toBe("Updated");
    expect(updateDoc.$set.phone).toBe("+502 9999");
    expect(updateDoc.$set.updatedAt).toBeInstanceOf(Date);
  });

  it("throws 404 when user not found", async () => {
    col("users").updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(UserCommands.update(ID.user1.toString(), { name: "X" }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("UserCommands.addFavorite — validation", () => {
  it("throws 400 on invalid userId", async () => {
    await expect(UserCommands.addFavorite("bad", ID.rest1.toString()))
      .rejects.toMatchObject({ statusCode: 400, message: /userId/ });
  });

  it("throws 400 on invalid restaurantId", async () => {
    await expect(UserCommands.addFavorite(ID.user1.toString(), "bad"))
      .rejects.toMatchObject({ statusCode: 400, message: /restaurantId/ });
  });

  it("throws 400 when restaurantId is missing", async () => {
    await expect(UserCommands.addFavorite(ID.user1.toString(), undefined))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("UserCommands.addFavorite", () => {
  it("uses $push with $each + $slice -20 (Subset Pattern)", async () => {
    col("users").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await UserCommands.addFavorite(ID.user1.toString(), ID.rest1.toString());

    expect(result.updated).toBe(1);
    const update = col("users").updateOne.mock.calls[0][1];
    expect(update.$push.favoriteRestaurants.$each).toHaveLength(1);
    expect(update.$push.favoriteRestaurants.$slice).toBe(-20);
  });

  it("throws 404 when user not found", async () => {
    col("users").updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(UserCommands.addFavorite(ID.user1.toString(), ID.rest1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("UserCommands.delete — validation", () => {
  it("throws 400 on invalid id", async () => {
    await expect(UserCommands.delete("invalid"))
      .rejects.toMatchObject({ statusCode: 400, message: /userId/ });
  });
});

describe("UserCommands.delete", () => {
  it("deletes user and returns count", async () => {
    col("users").deleteOne.mockResolvedValue({ deletedCount: 1 });

    const result = await UserCommands.delete(ID.user1.toString());
    expect(result.deleted).toBe(1);
  });

  it("throws 404 when user not found", async () => {
    col("users").deleteOne.mockResolvedValue({ deletedCount: 0 });

    await expect(UserCommands.delete(ID.user1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
