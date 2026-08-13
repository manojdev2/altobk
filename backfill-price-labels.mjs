// Rewrites the denormalized pricePerHour display string on every station using
// the currency configured in App Settings.
//
// Stations written before the currency fix stored "12$/hr" no matter what
// currency the deployment used, because the string was built as `${value}$/hr`.
// The web frontends now render from pricePerHourValue, but the Flutter client
// and favourites still read the string — so bring the stored values in line.
//
//   node backfill-price-labels.mjs           # apply
//   node backfill-price-labels.mjs --dry-run # report only
import "dotenv/config";
import mongoose from "mongoose";
import NearestStationModel from "./src/models/NearestStationModel.js";
import { formatPricePerHour } from "./src/utils/stationHelpers.js";

const dryRun = process.argv.includes("--dry-run");

await mongoose.connect(process.env.MONGODB_URI);

const stations = await NearestStationModel.find({}, { pricePerHour: 1, pricePerHourValue: 1, name: 1 });

let changed = 0;
for (const s of stations) {
  const expected = await formatPricePerHour(s.pricePerHourValue);
  if (s.pricePerHour === expected) continue;
  changed++;
  console.log(`${dryRun ? "[dry-run] " : ""}${s.name}: "${s.pricePerHour}" -> "${expected}"`);
  if (!dryRun) {
    await NearestStationModel.updateOne({ _id: s._id }, { $set: { pricePerHour: expected } });
  }
}

console.log(
  `\n${dryRun ? "Would update" : "Updated"} ${changed} of ${stations.length} station(s).`
);

await mongoose.disconnect();
