
export const PORT = process.env.PORT;
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