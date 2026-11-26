/** The client's address: first X-Forwarded-For entry (set by Vercel), else X-Real-IP, else "unknown". */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}