import mongoose from "mongoose";

/**
 * AppSettings — Singleton document
 *
 * Stores payment gateway credentials, currency config, and feature toggles.
 * Only ONE document will ever exist (enforced by key: "main").
 *
 * Admin can view / update via:
 *   GET  /api/v1/admin/settings
 *   PUT  /api/v1/admin/settings
 *
 * Flutter fetches safe (no-secret) subset via:
 *   GET  /api/v1/app/settings      (public, no auth)
 */

const AppSettingsSchema = new mongoose.Schema(
  {
    // Singleton key — always "main"
    key: { type: String, default: "main", unique: true },

    // ══════════════════════════════════
    //  PAYMENT GATEWAY TOGGLES
    // ══════════════════════════════════
    stripeEnabled:     { type: Boolean, default: true },
    sslcommerzEnabled: { type: Boolean, default: true },
    savedCardEnabled:  { type: Boolean, default: true },

    // ══════════════════════════════════
    //  STRIPE CREDENTIALS
    // ══════════════════════════════════
    stripePublishableKey: { type: String, default: "" },
    stripeSecretKey:      { type: String, default: "" },

    // ══════════════════════════════════
    //  SSLCOMMERZ CREDENTIALS
    // ══════════════════════════════════
    sslStoreId:       { type: String, default: "" },
    sslStorePassword: { type: String, default: "" },
    sslIsLive:        { type: Boolean, default: false },

    // ══════════════════════════════════
    //  CURRENCY SETTINGS
    // ══════════════════════════════════
    currencyCode:   { type: String, default: "BDT" },       // ISO 4217  e.g. BDT, USD, EUR
    currencySymbol: { type: String, default: "৳" },          // ৳, $, €, £
    currencyIcon:   { type: String, default: "currency_taka" }, // Material icon name for Flutter

    // ══════════════════════════════════
    //  MIN AMOUNTS PER GATEWAY
    // ══════════════════════════════════
    sslMinAmount:    { type: Number, default: 10 },
    stripeMinAmount: { type: Number, default: 100 },
  },
  { timestamps: true }
);

// ── Static: get (or auto-create) the singleton ──────────────────────────
AppSettingsSchema.statics.getSettings = async function () {
  let doc = await this.findOne({ key: "main" });
  if (!doc) {
    doc = await this.create({ key: "main" });
  }
  return doc;
};

const AppSettingsModel = mongoose.model("AppSettings", AppSettingsSchema);
export default AppSettingsModel;
