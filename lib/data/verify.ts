import "server-only";
import { createClient } from "@/lib/db/server";

export const CERT_NO_PATTERN = /^CERT-\d{4}-\d{4,6}$/;

export function normaliseCertNo(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return CERT_NO_PATTERN.test(v) ? v : null;
}

/** Calls the public verify_certificate() function: only validity, type, date and name are exposed. */
export async function verifyCertificate(no: string) {
  const dbc = await createClient();
  const { data, error } = await dbc.call((db) => db.verifyCertificate(no));
  if (error) throw error;
  return data;
}
