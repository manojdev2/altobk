
import cookieParser from "cookie-parser";
import express from "express";
import mongoose from "mongoose";
import path from "path";
import helmet from "helmet";
import hpp from "hpp";
import rateLimit from "express-rate-limit";
import router from "./routes/routes.js";
import adminRouter from "./routes/adminRoutes.js";
import paymentRouter from "./routes/paymentRoutes.js";
import { corsMiddleware } from "./utils/corsMiddel.js";
import { setupSwagger } from "./config/swagger.js";
import { MONGO_URL } from "./config/config.js";

// Custom mongo sanitize for Express 5 (req.query is read-only)
const sanitizeValue = (val) => {
  if (typeof val === "string" && val.startsWith("$")) return "";
  if (typeof val === "object" && val !== null) {
    for (const key of Object.keys(val)) {
      if (key.startsWith("$")) delete val[key];
      else val[key] = sanitizeValue(val[key]);
    }
  }
  return val;
};
const mongoSanitize = (req, _res, next) => {
  if (req.body) sanitizeValue(req.body);
  if (req.params) sanitizeValue(req.params);
  next();
};

const app = express();

// Deployed behind a reverse proxy (Vercel/Lambda, or nginx in the Docker
// setup) — without this, express-rate-limit can't trust X-Forwarded-For and
// throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request.
app.set("trust proxy", 1);

// Connect to MongoDB here (not in index.js) — on Vercel, this app.js module
// is imported directly as the serverless handler, so index.js's app.listen()
// bootstrap never actually runs in production. Mongoose buffers commands by
// default, so requests just wait until this resolves rather than failing.
app.locals.mongoUrlDiagnostic = MONGO_URL
  ? `len=${MONGO_URL.length} prefix="${MONGO_URL.slice(0, 12)}"`
  : `MISSING (typeof=${typeof MONGO_URL})`;

if (mongoose.connection.readyState === 0) {
  mongoose.connection.on("error", (err) => console.error("Mongoose connection error:", err));
  mongoose
    .connect(MONGO_URL, { family: 4, serverSelectionTimeoutMS: 30000 })
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => {
      console.error("MongoDB initial connection failed:", err.message);
      let reasonDetail = "";
      try {
        if (err.reason?.servers) {
          reasonDetail = [...err.reason.servers.values()]
            .map((s) => s.error?.message || s.type)
            .join(" | ");
        }
      } catch {}
      app.locals.lastDbError = `${err.message}${reasonDetail ? " :: " + reasonDetail : ""}`;
    });
}

// Security Middleware
app.use(cookieParser());
app.use(helmet());
app.use(corsMiddleware);
app.use(hpp());

// Parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(mongoSanitize);

// Serve uploaded images as static files → /uploads/filename.jpg
app.use("/uploads", express.static(path.resolve("uploads")));

// Swagger API Docs (before rate limiter so docs are always accessible)
setupSwagger(app);

// Rate Limiting (skip Swagger routes)
const limit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  skip: (req) => req.path.startsWith("/api-docs"),
});
app.use(limit);

app.set('etag', false);

// Health check — public, unauthenticated, used by the admin app's status page.
app.get("/api/v1/health", (req, res) => {
  res.json({
    status: "ok",
    dbConnected: mongoose.connection.readyState === 1,
    dbReadyState: mongoose.connection.readyState,
    lastDbError: app.locals.lastDbError || null,
    mongoUrlDiagnostic: app.locals.mongoUrlDiagnostic,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/v1', router);
app.use('/api/v1', adminRouter);
app.use('/api/v1', paymentRouter);  // SSLCommerz callbacks + Stripe webhook + payment status polling

// Global error handler (Express 5)
app.use(function errorHandler(err, req, res, next) {
  console.error("ERROR HANDLER:", err);
  return res.status(500).json({ status: "fail", message: err.message || "Internal server error." });
});

export default app;
