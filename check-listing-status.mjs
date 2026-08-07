import "dotenv/config";
import mongoose from "mongoose";
import NearestStationModel from "./src/models/NearestStationModel.js";

await mongoose.connect(process.env.MONGODB_URI);

console.log("Actual collection name:", NearestStationModel.collection.name);
// Raw collection read, bypassing Mongoose schema defaults entirely.
const raw = await mongoose.connection.collection(NearestStationModel.collection.name).find({}).toArray();
raw.forEach((s) => console.log(s.name, "| raw listingStatus:", JSON.stringify(s.listingStatus)));

await mongoose.disconnect();
