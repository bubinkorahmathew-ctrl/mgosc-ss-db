import "server-only";
import { queryAs } from "./access";

export const CERT_NO_PATTERN = /^CERT-\d{4}-\d{4,6}$/;

export function normaliseCertNo(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return CERT_NO_PATTERN.test(v) ? v : null;
}

/** Public (no user): only validity, type, date and name are exposed. */
export async function verifyCertificate(no: string) {
  const dbc = queryAs(null);
  const { data, error } = await dbc.call((db) => db.verifyCertificate(no));
  if (error) throw error;
  return data;
}
