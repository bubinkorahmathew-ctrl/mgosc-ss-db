import "server-only";
import { headers } from "next/headers";
import { clientIp } from "@/lib/rate-limit";
import type { Client } from "./login";
import { authSecret } from "./next-auth";

/** The current request's device (address) for the lockout, with the key it is hashed with. */
export async function requestClient(): Promise<Client> {
  return { device: clientIp(await headers()), secret: authSecret() };
}
