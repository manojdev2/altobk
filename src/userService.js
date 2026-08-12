
// Render (and most PaaS) inject PORT and health-check that exact port. With no
// fallback, an unset PORT makes app.listen() pick a random one and the platform
// marks the deploy unhealthy.
export const PORT = process.env.PORT || 3001;
export const MONGO_URL = process.env.MONGODB_URI;

// SSLCommerz
export const SSLCOMMERZ_STORE_ID       = process.env.SSLCOMMERZ_STORE_ID;
export const SSLCOMMERZ_STORE_PASSWORD  = process.env.SSLCOMMERZ_STORE_PASSWORD;
export const SSLCOMMERZ_IS_LIVE        = process.env.SSLCOMMERZ_IS_LIVE === "true";

// Stripe
export const STRIPE_SECRET_KEY         = process.env.STRIPE_SECRET_KEY;
export const STRIPE_PUBLISHABLE_KEY    = process.env.STRIPE_PUBLISHABLE_KEY;

// Backend base URL (for SSLCommerz callbacks)
export const BACKEND_URL               = process.env.BACKEND_URL || "http://localhost:3001";

// Gemini (AI station recommendation)
export const GEMINI_API_KEY            = process.env.GEMINI_API_KEY;

// Email (OTP delivery)
//
// All four have to be present for a send to work. With SMTP_HOST unset,
// nodemailer quietly targets localhost and every send dies as
// `connect ECONNREFUSED 127.0.0.1:587` — an error that reads like a mail-server
// outage rather than unset configuration.
export const isEmailConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.EMAIL_FROM
  );

// Escape hatch for environments with no mail provider. When email is
// unconfigured, the OTP is returned in the API response as `devOtp` instead of
// being sent, so signup and password reset still complete end to end.
//
// This makes email verification meaningless — anyone can claim any address —
// so it is opt-in, and it is ignored entirely once SMTP is configured. Do not
// enable it on a deployment serving real users.
export const DEV_EXPOSE_OTP            = process.env.DEV_EXPOSE_OTP === "true";