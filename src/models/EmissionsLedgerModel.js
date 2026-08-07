import mongoose from "mongoose";

// One immutable entry per completed charging session — the audit trail the
// carbon-credit pipeline's reporting/export is built on. Emission factors
// are snapshotted here (not just referenced from carbonMethodology.js) so a
// future methodology update never silently rewrites historical numbers.
const EmissionsLedgerSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "ChargingSession", required: true, unique: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Fleet", default: null, index: true },
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: "NearestStation" },
    stationName: { type: String, default: "" },

    kwhDelivered: { type: Number, required: true },

    methodologyVersion: { type: String, required: true },
    gridEmissionFactorKgPerKwh: { type: Number, required: true },
    iceEquivalentFactorKgPerKwh: { type: Number, required: true },

    emissionsAvoidedKg: { type: Number, required: true },

    sessionCompletedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

const EmissionsLedgerModel = mongoose.model("EmissionsLedger", EmissionsLedgerSchema);
export default EmissionsLedgerModel;
