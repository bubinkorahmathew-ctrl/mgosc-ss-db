import Link from "next/link";
import { cn } from "@/lib/utils";
import { COLOR_SET, ICON_SET, type IconColor, type IconName } from "./icons";

export type Tile = { href: string; label: string; icon: IconName; color: IconColor; sub?: string; badge?: number };

/** One rounded icon, coloured like the menu. Also used for the preview in Settings. */
export function TileIcon({ icon, color, className }: { icon: IconName; color: IconColor; className?: string }) {
  const Icon = ICON_SET[icon].icon;
  return (
    <span className={cn("flex size-16 items-center justify-center rounded-2xl shadow-sm", COLOR_SET[color].tile, className)}>
      <Icon className="size-8" aria-hidden />
    </span>
  );
}

/** The home page: one icon per section, like a phone's app screen. */
export function IconTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {tiles.map((t) => (
        <li key={t.href}>
          <Link href={t.href}
            className="flex h-full flex-col items-center gap-2 rounded-2xl p-3 text-center transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted">
            <span className="relative">
              <TileIcon icon={t.icon} color={t.color} />
              {!!t.badge && (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-red-600 px-1.5 text-xs leading-5 font-semibold text-white">
                  {t.badge > 99 ? "99+" : t.badge}
                  <span className="sr-only"> new</span>
                </span>
              )}
            </span>
            <span className="text-sm leading-tight font-medium">{t.label}</span>
            {t.sub && <span className="text-xs leading-tight text-muted-foreground">{t.sub}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
