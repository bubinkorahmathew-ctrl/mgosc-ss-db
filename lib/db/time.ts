/** YYYY-MM-DD in Asia/Kolkata (TiDB itself runs in UTC). */
export function todayIST(now: Date): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
