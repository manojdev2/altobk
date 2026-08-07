import mongoose from "mongoose";

const VehicleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name:     { type: String, required: true },   // brand name e.g. "Tesla"
    model:    { type: String, required: true },   // model name e.g. "Model 3"
    image:    { type: String, default: "" },      // model photo
    brandImage: { type: String, default: "" },    // brand logo (distinct from the model photo above)
    isActive: { type: Boolean, default: false },

    // ── Set-Up Your Vehicle steps 3 & 4 ──
    connectorType:      { type: String, default: "" },   // "CCS" | "CHAdeMO" | "Type 2" | "Tesla Supercharger"
    batteryCapacityKwh: { type: Number, default: 0 },    // e.g. 75
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const VehicleModel = mongoose.model("Vehicle", VehicleSchema);
export default VehicleModel;
