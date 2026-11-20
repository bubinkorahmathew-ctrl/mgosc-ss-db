export const APP_NAME = "The StudentMasterDB";
export const APP_SHORT_NAME = "StudentMasterDB";
export const TIME_ZONE = "Asia/Kolkata";

export const SCHOOL_CLASSES = [
  "LKG",
  "UKG",
  ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`),
] as const;

export type Role = "headmaster" | "teacher";
