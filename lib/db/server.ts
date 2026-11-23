import "server-only";
import { getUserDb } from "@/lib/auth";
import { createQueryClient } from "./query";

/** Database client acting as the signed-in user (or a visitor): the policies apply. */
export async function createClient() {
  return createQueryClient(await getUserDb());
}
