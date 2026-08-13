import mongoose from "mongoose";

const FavouriteStationSchema = new mongoose.Schema(
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
    pricePerHour: { type: String, default: "" },  // carries the station's currency-aware string
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

const FavouriteStationModel = mongoose.model("FavouriteStation", FavouriteStationSchema);
export default FavouriteStationModel;
