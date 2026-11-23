import { z } from "zod";
import { COLOR_NAMES, ICON_NAMES } from "@/components/layout/icons";
import { ADMIN_NAV, TEACHER_NAV, type NavStyle } from "@/components/layout/nav-config";

const SECTIONS = new Map([...ADMIN_NAV, ...TEACHER_NAV].map((n) => [n.href, n]));
const entry = z.strictObject({ icon: z.enum(ICON_NAMES), color: z.enum(COLOR_NAMES) });

/** From the Settings page: only known sections, known icons and colours. */
export const navStyleSchema = z.record(z.string(), entry)
  .refine((v) => Object.keys(v).every((href) => SECTIONS.has(href)), "Unknown section.")
  .transform((v): NavStyle => {
    // store only what differs from the built-in look, so later default changes still apply
    const out: NavStyle = {};
    for (const [href, style] of Object.entries(v)) {
      const base = SECTIONS.get(href)!;
      if (style.icon !== base.icon || style.color !== base.color) out[href] = style;
    }
    return out;
  });

/** From the database: lenient, anything unexpected is ignored rather than breaking the menu. */
export function readNavStyle(raw: unknown): NavStyle {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: NavStyle = {};
  for (const [href, value] of Object.entries(raw)) {
    if (!SECTIONS.has(href)) continue;
    const parsed = entry.safeParse(value);
    if (parsed.success) out[href] = parsed.data;
  }
  return out;
}
