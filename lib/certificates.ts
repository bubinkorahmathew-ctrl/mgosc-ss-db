import type { CertificateType } from "@/lib/supabase/types";

export const CERTIFICATE_TYPES: CertificateType[] =
  ["completion", "merit", "attendance", "participation", "memory_verse", "custom"];

export const CERT_LABELS: Record<CertificateType, string> = {
  completion: "Completion", merit: "Merit", attendance: "Attendance", participation: "Participation",
  memory_verse: "Memory verse", custom: "Custom",
};

export const DEFAULT_TITLES: Record<CertificateType, string> = {
  completion: "Certificate of Completion",
  merit: "Certificate of Merit",
  attendance: "Certificate of Attendance",
  participation: "Certificate of Participation",
  memory_verse: "Certificate of Achievement",
  custom: "Certificate",
};

export const PLACEHOLDERS = ["student_name", "class", "year", "exam", "rank"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export const PLACEHOLDER_HELP: Record<Placeholder, string> = {
  student_name: "student's name",
  class: "Sunday School class",
  year: "academic year",
  exam: "exam name (merit) or activity title (participation)",
  rank: "rank in the exam, e.g. 1st",
};

/** Replace {placeholders}. Unknown ones are left as typed; missing values become "". */
export function fillTemplate(template: string, vars: Partial<Record<Placeholder, string>>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    (PLACEHOLDERS as readonly string[]).includes(key) ? (vars[key as Placeholder] ?? "") : m)
    .replace(/[ \t]+/g, " ").trim();
}

/** Placeholders a wording uses that this certificate cannot fill. */
export function unfilledPlaceholders(template: string, vars: Partial<Record<Placeholder, string>>): Placeholder[] {
  const used = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    .filter((k): k is Placeholder => (PLACEHOLDERS as readonly string[]).includes(k));
  return [...new Set(used)].filter((k) => !vars[k]);
}
