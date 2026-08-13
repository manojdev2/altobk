import mongoose from "mongoose";

// Sub-schema: Amenity item (e.g. Restaurant, Wi-Fi, Maintenance, Shop)
const AmenitySchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },  // "Restaurant", "Wi-Fi", "Maintenance", "Shop"
    icon:  { type: String, default: "" },  // icon name or image URL
  },
  { _id: false }
);

// Sub-schema: Time slot (e.g. "10:30 AM to 11:30 AM")
const SlotSchema = new mongoose.Schema(
  {
    startTime: { type: String, default: "" }, // "10:30 AM"
    endTime:   { type: String, default: "" }, // "11:30 AM"
    isBooked:  { type: Boolean, default: false },
  },
  { _id: false }
);

const NearestStationSchema = new mongoose.Schema(
  {
    // ── Basic info (used for map pins & list cards) ──
    name:        { type: String, required: true },
    address:     { type: String, default: "" },
    images:      [{ type: String }],          // carousel images array
    status: {
      type: String,
      enum: ["Available", "Unavailable", "Busy"],
      default: "Available",
    },
    availableIn: { type: String, default: "" }, // "Available in 30 minutes" (Unavailable only)
    distanceKm:  { type: Number, default: 0 },
    durationMins:{ type: Number, default: 0 },
    rating:      { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },

    // ── Community-verified working status (from real completed charging sessions) ──
    communityConfidence: {
      type: String,
      enum: ["verified", "mixed", "reported_broken", "unknown"],
      default: "unknown",
    },
    communityReportsCount: { type: Number, default: 0 },
    lastVerifiedAt: { type: Date, default: null },

    // ── Self-serve host listings (vs. admin-created stations) ──
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,   // null = created by admin
    },
    listingStatus: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "approved",   // admin-created stations are live immediately
    },
    // Display string derived from pricePerHourValue + the configured currency
    // (see formatPricePerHour). Defaults empty rather than to a "$" literal so a
    // non-USD deployment never inherits the wrong symbol.
    pricePerHour:{ type: String, default: "" },       // e.g. "৳10/hr"
    pricePerHourValue: { type: Number, default: 0 }, // numeric for calculation e.g. 10
    taxPercent:  { type: Number, default: 0 },       // tax % e.g. 5 means 5%
    latitude:    { type: Number, default: 0 },
    longitude:   { type: Number, default: 0 },

    // ── GeoJSON point for geo-queries (auto-built from latitude/longitude) ──
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],   // [longitude, latitude]
        default: [0, 0],
      },
    },

    // ── Detail page fields ──
    about:       { type: String, default: "" }, // "About" section description
    amenities:   [AmenitySchema],               // Amenities list
    availableDates: [{ type: String }],         // ["06 Jan, Tue", "07 Jan, Wed", ...]
    slots:       [SlotSchema],                  // Time slots for booking

    // ── QR Code for this station ──
    qrToken:  { type: String, default: "" },   // unique token embedded in QR
    qrCode:   { type: String, default: "" },   // base64 data-URL of the QR image
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ── 2dsphere index for geo-queries ──
NearestStationSchema.index({ location: "2dsphere" });

// ── Auto-sync location from latitude / longitude before save ──
NearestStationSchema.pre("save", function () {
  if (this.latitude && this.longitude) {
    this.location = {
      type: "Point",
      coordinates: [this.longitude, this.latitude],   // GeoJSON = [lng, lat]
    };
  }
});

// ── Also sync on findOneAndUpdate ──
NearestStationSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate() || {};
  const lat = update?.latitude ?? update?.$set?.latitude;
  const lng = update?.longitude ?? update?.$set?.longitude;
  if (lat != null && lng != null) {
    const locationObj = { type: "Point", coordinates: [lng, lat] };
    if (update.$set) {
      update.$set.location = locationObj;
    } else {
      update.location = locationObj;
    }
    this.setUpdate(update);
  }
});

// ── Also sync on updateOne ──
NearestStationSchema.pre("updateOne", function () {
  const update = this.getUpdate() || {};
  const lat = update?.latitude ?? update?.$set?.latitude;
  const lng = update?.longitude ?? update?.$set?.longitude;
  if (lat != null && lng != null) {
    const locationObj = { type: "Point", coordinates: [lng, lat] };
    if (update.$set) {
      update.$set.location = locationObj;
    } else {
      update.location = locationObj;
    }
    this.setUpdate(update);
  }
});

const NearestStationModel = mongoose.model("NearestStation", NearestStationSchema);
export default NearestStationModel;
