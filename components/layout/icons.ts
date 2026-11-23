import {
  Award, Baby, Bell, BookOpen, Bookmark, CalendarCheck, ChartPie, Church, ClipboardList, Cross, FileBarChart,
  FileText, Flag, Folder, Gift, Globe, GraduationCap, Heart, House, Image, Inbox, KeyRound, Layers,
  LayoutDashboard, Library, Music, NotebookPen, PencilLine, School, Settings, ShieldCheck, Smile, Sparkles,
  Star, Sun, Trophy, Upload, UserCog, UserRound, Users, type LucideIcon,
} from "lucide-react";

/** Icons the super admin can pick for each section. Keys are stored in the database: never rename one. */
export const ICON_SET = {
  dashboard: { icon: LayoutDashboard, label: "Dashboard" },
  inbox: { icon: Inbox, label: "Inbox" },
  students: { icon: Users, label: "People" },
  classes: { icon: School, label: "School" },
  teachers: { icon: UserCog, label: "Staff" },
  exams: { icon: BookOpen, label: "Book" },
  reportcards: { icon: FileText, label: "Document" },
  reports: { icon: FileBarChart, label: "Report" },
  certificates: { icon: Award, label: "Award" },
  promotion: { icon: GraduationCap, label: "Graduation" },
  settings: { icon: Settings, label: "Settings" },
  attendance: { icon: CalendarCheck, label: "Calendar" },
  marks: { icon: PencilLine, label: "Pencil" },
  activities: { icon: Sparkles, label: "Sparkles" },
  account: { icon: UserRound, label: "Person" },
  upload: { icon: Upload, label: "Upload" },
  shield: { icon: ShieldCheck, label: "Shield" },
  church: { icon: Church, label: "Church" },
  cross: { icon: Cross, label: "Cross" },
  heart: { icon: Heart, label: "Heart" },
  star: { icon: Star, label: "Star" },
  bell: { icon: Bell, label: "Bell" },
  bookmark: { icon: Bookmark, label: "Bookmark" },
  clipboard: { icon: ClipboardList, label: "Checklist" },
  music: { icon: Music, label: "Music" },
  trophy: { icon: Trophy, label: "Trophy" },
  smile: { icon: Smile, label: "Smile" },
  home: { icon: House, label: "Home" },
  layers: { icon: Layers, label: "Layers" },
  library: { icon: Library, label: "Library" },
  notebook: { icon: NotebookPen, label: "Notebook" },
  chart: { icon: ChartPie, label: "Chart" },
  folder: { icon: Folder, label: "Folder" },
  image: { icon: Image, label: "Picture" },
  key: { icon: KeyRound, label: "Key" },
  globe: { icon: Globe, label: "Globe" },
  flag: { icon: Flag, label: "Flag" },
  gift: { icon: Gift, label: "Gift" },
  sun: { icon: Sun, label: "Sun" },
  baby: { icon: Baby, label: "Child" },
} satisfies Record<string, { icon: LucideIcon; label: string }>;

export type IconName = keyof typeof ICON_SET;
export const ICON_NAMES = Object.keys(ICON_SET) as [IconName, ...IconName[]];

/** Full class names, so Tailwind keeps them. `tile` = icon bubble, `text` = menu icon. */
export const COLOR_SET = {
  blue: { label: "Blue", tile: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", text: "text-blue-600 dark:text-blue-400", swatch: "bg-blue-500" },
  sky: { label: "Sky", tile: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300", text: "text-sky-600 dark:text-sky-400", swatch: "bg-sky-500" },
  teal: { label: "Teal", tile: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300", text: "text-teal-600 dark:text-teal-400", swatch: "bg-teal-500" },
  green: { label: "Green", tile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", text: "text-emerald-600 dark:text-emerald-400", swatch: "bg-emerald-500" },
  amber: { label: "Amber", tile: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", text: "text-amber-600 dark:text-amber-400", swatch: "bg-amber-500" },
  orange: { label: "Orange", tile: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300", text: "text-orange-600 dark:text-orange-400", swatch: "bg-orange-500" },
  red: { label: "Red", tile: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", text: "text-red-600 dark:text-red-400", swatch: "bg-red-500" },
  pink: { label: "Pink", tile: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300", text: "text-pink-600 dark:text-pink-400", swatch: "bg-pink-500" },
  purple: { label: "Purple", tile: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300", text: "text-purple-600 dark:text-purple-400", swatch: "bg-purple-500" },
  indigo: { label: "Indigo", tile: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300", text: "text-indigo-600 dark:text-indigo-400", swatch: "bg-indigo-500" },
  slate: { label: "Grey", tile: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300", text: "text-slate-600 dark:text-slate-400", swatch: "bg-slate-500" },
} as const;

export type IconColor = keyof typeof COLOR_SET;
export const COLOR_NAMES = Object.keys(COLOR_SET) as [IconColor, ...IconColor[]];
