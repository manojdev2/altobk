import mongoose from "mongoose";

const VehicleModelItemSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleBrand",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const VehicleModelItemModel = mongoose.model("VehicleModelItem", VehicleModelItemSchema);
export default VehicleModelItemModel;
