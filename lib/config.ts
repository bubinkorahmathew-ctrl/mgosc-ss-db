export const APP_NAME = "The StudentMasterDB";
export const APP_SHORT_NAME = "StudentMasterDB";
export const TIME_ZONE = "Asia/Kolkata";

/** How many days back a teacher may still mark or change attendance. Admins: any date. */
export const TEACHER_ATTENDANCE_DAYS = 14;

/** Placeholders written by migration 20261125000000 into records that lacked these details. */
export const NOT_ASSIGNED_PRAYER_UNIT = "00000000-0000-4000-8000-000000000001";
export const FATHER_NAME_PLACEHOLDER = "Not given";

export const SCHOOL_CLASSES = [
  "LKG",
  "UKG",
  ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`),
] as const;

export type Role = "headmaster" | "teacher";
