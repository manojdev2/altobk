import mongoose from "mongoose";

const ChargingSessionSchema = new mongoose.Schema(
  {
    // ── References ──
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NearestStation",
    },

    // ── Station Info (denormalized from booking) ──
    stationName:       { type: String, default: "" },  // "Power Station"
    address:           { type: String, default: "" },  // "San Francisco, USA"
    stationImage:      { type: String, default: "" },

    // ── Slot / Charger Info ──
    slotLabel:         { type: String, default: "Slot A" },     // "Slot A"
    connectorType:     { type: String, default: "Type A" },     // "Type A"
    chargingDuration:  { type: String, default: "" },           // "60 Min"
    sessionTime:       { type: String, default: "" },           // "3:30 PM"

    // ── Live Charging State ──
    batteryPercent:    { type: Number, default: 0 },   // 85 → shown as 85%
    kwhUsed:           { type: Number, default: 0 },   // 25.4  (shown as "25.4 kwh so far")
    timeRemainingMs:   { type: Number, default: 0 },   // milliseconds remaining (shown as 00:18:30)

    // ── Session Status ──
    status: {
      type: String,
      enum: ["NotStarted", "Charging", "Stopped", "Completed"],
      default: "NotStarted",
    },

    startedAt:  { type: Date, default: null },
    stoppedAt:  { type: Date, default: null },

    // ── Charging Summary (on Stop) ──
    energyDelivered:    { type: Number, default: 0 },   // 25.4 kwh
    costPerKwh:         { type: Number, default: 0 },   // 0.75
    extendSessionCharge:{ type: Number, default: 0 },   // 175 (extra from extending)
    totalAmount:        { type: Number, default: 0 },   // 455

    // ── Extension Payment Tracking ──
    paymentGateway:          { type: String, enum: ["card", "sslcommerz", "stripe", ""], default: "" },
    extensionTransactionId:  { type: String, default: "" },
    stripePaymentIntentId:   { type: String, default: "" },
    extensionPaymentStatus:  { type: String, enum: ["pending", "paid", "failed", "cancelled", ""], default: "" },

    // ── Extend Sessions log ──
    extensions: [
      {
        extendMins:   { type: Number },   // 30
        estimatedCost:{ type: Number },   // 100
        addedAt:      { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const ChargingSessionModel = mongoose.model("ChargingSession", ChargingSessionSchema);
export default ChargingSessionModel;
