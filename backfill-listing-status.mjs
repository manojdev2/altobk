import "dotenv/config";
import mongoose from "mongoose";
import NearestStationModel from "./src/models/NearestStationModel.js";

await mongoose.connect(process.env.MONGODB_URI);

const result = await NearestStationModel.updateMany(
  { listingStatus: { $exists: false } },
  { $set: { listingStatus: "approved" } }
);
console.log(`Backfilled ${result.modifiedCount} station(s) with listingStatus="approved".`);

await mongoose.disconnect();
