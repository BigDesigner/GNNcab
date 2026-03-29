import jwt from "jsonwebtoken";

const rawJwtSecret = process.env["JWT_SECRET"]?.trim();
const JWT_EXPIRES_IN = process.env["JWT_EXPIRES_IN"] || "24h";

if (!rawJwtSecret) {
  throw new Error("JWT_SECRET environment variable is required.");
}

const JWT_SECRET: string = rawJwtSecret;

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as string & jwt.SignOptions["expiresIn"] });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
}
