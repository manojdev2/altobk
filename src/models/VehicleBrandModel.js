import mongoose from "mongoose";

const VehicleBrandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    image: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const VehicleBrandModel = mongoose.model("VehicleBrand", VehicleBrandSchema);
export default VehicleBrandModel;
