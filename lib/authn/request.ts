import "server-only";
import { cookies, headers } from "next/headers";
import { clientIp } from "@/lib/rate-limit";
import { clearedCookie, SESSION_COOKIE, sessionCookie } from "./cookie";
import type { Client } from "./login";
import type { NewSession } from "./session";

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Server actions and route handlers only. */
export async function setSessionCookie(session: NewSession) {
  (await cookies()).set(sessionCookie(session));
}

export async function clearSessionCookie() {
  (await cookies()).set(clearedCookie());
}

export async function requestClient(): Promise<Client> {
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt) throw new Error("RATE_LIMIT_SALT is not set");
  return { ip: clientIp(await headers()), salt };
}
