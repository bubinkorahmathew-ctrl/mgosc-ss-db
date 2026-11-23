"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2, RotateCcw, Save } from "lucide-react";
import { saveMenuIcons } from "@/actions/settings";
import { cn } from "@/lib/utils";
import { COLOR_NAMES, COLOR_SET, ICON_NAMES, ICON_SET, type IconColor, type IconName } from "@/components/layout/icons";
import { TileIcon } from "@/components/layout/icon-tiles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Section = { href: string; label: string; icon: IconName; color: IconColor; defaultIcon: IconName; defaultColor: IconColor };
type Style = { icon: IconName; color: IconColor };

/** Super admin only (checked again on the server). */
export function MenuIconsForm({ groups }: { groups: { title: string; sections: Section[] }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const all = groups.flatMap((g) => g.sections);
  const [style, setStyle] = useState<Record<string, Style>>(
    () => Object.fromEntries(all.map((s) => [s.href, { icon: s.icon, color: s.color }])));
  const [open, setOpen] = useState<string | null>(null);

  const set = (href: string, patch: Partial<Style>) => setStyle((v) => ({ ...v, [href]: { ...v[href], ...patch } }));

  const save = () => start(async () => {
    const res = await saveMenuIcons(style);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.");
    router.refresh();
  });

  const resetAll = () => setStyle(Object.fromEntries(all.map((s) => [s.href, { icon: s.defaultIcon, color: s.defaultColor }])));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Menu icons</CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose the icon and colour of each section. They are used on the home page tiles and in the menu, for everyone.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{g.title}</h3>
            <ul className="divide-y rounded-xl border">
              {g.sections.map((s) => {
                const cur = style[s.href];
                const expanded = open === s.href;
                const changed = cur.icon !== s.defaultIcon || cur.color !== s.defaultColor;
                return (
                  <li key={s.href}>
                    <button type="button" aria-expanded={expanded} aria-controls={`mi-${s.href}`}
                      onClick={() => setOpen(expanded ? null : s.href)}
                      className="flex w-full items-center gap-3 p-2 text-left hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                      <TileIcon icon={cur.icon} color={cur.color} className="size-11 rounded-xl [&_svg]:size-6" />
                      <span className="flex-1 font-medium">{s.label}</span>
                      <span className="text-xs text-muted-foreground">{ICON_SET[cur.icon].label} · {COLOR_SET[cur.color].label}</span>
                      <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                    </button>
                    {expanded && (
                      <div id={`mi-${s.href}`} className="space-y-3 border-t bg-muted/20 p-3">
                        <fieldset>
                          <legend className="mb-2 text-sm font-medium">Icon</legend>
                          <div className="flex flex-wrap gap-1.5">
                            {ICON_NAMES.map((name) => {
                              const Icon = ICON_SET[name].icon;
                              const on = cur.icon === name;
                              return (
                                <button key={name} type="button" title={ICON_SET[name].label} aria-label={ICON_SET[name].label} aria-pressed={on}
                                  onClick={() => set(s.href, { icon: name })}
                                  className={cn("flex size-11 items-center justify-center rounded-lg border bg-background hover:bg-muted",
                                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                                    on && "border-primary ring-2 ring-primary")}>
                                  <Icon className="size-5" />
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                        <fieldset>
                          <legend className="mb-2 text-sm font-medium">Colour</legend>
                          <div className="flex flex-wrap gap-2">
                            {COLOR_NAMES.map((c) => {
                              const on = cur.color === c;
                              return (
                                <button key={c} type="button" title={COLOR_SET[c].label} aria-label={COLOR_SET[c].label} aria-pressed={on}
                                  onClick={() => set(s.href, { color: c })}
                                  className={cn("flex size-9 items-center justify-center rounded-full text-white",
                                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                                    COLOR_SET[c].swatch, on && "ring-2 ring-foreground ring-offset-2")}>
                                  {on && <Check className="size-4" />}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                        {changed && (
                          <Button variant="ghost" size="sm" onClick={() => set(s.href, { icon: s.defaultIcon, color: s.defaultColor })}>
                            <RotateCcw /> Back to the original
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save menu icons
          </Button>
          <Button variant="outline" onClick={resetAll} disabled={pending}><RotateCcw /> Original icons for all</Button>
        </div>
      </CardContent>
    </Card>
  );
}
