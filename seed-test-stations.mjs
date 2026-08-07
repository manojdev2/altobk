import "dotenv/config";
import mongoose from "mongoose";
import NearestStationModel from "./src/models/NearestStationModel.js";

await mongoose.connect(process.env.MONGODB_URI);

const base = { latitude: 23.8103, longitude: 90.4125 }; // Dhaka-ish test point

await NearestStationModel.create([
  {
    name: "Test Station A (close, cheap, available)",
    address: "123 Test Rd",
    status: "Available",
    latitude: base.latitude + 0.01,
    longitude: base.longitude + 0.01,
    rating: 4.2,
    pricePerHourValue: 5,
    pricePerHour: "5$/hr",
  },
  {
    name: "Test Station B (far, top rated)",
    address: "456 Test Ave",
    status: "Available",
    latitude: base.latitude + 0.15,
    longitude: base.longitude + 0.15,
    rating: 4.9,
    pricePerHourValue: 15,
    pricePerHour: "15$/hr",
  },
  {
    name: "Test Station C (close but busy)",
    address: "789 Test Blvd",
    status: "Busy",
    latitude: base.latitude + 0.005,
    longitude: base.longitude + 0.005,
    rating: 3.5,
    pricePerHourValue: 8,
    pricePerHour: "8$/hr",
  },
]);

console.log("Seeded 3 test stations near", base);
await mongoose.disconnect();
