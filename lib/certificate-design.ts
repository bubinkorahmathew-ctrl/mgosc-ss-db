/**
 * How each certificate type looks in the certificate design (components/certificate).
 * class_topper and attendance_topper are listed ahead of the toppers feature that adds them.
 */
import type { CertificateType } from "@/lib/db/types";

export type DesignType = CertificateType | "class_topper" | "attendance_topper";
export type Accent = "navy" | "burgundy" | "teal";

const ACCENT: Record<DesignType, Accent> = {
  merit: "navy", completion: "navy", participation: "navy", memory_verse: "navy", custom: "navy",
  class_topper: "burgundy",
  attendance: "teal", attendance_topper: "teal",
};

const SUBTITLE: Record<Exclude<DesignType, "custom">, string> = {
  merit: "OF MERIT",
  completion: "OF COMPLETION",
  participation: "OF PARTICIPATION",
  memory_verse: "OF ACHIEVEMENT",
  class_topper: "OF EXCELLENCE - CLASS TOPPER",
  attendance: "OF ATTENDANCE",
  attendance_topper: "OF ATTENDANCE",
};

export function certificateAccent(type: DesignType): Accent {
  return ACCENT[type] ?? "navy";
}

/**
 * The line under CERTIFICATE. A custom certificate takes it from its title:
 * "Certificate of Appreciation" -> "OF APPRECIATION", "Best Singer" -> "BEST SINGER".
 */
export function certificateSubtitle(type: DesignType, title: string): string {
  if (type !== "custom") return SUBTITLE[type] ?? "OF ACHIEVEMENT";
  const t = title.replace(/\s+/g, " ").trim();
  const m = /^certificate\b\s*(of\b)?\s*(.*)$/i.exec(t);
  const rest = m ? m[2] : t;
  if (!rest) return "OF ACHIEVEMENT";
  return `${m?.[1] ? "OF " : ""}${rest}`.toUpperCase().slice(0, 48);
}

/** "24 November 2026" */
export function issueDateText(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${isoDate}T00:00:00Z`));
}
