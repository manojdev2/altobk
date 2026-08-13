// Dev seed: fills the empty collections the admin dashboard reports on.
// Run from the BE directory:  node <path-to-this-file>
import "dotenv/config";
import crypto from "crypto";
import mongoose from "mongoose";

import UserModel from "./src/models/UserModel.js";
import NearestStationModel from "./src/models/NearestStationModel.js";
import VehicleBrandModel from "./src/models/VehicleBrandModel.js";
import VehicleModelItemModel from "./src/models/VehicleModelItemModel.js";
import BookingModel from "./src/models/BookingModel.js";
import ChargingSessionModel from "./src/models/ChargingSessionModel.js";
import ReviewModel from "./src/models/ReviewModel.js";
import { formatPricePerHour } from "./src/utils/stationHelpers.js";

// userService.js hashes with plain sha256 hex — match it so seeded logins work.
const hashPassword = (p) => crypto.createHash("sha256").update(p).digest("hex");
const PASSWORD = "Test@1234";

await mongoose.connect(process.env.MONGODB_URI);
console.log("connected:", process.env.MONGODB_URI);

// ── Users ────────────────────────────────────────────────────────────────
const userSpecs = [
  { fullName: "Ayesha Rahman", email: "ayesha@example.com", phone: "+8801711000001", trustScore: 96, trustTier: "trusted", completedSessionsCount: 12 },
  { fullName: "Tanvir Hasan",  email: "tanvir@example.com", phone: "+8801711000002", trustScore: 78, trustTier: "building", completedSessionsCount: 4 },
  { fullName: "Nusrat Jahan",  email: "nusrat@example.com", phone: "+8801711000003", trustScore: 100, trustTier: "new", completedSessionsCount: 0 },
  { fullName: "Rafiq Islam",   email: "rafiq@example.com",  phone: "+8801711000004", trustScore: 45, trustTier: "flagged", completedSessionsCount: 2, noShowCount: 3 },
];

const users = [];
for (const spec of userSpecs) {
  const doc = await UserModel.findOneAndUpdate(
    { email: spec.email },
    { $set: { ...spec, password: hashPassword(PASSWORD), isVerified: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  users.push(doc);
}
console.log(`users: ${users.length}`);

// ── Vehicle brands + models ──────────────────────────────────────────────
const brandSpecs = [
  { name: "Tesla",   models: ["Model 3", "Model Y", "Model S"] },
  { name: "BYD",     models: ["Atto 3", "Seal", "Dolphin"] },
  { name: "Hyundai", models: ["Ioniq 5", "Kona Electric"] },
  { name: "BMW",     models: ["i4", "iX3"] },
];

let modelCount = 0;
for (const b of brandSpecs) {
  const brand = await VehicleBrandModel.findOneAndUpdate(
    { name: b.name },
    { $set: { name: b.name, image: "" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  for (const m of b.models) {
    await VehicleModelItemModel.findOneAndUpdate(
      { brandId: brand._id, name: m },
      { $set: { brandId: brand._id, name: m, image: "" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    modelCount++;
  }
}
console.log(`brands: ${brandSpecs.length}, models: ${modelCount}`);

// ── Stations ─────────────────────────────────────────────────────────────
const AMENITIES = [
  { label: "Wi-Fi", icon: "wifi" },
  { label: "Restaurant", icon: "utensils" },
  { label: "Shop", icon: "shopping-bag" },
  { label: "Maintenance", icon: "wrench" },
];

const SLOTS = [
  { startTime: "09:00 AM", endTime: "10:00 AM", isBooked: false },
  { startTime: "10:30 AM", endTime: "11:30 AM", isBooked: true },
  { startTime: "12:00 PM", endTime: "01:00 PM", isBooked: false },
  { startTime: "02:30 PM", endTime: "03:30 PM", isBooked: false },
  { startTime: "04:30 PM", endTime: "05:30 PM", isBooked: false },
];

const DATES = ["06 Jan, Tue", "07 Jan, Wed", "08 Jan, Thu", "09 Jan, Fri"];

const stationSpecs = [
  { name: "Gulshan Power Hub",       address: "Gulshan Ave, Dhaka",       status: "Available",   lat: 23.7925, lng: 90.4078, rating: 4.6, reviewCount: 34, price: 12, tax: 5,  confidence: "verified",        reports: 21, about: "Fast DC charging in the heart of Gulshan with covered parking." },
  { name: "Banani Charge Point",     address: "Banani Rd 11, Dhaka",      status: "Busy",        lat: 23.7936, lng: 90.4043, rating: 4.1, reviewCount: 18, price: 10, tax: 5,  confidence: "mixed",           reports: 12, about: "Six bays, two currently under maintenance." },
  { name: "Dhanmondi EV Station",    address: "Dhanmondi 27, Dhaka",      status: "Available",   lat: 23.7461, lng: 90.3742, rating: 4.8, reviewCount: 52, price: 9,  tax: 5,  confidence: "verified",        reports: 40, about: "Highest rated station in Dhanmondi. 24/7 access." },
  { name: "Uttara Sector 7 Charger", address: "Sector 7, Uttara, Dhaka",  status: "Unavailable", lat: 23.8759, lng: 90.3795, rating: 3.4, reviewCount: 9,  price: 8,  tax: 0,  confidence: "reported_broken", reports: 6,  about: "Currently offline pending a connector replacement.", availableIn: "Available in 45 minutes" },
  { name: "Mirpur DOHS Depot",       address: "Mirpur DOHS, Dhaka",       status: "Available",   lat: 23.8330, lng: 90.3690, rating: 4.3, reviewCount: 27, price: 11, tax: 5,  confidence: "verified",        reports: 19, about: "Fleet-friendly depot with eight overnight bays." },
  { name: "Motijheel Commercial",    address: "Motijheel C/A, Dhaka",     status: "Busy",        lat: 23.7330, lng: 90.4172, rating: 3.9, reviewCount: 15, price: 14, tax: 8,  confidence: "mixed",           reports: 10, about: "Central business district charger, peak hours are crowded." },
];

const stations = [];
for (let i = 0; i < stationSpecs.length; i++) {
  const s = stationSpecs[i];
  const payload = {
    name: s.name,
    address: s.address,
    status: s.status,
    availableIn: s.availableIn || "",
    latitude: s.lat,
    longitude: s.lng,
    location: { type: "Point", coordinates: [s.lng, s.lat] },
    rating: s.rating,
    reviewCount: s.reviewCount,
    pricePerHourValue: s.price,
    pricePerHour: await formatPricePerHour(s.price),
    taxPercent: s.tax,
    about: s.about,
    // Vary amenity count so list/detail cards aren't all identical.
    amenities: AMENITIES.slice(0, (i % 4) + 1),
    availableDates: DATES,
    slots: SLOTS,
    listingStatus: "approved",
    communityConfidence: s.confidence,
    communityReportsCount: s.reports,
    lastVerifiedAt: new Date(Date.now() - i * 36e5),
    images: [],
  };
  const doc = await NearestStationModel.findOneAndUpdate(
    { name: s.name },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  stations.push(doc);
}

// One pending host listing so the admin approval queue is not empty.
const pending = await NearestStationModel.findOneAndUpdate(
  { name: "Bashundhara Host Charger" },
  {
    $set: {
      name: "Bashundhara Host Charger",
      address: "Block C, Bashundhara R/A, Dhaka",
      status: "Available",
      latitude: 23.8203, longitude: 90.4265,
      location: { type: "Point", coordinates: [90.4265, 23.8203] },
      rating: 0, reviewCount: 0,
      pricePerHourValue: 7, pricePerHour: await formatPricePerHour(7), taxPercent: 5,
      about: "Private driveway charger submitted by a host — awaiting review.",
      ownerId: users[0]._id,
      listingStatus: "pending",
      amenities: [AMENITIES[0]],
      availableDates: DATES, slots: SLOTS, images: [],
    },
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
console.log(`stations: ${stations.length} approved + 1 pending (${pending.name})`);

// ── Bookings ─────────────────────────────────────────────────────────────
const bookingSpecs = [
  { user: 0, station: 0, date: "Fri, January 09, 2026", time: "10:30 AM", status: "Upcoming",  paid: true,  amount: 120, vehicle: "Tesla Model 3", plate: "DHA-12-3456", slotStart: "10:30 AM", slotEnd: "11:30 AM" },
  { user: 1, station: 2, date: "Thu, January 08, 2026", time: "02:30 PM", status: "Upcoming",  paid: false, amount: 90,  vehicle: "BYD Atto 3",    plate: "DHA-88-1122", slotStart: "02:30 PM", slotEnd: "03:30 PM" },
  { user: 0, station: 2, date: "Mon, January 05, 2026", time: "09:00 AM", status: "Completed", paid: true,  amount: 135, vehicle: "Tesla Model 3", plate: "DHA-12-3456", slotStart: "09:00 AM", slotEnd: "10:00 AM" },
  { user: 1, station: 1, date: "Sun, January 04, 2026", time: "12:00 PM", status: "Completed", paid: true,  amount: 100, vehicle: "BYD Atto 3",    plate: "DHA-88-1122", slotStart: "12:00 PM", slotEnd: "01:00 PM" },
  { user: 3, station: 4, date: "Sat, January 03, 2026", time: "04:30 PM", status: "Cancelled", paid: false, amount: 110, vehicle: "Hyundai Ioniq 5", plate: "DHA-45-7788", slotStart: "04:30 PM", slotEnd: "05:30 PM" },
  { user: 2, station: 5, date: "Fri, January 09, 2026", time: "12:00 PM", status: "Upcoming",  paid: true,  amount: 140, vehicle: "BMW i4",        plate: "DHA-33-9900", slotStart: "12:00 PM", slotEnd: "01:00 PM" },
];

// Re-running the seed recreates bookings with fresh _ids, so any charging
// session pointing at the previous run's bookings would be orphaned and keep
// inflating the dashboard's session count. Drop those first.
const staleBookings = await BookingModel.find(
  { vehiclePlate: { $in: bookingSpecs.map((b) => b.plate) } },
  { _id: 1 }
);
if (staleBookings.length) {
  await ChargingSessionModel.deleteMany({ bookingId: { $in: staleBookings.map((b) => b._id) } });
}
await BookingModel.deleteMany({ vehiclePlate: { $in: bookingSpecs.map((b) => b.plate) } });

const bookings = [];
for (const b of bookingSpecs) {
  const st = stations[b.station];
  const tax = Math.round((b.amount * (st.taxPercent || 0)) / 100);
  const doc = await BookingModel.create({
    userId: users[b.user]._id,
    stationId: st._id,
    stationName: st.name,
    address: st.address,
    vehicleName: b.vehicle,
    vehiclePlate: b.plate,
    connectorType: "Type 2",
    energyKwh: "110 kw/h",
    chargingSlot: "Slot A",
    chargerType: "CCS - 150 kW",
    date: b.date,
    time: b.time,
    slotStart: b.slotStart,
    slotEnd: b.slotEnd,
    chargingDuration: "60 minutes",
    amountEstimation: b.amount,
    tax,
    totalAmount: b.amount + tax,
    isPaid: b.paid,
    paymentGateway: b.paid ? "stripe" : "",
    paymentStatus: b.paid ? "paid" : "pending",
    paymentCardLast4: b.paid ? "4242" : "",
    transactionId: b.paid ? `seed_txn_${Math.random().toString(36).slice(2, 10)}` : "",
    status: b.status,
    hasArrived: b.status === "Completed",
  });
  bookings.push(doc);
}
console.log(`bookings: ${bookings.length}`);

// ── Charging sessions (for the two completed bookings) ───────────────────
const completed = bookings.filter((b) => b.status === "Completed");
await ChargingSessionModel.deleteMany({ bookingId: { $in: completed.map((b) => b._id) } });

for (const b of completed) {
  await ChargingSessionModel.create({
    bookingId: b._id,
    userId: b.userId,
    stationId: b.stationId,
    stationName: b.stationName,
    address: b.address,
    slotLabel: "Slot A",
    connectorType: "Type 2",
    chargingDuration: "60 Min",
    sessionTime: b.time,
    batteryPercent: 92,
    kwhUsed: 31.5,
    timeRemainingMs: 0,
    status: "Completed",
    startedAt: new Date(Date.now() - 864e5),
    stoppedAt: new Date(Date.now() - 864e5 + 36e5),
    energyDelivered: 31.5,
    costPerKwh: 0.75,
    totalAmount: b.totalAmount,
  });
}

// One live session so the "in charging" screen has something to show.
const liveBooking = bookings.find((b) => b.status === "Upcoming" && b.isPaid);
if (liveBooking) {
  await ChargingSessionModel.findOneAndUpdate(
    { bookingId: liveBooking._id },
    {
      $set: {
        bookingId: liveBooking._id,
        userId: liveBooking.userId,
        stationId: liveBooking.stationId,
        stationName: liveBooking.stationName,
        address: liveBooking.address,
        slotLabel: "Slot A",
        connectorType: "Type 2",
        chargingDuration: "60 Min",
        sessionTime: liveBooking.time,
        batteryPercent: 64,
        kwhUsed: 18.2,
        timeRemainingMs: 18 * 60 * 1000,
        status: "Charging",
        startedAt: new Date(Date.now() - 22 * 60 * 1000),
        costPerKwh: 0.75,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
console.log(`charging sessions: ${completed.length} completed + ${liveBooking ? 1 : 0} live`);

// ── Reviews ──────────────────────────────────────────────────────────────
const reviewSpecs = [
  { user: 0, station: 0, rating: 5, workingStatus: "working",           description: "Fast and reliable, plugged in and charging within a minute." },
  { user: 1, station: 0, rating: 4, workingStatus: "working",           description: "Good location, but the parking bay was tight." },
  { user: 0, station: 2, rating: 5, workingStatus: "working",           description: "Best charger in Dhanmondi. Never had a failed session here." },
  { user: 2, station: 2, rating: 5, workingStatus: "working",           description: "Clean, well lit, and the staff were helpful." },
  { user: 1, station: 1, rating: 3, workingStatus: "partially_working", description: "Only two of the six bays were actually functional." },
  { user: 3, station: 3, rating: 2, workingStatus: "not_working",       description: "Connector would not lock. Had to drive to another station." },
  { user: 2, station: 4, rating: 4, workingStatus: "working",           description: "Solid overnight depot charging, good value." },
];

await ReviewModel.deleteMany({ stationId: { $in: stations.map((s) => String(s._id)) } });

for (const r of reviewSpecs) {
  await ReviewModel.create({
    userId: users[r.user]._id,
    stationId: String(stations[r.station]._id), // ReviewModel stores stationId as String
    rating: r.rating,
    workingStatus: r.workingStatus,
    description: r.description,
  });
}
console.log(`reviews: ${reviewSpecs.length}`);

// Station cards read `rating`/`reviewCount` off the station document, but the
// detail page counts the Review collection — so hand-picked values make the
// same station read "4.6 · 2 reviews". Derive both from what was just written.
for (const st of stations) {
  const agg = await ReviewModel.aggregate([
    { $match: { stationId: String(st._id) } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = agg[0] || {};
  await NearestStationModel.updateOne(
    { _id: st._id },
    { $set: { rating: Math.round(avg * 10) / 10, reviewCount: count } }
  );
}
console.log("station rating/reviewCount recomputed from seeded reviews");

console.log(`\nSeed login for all seeded users: password "${PASSWORD}"`);
await mongoose.disconnect();
