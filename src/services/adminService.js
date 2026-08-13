import jwt from "jsonwebtoken";
import AdminModel from "../models/AdminModel.js";
import VehicleBrandModel from "../models/VehicleBrandModel.js";
import VehicleModelItemModel from "../models/VehicleModelItemModel.js";
import NearestStationModel from "../models/NearestStationModel.js";
import UserModel from "../models/UserModel.js";
import BookingModel from "../models/BookingModel.js";
import ChargingSessionModel from "../models/ChargingSessionModel.js";
import ReviewModel from "../models/ReviewModel.js";
import AppSettingsModel from "../models/AppSettingsModel.js";
import { clearSettingsCache } from "./paymentService.js";
import {
  SSLCOMMERZ_STORE_ID,
  SSLCOMMERZ_STORE_PASSWORD,
  STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY,
} from "../config/config.js";
import { generateStationQR, geocodeAddress, generateSlotsArray, generateNext7Dates, formatPricePerHour } from "../utils/stationHelpers.js";

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_SECRET_EXPIRES_IN });

// ════════════════════════════════════════════════════════════
// ADMIN AUTH
// ════════════════════════════════════════════════════════════

export const AdminLoginService = async (body) => {
  try {
    const { email, password } = body;
    if (!email || !password)
      return { status: "fail", message: "Email and password are required." };

    const admin = await AdminModel.findOne({ email: email.toLowerCase() });
    if (!admin) return { status: "fail", message: "Invalid email or password." };

    const match = await admin.comparePassword(password);
    if (!match) return { status: "fail", message: "Invalid email or password." };

    const token = signToken(admin._id);
    return {
      status: "Success",
      message: "Admin login successful.",
      token,
      data: { _id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// Seed first admin (called once if no admin exists)
export const SeedAdminService = async () => {
  try {
    const exists = await AdminModel.findOne();
    if (exists) return { status: "fail", message: "Admin already seeded." };
    const admin = await AdminModel.create({
      name: "Super Admin",
      email: "admin@uvcharging.com",
      password: "Admin@1234",
      role: "superadmin",
    });
    return { status: "Success", message: "Admin seeded.", data: { email: admin.email } };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ════════════════════════════════════════════════════════════

export const AdminDashboardService = async () => {
  try {
    const [users, bookings, stations, sessions, reviews, brands] = await Promise.all([
      UserModel.countDocuments(),
      BookingModel.countDocuments(),
      NearestStationModel.countDocuments(),
      ChargingSessionModel.countDocuments(),
      ReviewModel.countDocuments(),
      VehicleBrandModel.countDocuments(),
    ]);
    const revenue = await BookingModel.aggregate([
      { $match: { isPaid: true } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    return {
      status: "Success",
      data: {
        totalUsers:    users,
        totalBookings: bookings,
        totalStations: stations,
        totalSessions: sessions,
        totalReviews:  reviews,
        totalBrands:   brands,
        totalRevenue:  revenue[0]?.total || 0,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// VEHICLE BRANDS — CRUD
// ════════════════════════════════════════════════════════════

export const AdminGetBrandsService = async () => {
  try {
    const brands = await VehicleBrandModel.find().sort({ name: 1 });
    return { status: "Success", data: brands };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

export const AdminCreateBrandService = async (body) => {
  try {
    const { name, image } = body;
    if (!name) return { status: "fail", message: "Brand name is required." };
    const brand = await VehicleBrandModel.create({ name, image: image || "" });
    return { status: "Success", message: "Brand created.", data: brand };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

export const AdminUpdateBrandService = async (id, body) => {
  try {
    const brand = await VehicleBrandModel.findByIdAndUpdate(id, body, { new: true });
    if (!brand) return { status: "fail", message: "Brand not found." };
    return { status: "Success", message: "Brand updated.", data: brand };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

export const AdminDeleteBrandService = async (id) => {
  try {
    await VehicleBrandModel.findByIdAndDelete(id);
    await VehicleModelItemModel.deleteMany({ brandId: id });
    return { status: "Success", message: "Brand and its models deleted." };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// VEHICLE MODELS — CRUD
// ════════════════════════════════════════════════════════════

export const AdminGetModelsService = async (brandId) => {
  try {
    const filter = brandId ? { brandId } : {};
    const models = await VehicleModelItemModel.find(filter)
      .populate("brandId", "name")
      .sort({ name: 1 });
    return { status: "Success", data: models };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

export const AdminCreateModelService = async (body) => {
  try {
    const { brandId, name, image } = body;
    if (!brandId || !name) return { status: "fail", message: "brandId and name are required." };
    const brand = await VehicleBrandModel.findById(brandId);
    if (!brand) return { status: "fail", message: "Brand not found." };
    const model = await VehicleModelItemModel.create({ brandId, name, image: image || "" });
    return { status: "Success", message: "Model created.", data: model };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

export const AdminUpdateModelService = async (id, body) => {
  try {
    const model = await VehicleModelItemModel.findByIdAndUpdate(id, body, { new: true });
    if (!model) return { status: "fail", message: "Model not found." };
    return { status: "Success", message: "Model updated.", data: model };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

export const AdminDeleteModelService = async (id) => {
  try {
    await VehicleModelItemModel.findByIdAndDelete(id);
    return { status: "Success", message: "Model deleted." };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// STATIONS — CRUD
// ════════════════════════════════════════════════════════════

// ── Helper: compute date-wise isBooked for a station's slots ──────────────
const computeSlotsForDate = async (stationId, slots, date) => {
  if (!slots || slots.length === 0 || !date) return slots;
  const bookings = await BookingModel.find({
    stationId,
    date,
    status: { $ne: "Cancelled" },
  }).select("slotStart slotEnd");

  const bookedKeys = new Set(bookings.map((b) => `${b.slotStart}__${b.slotEnd}`));
  return slots.map((s) => ({
    startTime: s.startTime,
    endTime:   s.endTime,
    isBooked:  bookedKeys.has(`${s.startTime}__${s.endTime}`),
  }));
};

// ── Default amenities a station can have (admin picks from this list) ──
const DEFAULT_AMENITIES = [
  { label: "Restaurant", icon: "restaurant" },
  { label: "Wi-Fi",      icon: "wifi" },
  { label: "Maintenance", icon: "build" },
  { label: "Shop",       icon: "shopping_bag" },
  { label: "Restroom",   icon: "wc" },
  { label: "Parking",    icon: "local_parking" },
  { label: "Lounge",     icon: "weekend" },
  { label: "Coffee",     icon: "coffee" },
];

export const AdminGetAmenitiesListService = () => ({
  status: "Success",
  message: "Available amenity options.",
  data: DEFAULT_AMENITIES,
});

export const AdminGetStationsService = async () => {
  try {
    const stations = await NearestStationModel.find().sort({ createdAt: -1 });

    // For each station, auto-fill availableDates if blank
    const data = stations.map((s) => {
      const obj = s.toObject();
      if (!obj.availableDates || obj.availableDates.length === 0) {
        obj.availableDates = generateNext7Dates();
      }
      return obj;
    });

    return { status: "Success", data };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// Get single station by ID (admin)
export const AdminGetStationService = async (id, date) => {
  try {
    if (!id) return { status: "fail", message: "Station id is required." };
    const station = await NearestStationModel.findById(id);
    if (!station) return { status: "fail", message: "Station not found." };

    const obj = station.toObject();

    // Auto-fill availableDates if blank
    if (!obj.availableDates || obj.availableDates.length === 0) {
      obj.availableDates = generateNext7Dates();
    }

    // Compute date-wise slot availability
    const selectedDate = date || obj.availableDates[0] || "";
    obj.selectedDate = selectedDate;

    if (selectedDate && obj.slots?.length > 0) {
      obj.slots = await computeSlotsForDate(id, obj.slots, selectedDate);
    }

    // Booking summary for admin: count per date
    const bookingCounts = await BookingModel.aggregate([
      { $match: { stationId: station._id.toString(), status: { $ne: "Cancelled" } } },
      { $group: { _id: "$date", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    obj.bookingCountsByDate = bookingCounts.map((b) => ({ date: b._id, count: b.count }));

    return {
      status: "Success",
      message: "Station retrieved successfully.",
      data: obj,
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

export const AdminCreateStationService = async (body) => {
  try {
    const { name, address } = body;
    if (!name || !address) return { status: "fail", message: "name and address are required." };

    // Auto-geocode: get lat/long from address using Google Maps API
    const geo = await geocodeAddress(address);
    if (geo) {
      body.latitude = geo.lat;
      body.longitude = geo.lng;
      if (!body.address || body.address === address) {
        body.address = geo.formattedAddress;
      }
    }

    // Auto-generate slots if slot config is provided (or use defaults)
    const startHour   = Number(body.startHour)   || 8;
    const endHour     = Number(body.endHour)     || 18;
    const intervalMin = Number(body.intervalMin)  || 30;
    body.slots = generateSlotsArray(startHour, endHour, intervalMin);

    // Auto-generate availableDates (next 7 days) so admin can see from day 1
    if (!body.availableDates || body.availableDates.length === 0) {
      body.availableDates = generateNext7Dates();
    }

    // Clean up slot config fields before saving
    delete body.startHour;
    delete body.endHour;
    delete body.intervalMin;

    // Derive the display string rather than trusting whatever the client typed,
    // so it always matches the configured currency.
    body.pricePerHour = await formatPricePerHour(body.pricePerHourValue);

    const station = await NearestStationModel.create(body);

    // Auto-generate QR code for the new station
    const { qrToken, qrCode } = await generateStationQR(station._id);
    station.qrToken = qrToken;
    station.qrCode  = qrCode;
    await station.save();

    return { status: "Success", message: `Station created with ${body.slots.length} slot(s).`, data: station };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

export const AdminUpdateStationService = async (id, body) => {
  try {
    // If address is being updated, auto-geocode to get new lat/long
    if (body.address) {
      const geo = await geocodeAddress(body.address);
      if (geo) {
        body.latitude = geo.lat;
        body.longitude = geo.lng;
        body.address = geo.formattedAddress;
      }
    }

    // Regenerate slots if slot config fields are provided
    if (body.startHour || body.endHour || body.intervalMin) {
      const startHour   = Number(body.startHour)   || 8;
      const endHour     = Number(body.endHour)     || 18;
      const intervalMin = Number(body.intervalMin)  || 30;
      body.slots = generateSlotsArray(startHour, endHour, intervalMin);
      delete body.startHour;
      delete body.endHour;
      delete body.intervalMin;
    }

    // Keep the display string in step with the numeric price whenever it moves.
    if (body.pricePerHourValue !== undefined) {
      body.pricePerHour = await formatPricePerHour(body.pricePerHourValue);
    } else {
      delete body.pricePerHour;
    }

    const station = await NearestStationModel.findByIdAndUpdate(id, body, { new: true });
    if (!station) return { status: "fail", message: "Station not found." };
    return { status: "Success", message: "Station updated.", data: station };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

export const AdminDeleteStationService = async (id) => {
  try {
    await NearestStationModel.findByIdAndDelete(id);
    return { status: "Success", message: "Station deleted." };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ── Regenerate QR Code for a station ───────────────────────────────────────
export const AdminRegenerateQRService = async (stationId) => {
  try {
    const station = await NearestStationModel.findById(stationId);
    if (!station) return { status: "fail", message: "Station not found." };

    const { qrToken, qrCode } = await generateStationQR(station._id);
    station.qrToken = qrToken;
    station.qrCode  = qrCode;
    await station.save();

    return {
      status: "Success",
      message: `QR code regenerated for "${station.name}".`,
      data: { stationId: station._id, stationName: station.name, qrToken, qrCode },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// STATION SLOTS — Auto-generate time slots for a station
// ════════════════════════════════════════════════════════════

/**
 * Generate slots for a station.
 * Body can optionally include:
 *   startHour  (default 8)   → first slot starts at 8:00 AM
 *   endHour    (default 18)  → last slot ends at 6:00 PM
 *   intervalMin(default 30)  → each slot is 30 minutes
 * All existing slots are replaced.
 */
export const AdminGenerateSlotsService = async (stationId, body = {}) => {
  try {
    const station = await NearestStationModel.findById(stationId);
    if (!station) return { status: "fail", message: "Station not found." };

    const startHour   = Number(body.startHour)   || 8;
    const endHour     = Number(body.endHour)     || 18;
    const intervalMin = Number(body.intervalMin)  || 30;

    if (startHour >= endHour) return { status: "fail", message: "startHour must be less than endHour." };
    if (intervalMin < 10 || intervalMin > 120) return { status: "fail", message: "intervalMin must be between 10 and 120." };

    const slots = generateSlotsArray(startHour, endHour, intervalMin);
    station.slots = slots;
    await station.save();

    return {
      status: "Success",
      message: `${slots.length} slot(s) generated for "${station.name}".`,
      data: { stationId: station._id, slotsCount: slots.length, slots },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// USERS — Read only
// ════════════════════════════════════════════════════════════

export const AdminGetUsersService = async () => {
  try {
    const users = await UserModel.find()
      .select("-password -otp -otpExpires")
      .sort({ createdAt: -1 });
    return { status: "Success", data: users };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

export const AdminDeleteUserService = async (id) => {
  try {
    await UserModel.findByIdAndDelete(id);
    return { status: "Success", message: "User deleted." };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// BOOKINGS — Read only
// ════════════════════════════════════════════════════════════

export const AdminGetBookingsService = async () => {
  try {
    const bookings = await BookingModel.find()
      .populate("userId", "fullName email")
      .sort({ createdAt: -1 });
    return { status: "Success", data: bookings };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// REVIEWS — Read only
// ════════════════════════════════════════════════════════════

export const AdminGetReviewsService = async () => {
  try {
    // ReviewModel.stationId is a String with no `ref`, so the usual
    // .populate("stationId", "name") silently returns the raw id string and the
    // admin table renders "—" for every row. Naming the model explicitly makes
    // mongoose cast the string to an ObjectId and resolve the station.
    const reviews = await ReviewModel.find()
      .populate("userId", "fullName email")
      .populate({ path: "stationId", model: NearestStationModel, select: "name" })
      .sort({ createdAt: -1 });
    return { status: "Success", data: reviews };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// APP SETTINGS — Payment keys, currency, gateway toggles
// ════════════════════════════════════════════════════════════

/**
 * GET /admin/settings — Return full settings (including secrets) to admin.
 * Secrets are masked for display; admin can update them.
 */
export const AdminGetSettingsService = async () => {
  try {
    const s = await AppSettingsModel.getSettings();

    // Helper: if DB value looks corrupted (from old mask bug "xxxx...yyyy"), use env var
    const fix = (dbVal, envVal) => {
      if (!dbVal) return envVal || "";
      if (dbVal.includes("...") && dbVal.length < 20) return envVal || "";
      if (dbVal === "****") return envVal || "";
      return dbVal;
    };

    const sslStoreId   = fix(s.sslStoreId,   SSLCOMMERZ_STORE_ID);
    const sslStorePass = fix(s.sslStorePassword, SSLCOMMERZ_STORE_PASSWORD);
    const stripePK     = fix(s.stripePublishableKey, STRIPE_PUBLISHABLE_KEY);
    const stripeSK     = fix(s.stripeSecretKey, STRIPE_SECRET_KEY);

    // Auto-fix corrupted DB values if env vars are available
    const autoFix = {};
    if (sslStoreId   !== s.sslStoreId)       autoFix.sslStoreId       = sslStoreId;
    if (sslStorePass !== s.sslStorePassword)  autoFix.sslStorePassword = sslStorePass;
    if (stripePK     !== s.stripePublishableKey) autoFix.stripePublishableKey = stripePK;
    if (stripeSK     !== s.stripeSecretKey)      autoFix.stripeSecretKey      = stripeSK;

    // Auto-fix empty currencySymbol / currencyIcon from currencyCode
    if (!s.currencySymbol) {
      const symbolMap = {
        BDT:"৳", INR:"₹", USD:"$", EUR:"€", GBP:"£", JPY:"¥", CNY:"¥",
        AED:"د.إ", SAR:"﷼", MYR:"RM", SGD:"S$", AUD:"A$", CAD:"C$",
        PKR:"₨", LKR:"₨", NPR:"₨", THB:"฿", KRW:"₩", TRY:"₺", ZAR:"R",
      };
      autoFix.currencySymbol = symbolMap[s.currencyCode] || s.currencyCode || "৳";
    }
    if (!s.currencyIcon) {
      const iconMap = {
        BDT:"currency_taka", INR:"currency_rupee", USD:"attach_money",
        EUR:"euro", GBP:"currency_pound", JPY:"currency_yen", CNY:"currency_yuan",
        PKR:"currency_rupee", LKR:"currency_rupee", NPR:"currency_rupee",
      };
      autoFix.currencyIcon = iconMap[s.currencyCode] || "payments";
    }

    if (Object.keys(autoFix).length > 0) {
      await AppSettingsModel.findOneAndUpdate(
        { key: "main" },
        { $set: autoFix }
      );
      clearSettingsCache();
    }

    return {
      status: "Success",
      message: "App settings retrieved.",
      data: {
        // Gateway toggles
        stripeEnabled:     s.stripeEnabled,
        sslcommerzEnabled: s.sslcommerzEnabled,
        savedCardEnabled:  s.savedCardEnabled,

        // Stripe credentials (admin manages both keys)
        stripePublishableKey: stripePK,
        stripeSecretKey:      stripeSK,

        // SSLCommerz credentials
        sslStoreId:       sslStoreId,
        sslStorePassword: sslStorePass,
        sslIsLive:        s.sslIsLive,

        // Currency
        currencyCode:   s.currencyCode,
        currencySymbol: autoFix.currencySymbol ?? s.currencySymbol,
        currencyIcon:   autoFix.currencyIcon   ?? s.currencyIcon,

        // Min amounts
        sslMinAmount:    s.sslMinAmount,
        stripeMinAmount: s.stripeMinAmount,

        updatedAt: s.updatedAt,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

/**
 * PUT /admin/settings — Update any/all settings fields.
 * Only provided fields are updated; omitted fields remain unchanged.
 */
export const AdminUpdateSettingsService = async (body) => {
  try {
    const allowedFields = [
      "stripeEnabled", "sslcommerzEnabled", "savedCardEnabled",
      "stripePublishableKey", "stripeSecretKey",
      "sslStoreId", "sslStorePassword", "sslIsLive",
      "currencyCode", "currencySymbol", "currencyIcon",
      "sslMinAmount", "stripeMinAmount",
    ];

    const updates = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return { status: "fail", message: "No valid fields provided to update." };
    }

    const s = await AppSettingsModel.findOneAndUpdate(
      { key: "main" },
      { $set: updates },
      { new: true, upsert: true, runValidators: true }
    );

    // Clear paymentService cache so new keys take effect immediately
    clearSettingsCache();

    return {
      status: "Success",
      message: "Settings updated successfully.",
      data: {
        stripeEnabled:        s.stripeEnabled,
        sslcommerzEnabled:    s.sslcommerzEnabled,
        savedCardEnabled:     s.savedCardEnabled,
        stripePublishableKey: s.stripePublishableKey,
        stripeSecretKey:      s.stripeSecretKey,
        sslStoreId:           s.sslStoreId,
        sslStorePassword:     s.sslStorePassword,
        sslIsLive:            s.sslIsLive,
        currencyCode:         s.currencyCode,
        currencySymbol:       s.currencySymbol,
        currencyIcon:         s.currencyIcon,
        sslMinAmount:         s.sslMinAmount,
        stripeMinAmount:      s.stripeMinAmount,
        updatedAt:            s.updatedAt,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};


