/**
 * ════════════════════════════════════════════════════════════
 * PAYMENT SERVICE — SSLCommerz + Stripe
 * ════════════════════════════════════════════════════════════
 *
 * Two gateways available:
 *   1. SSLCommerz  → redirect-based flow (sandbox / live)
 *   2. Stripe      → PaymentIntent + client_secret flow
 *
 * Two payment scenarios:
 *   A. Booking payment   → POST /Bookings/:id/payment
 *   B. Extension payment → POST /ChargingSession/:id/pay
 *
 * Keys are loaded from DB (AppSettingsModel) with env-var fallback.
 * Admin can update keys at runtime via PUT /admin/settings.
 */

import SSLCommerzPayment from "sslcommerz-lts";
import Stripe from "stripe";
import crypto from "crypto";
import AppSettingsModel from "../models/AppSettingsModel.js";
import {
  SSLCOMMERZ_STORE_ID,
  SSLCOMMERZ_STORE_PASSWORD,
  SSLCOMMERZ_IS_LIVE,
  STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY,
  BACKEND_URL,
} from "../config/config.js";

// ── Cache for DB settings (refreshed every 60s) ──
let _cachedSettings = null;
let _cacheTime      = 0;
const CACHE_TTL     = 60_000; // 1 minute

/**
 * Load settings from DB, falling back to env vars.
 * Cached for 60s to avoid hitting DB on every payment request.
 */
const loadSettings = async () => {
  const now = Date.now();
  if (_cachedSettings && now - _cacheTime < CACHE_TTL) return _cachedSettings;

  try {
    const s = await AppSettingsModel.getSettings();

    // Helper: use DB value only if it's a real credential (not corrupted by old mask bug)
    const useIfValid = (dbVal, envFallback) => {
      if (!dbVal) return envFallback || "";
      // Old mask format was "xxxxxxxx...yyyy" — skip corrupted values
      if (dbVal.includes("...") && dbVal.length < 20) return envFallback || "";
      return dbVal;
    };

    _cachedSettings = {
      stripeEnabled:        s.stripeEnabled,
      sslcommerzEnabled:    s.sslcommerzEnabled,
      savedCardEnabled:     s.savedCardEnabled,
      // DB value first (admin panel manages), env var as fallback
      stripePublishableKey: useIfValid(s.stripePublishableKey, STRIPE_PUBLISHABLE_KEY),
      stripeSecretKey:      useIfValid(s.stripeSecretKey, STRIPE_SECRET_KEY),
      sslStoreId:           useIfValid(s.sslStoreId, SSLCOMMERZ_STORE_ID),
      sslStorePassword:     useIfValid(s.sslStorePassword, SSLCOMMERZ_STORE_PASSWORD),
      sslIsLive:            s.sslIsLive            ?? SSLCOMMERZ_IS_LIVE     ?? false,
      currencyCode:         s.currencyCode         || "BDT",
      currencySymbol:       s.currencySymbol       || "",
      currencyIcon:         s.currencyIcon         || "",
      sslMinAmount:         s.sslMinAmount          ?? 10,
      stripeMinAmount:      s.stripeMinAmount       ?? 100,
    };

    // If currencySymbol is missing/empty, derive a sensible default from currencyCode
    if (!_cachedSettings.currencySymbol) {
      const symbolMap = {
        BDT:"৳", INR:"₹", USD:"$", EUR:"€", GBP:"£", JPY:"¥", CNY:"¥",
        AED:"د.إ", SAR:"﷼", MYR:"RM", SGD:"S$", AUD:"A$", CAD:"C$",
        PKR:"₨", LKR:"₨", NPR:"₨", THB:"฿", KRW:"₩", TRY:"₺", ZAR:"R",
      };
      _cachedSettings.currencySymbol = symbolMap[_cachedSettings.currencyCode] || _cachedSettings.currencyCode;
    }

    // If currencyIcon is missing/empty, derive from currencyCode
    if (!_cachedSettings.currencyIcon) {
      const iconMap = {
        BDT:"currency_taka", INR:"currency_rupee", USD:"attach_money",
        EUR:"euro", GBP:"currency_pound", JPY:"currency_yen", CNY:"currency_yuan",
        PKR:"currency_rupee", LKR:"currency_rupee", NPR:"currency_rupee",
      };
      _cachedSettings.currencyIcon = iconMap[_cachedSettings.currencyCode] || "payments";
    }
    _cacheTime = now;
  } catch {
    // DB not ready yet — fall back to env vars
    _cachedSettings = {
      stripeEnabled:        true,
      sslcommerzEnabled:    true,
      savedCardEnabled:     true,
      stripePublishableKey: STRIPE_PUBLISHABLE_KEY || "",
      stripeSecretKey:      STRIPE_SECRET_KEY      || "",
      sslStoreId:           SSLCOMMERZ_STORE_ID    || "",
      sslStorePassword:     SSLCOMMERZ_STORE_PASSWORD || "",
      sslIsLive:            SSLCOMMERZ_IS_LIVE     || false,
      currencyCode:         "BDT",
      currencySymbol:       "৳",
      currencyIcon:         "currency_taka",
      sslMinAmount:         10,
      stripeMinAmount:      100,
    };
    _cacheTime = now;
  }
  return _cachedSettings;
};

/** Force-clear the cache (called when admin updates settings) */
export const clearSettingsCache = () => { _cachedSettings = null; _cacheTime = 0; };

// ── Stripe publishable key (sent to Flutter for SDK init) ──
export const getStripePublishableKey = async () => {
  const s = await loadSettings();
  return s.stripePublishableKey;
};

// ── Get full public settings (for GetPaymentMethodService) ──
export const getPaymentSettings = async () => {
  return loadSettings();
};

// ════════════════════════════════════════════════════════════
//  SSLCommerz helpers
// ════════════════════════════════════════════════════════════

/**
 * Initiate an SSLCommerz session and return the GatewayPageURL.
 *
 * @param {Object} opts
 * @param {string} opts.paymentType  - "booking" | "session"
 * @param {string} opts.referenceId  - bookingId or sessionId
 * @param {number} opts.amount       - total amount
 * @param {string} opts.customerName
 * @param {string} opts.customerEmail
 * @param {string} opts.customerPhone
 * @param {string} opts.productName  - e.g. station name
 * @returns {{ status, gatewayUrl, transactionId }}
 */
export const initSSLCommerz = async (opts) => {
  const settings = await loadSettings();

  if (!settings.sslcommerzEnabled) {
    return { status: "fail", message: "SSLCommerz is currently disabled by admin." };
  }

  const {
    paymentType,
    referenceId,
    amount,
    customerName,
    customerEmail,
    customerPhone,
    productName,
  } = opts;

  if (amount < settings.sslMinAmount) {
    return { status: "fail", message: `Minimum payment amount is ${settings.currencySymbol}${settings.sslMinAmount} for SSLCommerz. Current amount: ${settings.currencySymbol}${amount}` };
  }

  // Unique transaction id
  const tran_id = `${paymentType}_${referenceId}_${Date.now()}`;

  const data = {
    total_amount:    amount,
    currency:        settings.currencyCode,
    tran_id,
    success_url:     `${BACKEND_URL}/api/v1/payment/sslcommerz/success`,
    fail_url:        `${BACKEND_URL}/api/v1/payment/sslcommerz/fail`,
    cancel_url:      `${BACKEND_URL}/api/v1/payment/sslcommerz/cancel`,
    ipn_url:         `${BACKEND_URL}/api/v1/payment/sslcommerz/ipn`,
    shipping_method: "NO",
    product_name:    productName || "EV Charging",
    product_category:"Service",
    product_profile: "non-physical-goods",
    cus_name:        customerName  || "Customer",
    cus_email:       customerEmail || "customer@email.com",
    cus_phone:       customerPhone || "01700000000",
    cus_add1:        "Dhaka",
    cus_city:        "Dhaka",
    cus_country:     "Bangladesh",
    cus_postcode:    "1000",
    // value_a stores paymentType, value_b stores referenceId for IPN
    value_a:         paymentType,
    value_b:         referenceId,
  };

  const sslcz = new SSLCommerzPayment(
    settings.sslStoreId,
    settings.sslStorePassword,
    settings.sslIsLive,
  );

  const apiResponse = await sslcz.init(data);

  if (apiResponse?.GatewayPageURL) {
    return {
      status:        "Success",
      gatewayUrl:    apiResponse.GatewayPageURL,
      transactionId: tran_id,
    };
  }

  return {
    status:  "fail",
    message: apiResponse?.failedreason || "SSLCommerz session init failed.",
  };
};

/**
 * Validate an SSLCommerz IPN notification.
 * @param {Object} body - req.body from IPN
 * @returns {boolean}
 */
export const validateSSLCommerzIPN = async (body) => {
  try {
    const settings = await loadSettings();
    const sslcz = new SSLCommerzPayment(
      settings.sslStoreId,
      settings.sslStorePassword,
      settings.sslIsLive,
    );
    const valid = await sslcz.validate(body);
    return valid;
  } catch {
    return false;
  }
};

// ════════════════════════════════════════════════════════════
//  Stripe helpers
// ════════════════════════════════════════════════════════════

/**
 * Create a Stripe PaymentIntent.
 * Flutter app will use the client_secret to confirm on-device.
 *
 * @param {Object} opts
 * @param {string} opts.paymentType  - "booking" | "session"
 * @param {string} opts.referenceId  - bookingId or sessionId
 * @param {number} opts.amount       - amount (smallest unit = paisa)
 * @param {string} opts.customerEmail
 * @returns {{ status, clientSecret, paymentIntentId }}
 */
export const createStripePaymentIntent = async (opts) => {
  const settings = await loadSettings();

  if (!settings.stripeEnabled) {
    return { status: "fail", message: "Stripe is currently disabled by admin." };
  }

  if (!settings.stripeSecretKey) {
    return { status: "fail", message: "Stripe is not configured." };
  }

  const stripe = new Stripe(settings.stripeSecretKey);

  const { paymentType, referenceId, amount, customerEmail } = opts;

  if (amount < settings.stripeMinAmount) {
    return { status: "fail", message: `Minimum payment amount for Stripe is ${settings.currencySymbol}${settings.stripeMinAmount}. Current amount: ${settings.currencySymbol}${amount}. Please use SSLCommerz for smaller amounts.` };
  }

  // Stripe expects amount in smallest currency unit (paisa for BDT)
  const amountInSmallest = Math.round(amount * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount:   amountInSmallest,
    currency: settings.currencyCode.toLowerCase(),
    metadata: {
      paymentType,
      referenceId,
    },
    receipt_email: customerEmail || undefined,
    payment_method_types: ["card"],
  });

  return {
    status:          "Success",
    clientSecret:    paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
};

/**
 * Verify a Stripe webhook event.
 * Uses STRIPE_WEBHOOK_SECRET env var if set.
 * @param {Buffer} rawBody
 * @param {string} signature - req.headers['stripe-signature']
 * @returns {Object|null} Stripe event or null
 */
export const verifyStripeWebhook = async (rawBody, signature) => {
  const settings = await loadSettings();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!settings.stripeSecretKey || !webhookSecret) return null;
  try {
    const stripe = new Stripe(settings.stripeSecretKey);
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return null;
  }
};

/**
 * Retrieve a PaymentIntent to check its status.
 * @param {string} paymentIntentId
 * @returns {Object} Stripe PaymentIntent
 */
export const retrieveStripePaymentIntent = async (paymentIntentId) => {
  const settings = await loadSettings();
  if (!settings.stripeSecretKey) return null;
  const stripe = new Stripe(settings.stripeSecretKey);
  return stripe.paymentIntents.retrieve(paymentIntentId);
};
