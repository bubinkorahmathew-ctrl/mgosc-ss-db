export type NavIcon =
  | "dashboard" | "inbox" | "students" | "classes" | "teachers" | "exams" | "reportcards"
  | "reports" | "certificates" | "promotion" | "settings" | "attendance" | "marks"
  | "activities" | "account";

export type NavItem = { href: string; label: string; icon: NavIcon; primary?: boolean };

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", primary: true },
  { href: "/admin/registrations", label: "Registrations", icon: "inbox", primary: true },
  { href: "/admin/students", label: "Students", icon: "students", primary: true },
  { href: "/admin/classes", label: "Classes", icon: "classes" },
  { href: "/admin/teachers", label: "Teachers", icon: "teachers" },
  { href: "/admin/exams", label: "Subjects & Exams", icon: "exams" },
  { href: "/admin/report-cards", label: "Report cards", icon: "reportcards" },
  { href: "/admin/reports", label: "Reports", icon: "reports", primary: true },
  { href: "/admin/certificates", label: "Certificates", icon: "certificates" },
  { href: "/admin/promotion", label: "Promotion", icon: "promotion" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export const TEACHER_NAV: NavItem[] = [
  { href: "/teacher", label: "My class", icon: "dashboard", primary: true },
  { href: "/teacher/attendance", label: "Attendance", icon: "attendance", primary: true },
  { href: "/teacher/marks", label: "Marks", icon: "marks", primary: true },
  { href: "/teacher/activities", label: "Activities", icon: "activities", primary: true },
  { href: "/teacher/students", label: "Students", icon: "students" },
  { href: "/teacher/reports", label: "Reports", icon: "reports" },
  { href: "/teacher/certificates", label: "Certificates", icon: "certificates" },
  { href: "/teacher/account", label: "Account", icon: "account" },
];
