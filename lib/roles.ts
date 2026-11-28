/**
 * What each role may do, as enforced by lib/db/policies.ts, lib/db/rules.ts and the server
 * actions. Shown on the User rights page; keep it in step with those files.
 */
export type RightLevel = "yes" | "own" | "no";

export const ROLES = [
  { key: "super", label: "Super admin", about: "The first is created with npm run super-admin; more on the Users page. Everything, including roles and settings." },
  { key: "admin", label: "Admin", about: "Given by a super admin on the Users page, permanently or until a date (then a teacher again). All school work." },
  { key: "teacher", label: "Teacher", about: "Added on the Users page. Only the classes ticked for them this year." },
] as const;

export const RIGHTS: { label: string; super: RightLevel; admin: RightLevel; teacher: RightLevel }[] = [
  { label: "Give or remove admin and super admin roles, temporary admin access; user rights, school settings, signature, menu icons", super: "yes", admin: "no", teacher: "no" },
  { label: "Teacher accounts, designations, invites and class assignment", super: "yes", admin: "yes", teacher: "no" },
  { label: "Academic years, classes, subjects and exams", super: "yes", admin: "yes", teacher: "no" },
  { label: "Approve or reject registrations", super: "yes", admin: "yes", teacher: "no" },
  { label: "Add students (one by one or bulk upload)", super: "yes", admin: "yes", teacher: "own" },
  { label: "Edit, move or deactivate students; promotion", super: "yes", admin: "yes", teacher: "no" },
  { label: "Attendance, exam attendance, marks and activities (incl. bulk upload)", super: "yes", admin: "yes", teacher: "own" },
  { label: "Change attendance more than 14 days old", super: "yes", admin: "yes", teacher: "no" },
  { label: "See calculated toppers", super: "yes", admin: "yes", teacher: "own" },
  { label: "Confirm toppers; grade scale and pass marks", super: "yes", admin: "yes", teacher: "no" },
  { label: "Clear a saved mark", super: "yes", admin: "yes", teacher: "no" },
  { label: "Issue or revoke certificates", super: "yes", admin: "yes", teacher: "no" },
  { label: "View and download certificates, report cards and reports", super: "yes", admin: "yes", teacher: "own" },
  { label: "Charity collection (teachers: own class and themselves, and only their own entries)", super: "yes", admin: "yes", teacher: "own" },
  { label: "Receipts, vouchers, events, cash book and account reports; void entries", super: "yes", admin: "yes", teacher: "no" },
  { label: "Currency", super: "yes", admin: "no", teacher: "no" },
];
