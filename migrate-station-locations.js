/**
 * One-time migration script
 * ─────────────────────────
 * Backfills the GeoJSON `location` field for every NearestStation
 * document that already has latitude / longitude but no `location`.
 *
 * Run:  node migrate-station-locations.js
 */

import "dotenv/config";
import mongoose from "mongoose";
import { MONGO_URL } from "./src/config/config.js";
import NearestStationModel from "./src/models/NearestStationModel.js";

async function migrate() {
  await mongoose.connect(MONGO_URL);
  console.log("✅ Connected to MongoDB");

  // Find stations that have lat/lng but no proper location.coordinates
  const stations = await NearestStationModel.find({
    latitude:  { $ne: 0 },
    longitude: { $ne: 0 },
    $or: [
      { location: { $exists: false } },
      { "location.coordinates": { $eq: [0, 0] } },
      { "location.coordinates": { $exists: false } },
    ],
  });

  console.log(`📍 Found ${stations.length} station(s) to migrate.`);

  for (const station of stations) {
    station.location = {
      type: "Point",
      coordinates: [station.longitude, station.latitude],  // GeoJSON = [lng, lat]
    };
    await station.save();
    console.log(`   ✔ ${station.name} → [${station.longitude}, ${station.latitude}]`);
  }

  // Ensure the 2dsphere index exists
  await NearestStationModel.collection.createIndex({ location: "2dsphere" });
  console.log("✅ 2dsphere index ensured.");

  console.log("🎉 Migration complete!");
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
