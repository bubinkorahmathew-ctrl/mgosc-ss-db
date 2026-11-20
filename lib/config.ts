export const APP_NAME = "MGOSC SS DB Hub";
export const APP_SHORT_NAME = "SS DB Hub";
export const TIME_ZONE = "Asia/Kolkata";

export const SCHOOL_CLASSES = [
  "LKG",
  "UKG",
  ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`),
] as const;

export type Role = "headmaster" | "teacher";
