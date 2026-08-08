const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:5173",
  "https://alto-ev-admin-web.vercel.app",
  "https://uv-charging-admin.vercel.app",
  "https://uv-charging-admin.onrender.com",
  "https://admin.evcharging.naas-emart.com",
  "admin.evcharging.naas-emart.com",
  "https://*.naas-emart.com",
  process.env.FRONTEND_ORIGIN,
  process.env.FRONTEND_URL,
  process.env.NEXT_PUBLIC_SITE_URL,
].filter(Boolean);

const normalizeOrigin = (origin = "") => origin.trim().replace(/\/$/, "");

const wildcardToRegex = (origin) => {
  const escaped = origin.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `^${escaped.replace(/\\\*/g, ".*")}$`;
  return new RegExp(pattern);
};

const buildOriginRules = () => {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [];

  const aggregate = [...defaultOrigins, ...envOrigins];

  const rules = {
    allowAll: false,
    exact: new Set(),
    patterns: [],
  };

  aggregate.forEach((origin) => {
    if (!origin) return;
    if (origin === "*") {
      rules.allowAll = true;
      return;
    }

    const normalized = normalizeOrigin(origin);
    if (normalized.includes("*")) {
      rules.patterns.push(wildcardToRegex(normalized));
      return;
    }

    rules.exact.add(normalized);
  });

  return rules;
};

const originRules = buildOriginRules();

const isAllowedOrigin = (origin) => {
  if (!origin) return false;
  if (originRules.allowAll) return true;

  const normalized = normalizeOrigin(origin);
  if (originRules.exact.has(normalized)) return true;

  return originRules.patterns.some((regex) => regex.test(normalized));
};

export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;

  if (originRules.allowAll && origin) {
    res.header("Access-Control-Allow-Origin", origin);
  } else if (isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept"
  );
  res.header("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
};


// update the cors middleware to allow requests from the Flutter app (which has a different origin) and also allow credentials (cookies) to be sent. 
