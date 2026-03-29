import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";

const app: Express = express();
const rawAllowedOrigins = process.env["ALLOWED_ORIGINS"]
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!rawAllowedOrigins?.length) {
  throw new Error("ALLOWED_ORIGINS environment variable is required and must contain at least one origin.");
}

const allowedOrigins: string[] = rawAllowedOrigins.map((origin) => {
  if (origin === "*") {
    throw new Error('ALLOWED_ORIGINS must not include wildcard "*".');
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`ALLOWED_ORIGINS contains an invalid origin: "${origin}"`);
  }

  // Browser Origin values for CORS are scheme + host + optional port only.
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(`ALLOWED_ORIGINS contains an unsafe origin value: "${origin}"`);
  }

  return parsed.origin;
});

// Trust the reverse proxy (for example Nginx). Required for:
// - express-rate-limit to read X-Forwarded-For correctly
// - req.ip to return the real client IP
app.set("trust proxy", 1);

// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// CORS — allow all origins in dev, restrict to comma-separated list in prod
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Keep body size small — no file uploads expected on this service
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// General rate limiter: 200 req / 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Too many requests, please slow down" },
});
app.use(limiter);

// Auth rate limiter: 15 attempts / 15 min per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { error: "TooManyRequests", message: "Too many authentication attempts, please try again later" },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// Admin endpoints: stricter rate limit
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Too many requests" },
});
app.use("/api/admin", adminLimiter);

app.use("/api", router);

// Central error handler — never leak stack traces to clients
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]", err.message, err.stack);
  res.status(500).json({ error: "InternalServerError", message: "An unexpected error occurred" });
});

export default app;
