import { jwtVerify, SignJWT } from "jose";

export const AUTH_COOKIE_NAME = "osso_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionRole = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "ACCOUNTANT" | "INVESTOR" | "WAREHOUSE";

export type SessionPayload = {
  userId: string;
};

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "change-this-secret-in-production",
);

export async function signSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });

  return payload as SessionPayload;
}
