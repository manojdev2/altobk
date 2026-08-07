import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NearestStation",
      required: true,
    },
    // ── Station info (denormalized) ──
    stationName:      { type: String, default: "" },   // "San Francisco Power Station"
    address:          { type: String, default: "" },   // "San Francisco, USA"
    stationImage:     { type: String, default: "" },

    // ── Vehicle info (denormalized from active vehicle) ──
    vehicleName:      { type: String, default: "" },   // "Honda CR-V"
    vehiclePlate:     { type: String, default: "" },   // "CR-12-AF_3456"
    vehicleImage:     { type: String, default: "" },
    vehicleBrandImage:{ type: String, default: "" },

    // ── Charger details ──
    connectorType:    { type: String, default: "Type A" },   // "Type A"
    energyKwh:        { type: String, default: "110 kw/h" }, // "110 kw/h"
    chargingSlot:     { type: String, default: "Slot A" },   // "Slot A"
    chargerType:      { type: String, default: "CCS - 150 kW" },

    // ── Booking timing ──
    date:             { type: String, required: true },  // "Fri, January 02, 2026"
    time:             { type: String, required: true },  // "04:30 PM"
    slotStart:        { type: String, default: "" },     // "10:30 AM"
    slotEnd:          { type: String, default: "" },     // "11:30 AM"
    chargingDuration: { type: String, default: "" },     // "45 minutes"

    // ── Payment ──
    amountEstimation: { type: Number, default: 0 },     // 450
    tax:              { type: Number, default: 0 },     // 5
    totalAmount:      { type: Number, default: 0 },     // 455
    isPaid:           { type: Boolean, default: false },
    paymentCardLast4: { type: String, default: "" },    // "2345"
    paymentGateway:   { type: String, enum: ["card", "sslcommerz", "stripe", ""], default: "" },
    transactionId:    { type: String, default: "" },    // gateway transaction id
    stripePaymentIntentId: { type: String, default: "" },
    paymentStatus:    { type: String, enum: ["pending", "paid", "failed", "cancelled", ""], default: "" },

    // ── Status ──
    status: {
      type: String,
      enum: ["Upcoming", "Completed", "Cancelled"],
      default: "Upcoming",
    },
    hasArrived: { type: Boolean, default: false }, // true when user confirms arrival at station

    // ── Real-time user location during navigation ──
    userLat:        { type: Number, default: null },   // car's current latitude
    userLng:        { type: Number, default: null },   // car's current longitude
    lastLocationAt: { type: Date,   default: null },   // timestamp of last location update
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const BookingModel = mongoose.model("Booking", BookingSchema);
export default BookingModel;
