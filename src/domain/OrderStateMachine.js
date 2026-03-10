const AppError = require("../errors/AppError");

const TRANSITIONS = {
  pending:          ["confirmed", "cancelled"],
  confirmed:        ["preparing", "cancelled"],
  preparing:        ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["picked_up"],
  picked_up:        ["delivered"],
  delivered:        [],
  cancelled:        [],
};

class OrderStateMachine {
  static getAllowedTransitions(currentStatus) {
    return TRANSITIONS[currentStatus] || [];
  }

  static validate(currentStatus, newStatus) {
    const allowed = this.getAllowedTransitions(currentStatus);
    if (!allowed.includes(newStatus)) {
      throw AppError.badRequest(
        `Transition ${currentStatus} → ${newStatus} is not allowed`,
        { allowed }
      );
    }
  }

  static buildTransition(order, newStatus, actor = "system", reason = null) {
    this.validate(order.status, newStatus);

    const now = new Date();
    const lastEntry = order.statusHistory[order.statusHistory.length - 1];
    const durationFromPrevSec = lastEntry
      ? Math.floor((now - new Date(lastEntry.timestamp)) / 1000)
      : 0;

    const historyEntry = { status: newStatus, timestamp: now, actor, durationFromPrevSec };

    const update = {
      $set: { status: newStatus, updatedAt: now },
      $push: { statusHistory: historyEntry },
    };

    if (newStatus === "cancelled" && reason) {
      update.$set.cancellationReason = reason;
    }

    return update;
  }
}

module.exports = OrderStateMachine;
