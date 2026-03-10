jest.mock("../../src/db");

const { getDb } = require("../../src/db");
const ReviewCommands = require("../../src/commands/ReviewCommands");
const { setupMockDb } = require("../helpers/mock-db");
const { ID, REVIEWS } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("ReviewCommands.respond — validation", () => {
  it("throws 400 on invalid reviewId", async () => {
    await expect(ReviewCommands.respond("bad", "Gracias"))
      .rejects.toMatchObject({ statusCode: 400, message: /reviewId/ });
  });

  it("throws 400 when message is missing", async () => {
    await expect(ReviewCommands.respond(ID.review1.toString(), ""))
      .rejects.toMatchObject({ statusCode: 400, message: /message/ });
  });
});

describe("ReviewCommands.addTag — validation", () => {
  it("throws 400 on invalid reviewId", async () => {
    await expect(ReviewCommands.addTag("bad", "tag"))
      .rejects.toMatchObject({ statusCode: 400, message: /reviewId/ });
  });

  it("throws 400 when tag is missing", async () => {
    await expect(ReviewCommands.addTag(ID.review1.toString(), ""))
      .rejects.toMatchObject({ statusCode: 400, message: /tag/ });
  });
});

describe("ReviewCommands.addHelpfulVote — validation", () => {
  it("throws 400 on invalid reviewId", async () => {
    await expect(ReviewCommands.addHelpfulVote("bad", ID.user2.toString()))
      .rejects.toMatchObject({ statusCode: 400, message: /reviewId/ });
  });

  it("throws 400 on invalid voterId", async () => {
    await expect(ReviewCommands.addHelpfulVote(ID.review1.toString(), "bad"))
      .rejects.toMatchObject({ statusCode: 400, message: /voterId/ });
  });
});

describe("ReviewCommands.delete — validation", () => {
  it("throws 400 on invalid reviewId", async () => {
    await expect(ReviewCommands.delete("bad"))
      .rejects.toMatchObject({ statusCode: 400, message: /reviewId/ });
  });
});

describe("ReviewCommands.respond", () => {
  it("sets restaurantResponse with message and timestamp", async () => {
    col("reviews").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await ReviewCommands.respond(ID.review1.toString(), "Gracias!");

    expect(result.updated).toBe(1);
    const update = col("reviews").updateOne.mock.calls[0][1];
    expect(update.$set.restaurantResponse.message).toBe("Gracias!");
    expect(update.$set.restaurantResponse.respondedAt).toBeInstanceOf(Date);
  });

  it("throws 404 when review not found", async () => {
    col("reviews").updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(ReviewCommands.respond(ID.review1.toString(), "X"))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("ReviewCommands.addTag", () => {
  it("uses $addToSet to prevent duplicates", async () => {
    col("reviews").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await ReviewCommands.addTag(ID.review1.toString(), "nuevo-tag");

    const update = col("reviews").updateOne.mock.calls[0][1];
    expect(update.$addToSet.tags).toBe("nuevo-tag");
  });

  it("throws 404 when review not found", async () => {
    col("reviews").updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(ReviewCommands.addTag(ID.review1.toString(), "x"))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("ReviewCommands.addHelpfulVote", () => {
  it("uses $addToSet with ObjectId voter", async () => {
    col("reviews").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await ReviewCommands.addHelpfulVote(ID.review1.toString(), ID.user2.toString());

    const update = col("reviews").updateOne.mock.calls[0][1];
    expect(update.$addToSet.helpfulVotes).toEqual(ID.user2);
  });

  it("throws 404 when review not found", async () => {
    col("reviews").updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(ReviewCommands.addHelpfulVote(ID.review1.toString(), ID.user2.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("ReviewCommands.delete", () => {
  it("deletes review", async () => {
    col("reviews").deleteOne.mockResolvedValue({ deletedCount: 1 });
    const result = await ReviewCommands.delete(ID.review1.toString());
    expect(result.deleted).toBe(1);
  });

  it("throws 404 when not found", async () => {
    col("reviews").deleteOne.mockResolvedValue({ deletedCount: 0 });
    await expect(ReviewCommands.delete(ID.review1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("ReviewCommands.deleteMany", () => {
  it("deletes by restaurantId filter", async () => {
    col("reviews").deleteMany.mockResolvedValue({ deletedCount: 5 });

    const result = await ReviewCommands.deleteMany({ restaurantId: ID.rest1.toString() });

    expect(result.deleted).toBe(5);
  });

  it("applies before date filter", async () => {
    col("reviews").deleteMany.mockResolvedValue({ deletedCount: 2 });

    await ReviewCommands.deleteMany({ userId: ID.user1.toString(), before: "2025-01-01" });

    const filter = col("reviews").deleteMany.mock.calls[0][0];
    expect(filter.userId).toEqual(ID.user1);
    expect(filter.createdAt.$lt).toBeInstanceOf(Date);
  });

  it("throws 400 when no filters provided", async () => {
    await expect(ReviewCommands.deleteMany({}))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
