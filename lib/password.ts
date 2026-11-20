import "server-only";
import { randomInt } from "node:crypto";

// No 0/O, 1/l/I to avoid confusion when the password is read out or typed on a phone.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** e.g. "Kp7x-m3Qa-9tRw" (12 random chars, ~68 bits). */
export function generateTempPassword(): string {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}
