import "server-only";
import type { NewSession } from "./session";

const secure = process.env.NODE_ENV === "production";

// __Host-: the browser only accepts it over HTTPS, for this exact host and path /
export const SESSION_COOKIE = secure ? "__Host-sms_session" : "sms_session";

const options = { httpOnly: true, secure, sameSite: "lax", path: "/" } as const;

export const sessionCookie = ({ token, expires }: NewSession) => ({ name: SESSION_COOKIE, value: token, expires, ...options });
// not cookies().delete(): clearing a __Host- cookie must repeat Secure and Path
export const clearedCookie = () => ({ name: SESSION_COOKIE, value: "", maxAge: 0, ...options });
