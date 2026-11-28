import type { IconColor, IconName } from "./icons";

export type { IconName as NavIcon } from "./icons";

export type NavItem = {
  href: string; label: string; icon: IconName; color: IconColor; primary?: boolean; superOnly?: boolean;
};

/** What the super admin chose in Settings: href -> icon and colour. */
export type NavStyle = Record<string, { icon: IconName; color: IconColor }>;

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", color: "blue", primary: true },
  { href: "/admin/registrations", label: "Registrations", icon: "inbox", color: "orange", primary: true },
  { href: "/admin/students", label: "Students", icon: "students", color: "blue", primary: true },
  { href: "/admin/attendance", label: "Attendance", icon: "attendance", color: "green" },
  { href: "/admin/import", label: "Bulk upload", icon: "upload", color: "teal" },
  { href: "/admin/classes", label: "Classes", icon: "classes", color: "indigo" },
  { href: "/admin/teachers", label: "Teachers", icon: "teachers", color: "purple" },
  { href: "/admin/exams", label: "Subjects & Exams", icon: "exams", color: "amber" },
  { href: "/admin/report-cards", label: "Report cards", icon: "reportcards", color: "sky" },
  { href: "/admin/toppers", label: "Toppers", icon: "trophy", color: "amber" },
  { href: "/admin/reports", label: "Reports", icon: "reports", color: "green", primary: true },
  { href: "/admin/certificates", label: "Certificates", icon: "certificates", color: "pink" },
  { href: "/admin/accounts", label: "Accounting", icon: "wallet", color: "teal" },
  { href: "/admin/promotion", label: "Promotion", icon: "promotion", color: "red" },
  { href: "/admin/admins", label: "Admins", icon: "teachers", color: "slate", superOnly: true },
  { href: "/admin/rights", label: "User rights", icon: "shield", color: "slate", superOnly: true },
  { href: "/admin/settings", label: "Settings", icon: "settings", color: "slate", superOnly: true },
  { href: "/admin/account", label: "Account", icon: "account", color: "slate" },
];

export const TEACHER_NAV: NavItem[] = [
  { href: "/teacher", label: "My class", icon: "dashboard", color: "blue", primary: true },
  { href: "/teacher/attendance", label: "Attendance", icon: "attendance", color: "green", primary: true },
  { href: "/teacher/marks", label: "Marks", icon: "marks", color: "amber", primary: true },
  { href: "/teacher/activities", label: "Activities", icon: "activities", color: "pink", primary: true },
  { href: "/teacher/students", label: "Students", icon: "students", color: "blue" },
  { href: "/teacher/import", label: "Bulk upload", icon: "upload", color: "teal" },
  { href: "/teacher/reports", label: "Reports", icon: "reports", color: "green" },
  { href: "/teacher/toppers", label: "Toppers", icon: "trophy", color: "amber" },
  { href: "/teacher/certificates", label: "Certificates", icon: "certificates", color: "pink" },
  { href: "/teacher/charity", label: "Charity", icon: "heart", color: "red" },
  { href: "/teacher/account", label: "Account", icon: "account", color: "slate" },
];

/** The menu with the super admin's icon choices applied (unknown entries are ignored). */
export function styleNav(nav: NavItem[], style: NavStyle | null | undefined): NavItem[] {
  if (!style) return nav;
  return nav.map((item) => (Object.hasOwn(style, item.href) ? { ...item, ...style[item.href] } : item));
}
