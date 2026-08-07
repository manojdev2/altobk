import mongoose from "mongoose";

const SavedLocationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stationId: { type: String, required: true },
    stationName: { type: String, required: true },
    address: { type: String, default: "" },
    image: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Available", "Unavailable", "Busy"],
      default: "Available",
    },
    latitude: { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const SavedLocationModel = mongoose.model("SavedLocation", SavedLocationSchema);
export default SavedLocationModel;
