const OrderStateMachine = require("../../src/domain/OrderStateMachine");

const VALID_TRANSITIONS = {
  pending:          ["confirmed", "cancelled"],
  confirmed:        ["preparing", "cancelled"],
  preparing:        ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["picked_up"],
  picked_up:        ["delivered"],
  delivered:        [],
  cancelled:        [],
};

describe("OrderStateMachine", () => {
  describe("getAllowedTransitions", () => {
    Object.entries(VALID_TRANSITIONS).forEach(([state, expected]) => {
      it(`returns ${JSON.stringify(expected)} for '${state}'`, () => {
        expect(OrderStateMachine.getAllowedTransitions(state)).toEqual(expected);
      });
    });

    it("returns [] for unknown state", () => {
      expect(OrderStateMachine.getAllowedTransitions("nonexistent")).toEqual([]);
    });
  });

  describe("validate", () => {
    it("does not throw on valid transition", () => {
      expect(() => OrderStateMachine.validate("pending", "confirmed")).not.toThrow();
    });

    it("throws AppError with 400 on invalid transition", () => {
      try {
        OrderStateMachine.validate("pending", "delivered");
        fail("Should have thrown");
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toMatch(/not allowed/i);
        expect(err.details.allowed).toEqual(["confirmed", "cancelled"]);
      }
    });

    it("throws for transitions from terminal states", () => {
      expect(() => OrderStateMachine.validate("delivered", "cancelled")).toThrow();
      expect(() => OrderStateMachine.validate("cancelled", "pending")).toThrow();
    });

    it("allows cancellation from pre-delivery states", () => {
      ["pending", "confirmed", "preparing"].forEach((state) => {
        expect(() => OrderStateMachine.validate(state, "cancelled")).not.toThrow();
      });
    });

    it("blocks cancellation from post-dispatch states", () => {
      ["ready_for_pickup", "picked_up", "delivered"].forEach((state) => {
        expect(() => OrderStateMachine.validate(state, "cancelled")).toThrow();
      });
    });
  });

  describe("buildTransition", () => {
    const mockOrder = {
      status: "pending",
      statusHistory: [
        { status: "pending", timestamp: new Date(Date.now() - 60000) },
      ],
    };

    it("returns MongoDB $set + $push update document", () => {
      const update = OrderStateMachine.buildTransition(mockOrder, "confirmed", "restaurant");

      expect(update.$set.status).toBe("confirmed");
      expect(update.$set.updatedAt).toBeInstanceOf(Date);
      expect(update.$push.statusHistory.status).toBe("confirmed");
      expect(update.$push.statusHistory.actor).toBe("restaurant");
      expect(update.$push.statusHistory.durationFromPrevSec).toBeGreaterThanOrEqual(0);
      expect(update.$push.statusHistory.timestamp).toBeInstanceOf(Date);
    });

    it("includes cancellationReason for cancelled + reason", () => {
      const update = OrderStateMachine.buildTransition(mockOrder, "cancelled", "customer", "Too slow");
      expect(update.$set.cancellationReason).toBe("Too slow");
      expect(update.$set.status).toBe("cancelled");
    });

    it("does not include cancellationReason when no reason provided", () => {
      const update = OrderStateMachine.buildTransition(mockOrder, "cancelled", "customer");
      expect(update.$set.cancellationReason).toBeUndefined();
    });

    it("calculates durationFromPrevSec from last history entry", () => {
      const order = {
        status: "confirmed",
        statusHistory: [
          { status: "pending", timestamp: new Date(Date.now() - 120000) },
          { status: "confirmed", timestamp: new Date(Date.now() - 60000) },
        ],
      };
      const update = OrderStateMachine.buildTransition(order, "preparing", "restaurant");
      expect(update.$push.statusHistory.durationFromPrevSec).toBeGreaterThanOrEqual(59);
    });

    it("throws for invalid transition", () => {
      expect(() => OrderStateMachine.buildTransition(mockOrder, "delivered")).toThrow();
    });
  });

  describe("full lifecycle simulation", () => {
    it("traverses happy path: pending → confirmed → preparing → ready → picked_up → delivered", () => {
      const happyPath = ["confirmed", "preparing", "ready_for_pickup", "picked_up", "delivered"];
      let status = "pending";
      const history = [{ status: "pending", timestamp: new Date() }];

      happyPath.forEach((next) => {
        const order = { status, statusHistory: history };
        const update = OrderStateMachine.buildTransition(order, next, "system");
        expect(update.$set.status).toBe(next);
        history.push(update.$push.statusHistory);
        status = next;
      });

      expect(status).toBe("delivered");
      expect(history).toHaveLength(6);
    });

    it("cancellation interrupts at any pre-delivery stage", () => {
      const cancellableFrom = ["pending", "confirmed", "preparing"];

      cancellableFrom.forEach((fromState) => {
        const order = {
          status: fromState,
          statusHistory: [{ status: fromState, timestamp: new Date() }],
        };
        const update = OrderStateMachine.buildTransition(order, "cancelled", "customer", "Changed my mind");
        expect(update.$set.status).toBe("cancelled");
        expect(update.$set.cancellationReason).toBe("Changed my mind");
      });
    });
  });
});
