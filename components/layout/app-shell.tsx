"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Award, BookOpen, CalendarCheck, ClipboardList, FileBarChart, FileText, GraduationCap,
  Inbox, LayoutDashboard, LogOut, Menu, PencilLine, School, Settings, Sparkles, UserCog,
  UserRound, Users, type LucideIcon,
} from "lucide-react";
import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";
import type { NavIcon, NavItem } from "./nav-config";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard, inbox: Inbox, students: Users, classes: School, teachers: UserCog,
  exams: BookOpen, reportcards: FileText, reports: FileBarChart, certificates: Award,
  promotion: GraduationCap, settings: Settings, attendance: CalendarCheck, marks: PencilLine,
  activities: Sparkles, account: UserRound,
};

function isActive(pathname: string, href: string, root: string) {
  return href === root ? pathname === root : pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ nav, root, pathname, onNavigate }: {
  nav: NavItem[]; root: string; pathname: string; onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href, root);
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted",
            )}>
            <Icon className="size-5 shrink-0" /> {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBox({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="px-1">
        <p className="truncate text-sm font-medium">{userName}</p>
        <p className="text-xs text-muted-foreground">{roleLabel}</p>
      </div>
      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full justify-start">
          <LogOut /> Sign out
        </Button>
      </form>
    </div>
  );
}

export function AppShell({
  appName, nav, root, userName, roleLabel, children,
}: {
  appName: string; nav: NavItem[]; root: string; userName: string; roleLabel: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = nav.filter((n) => n.primary).slice(0, 4);

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-4 lg:flex">
        <Link href={root} className="flex items-center gap-2 px-1 text-lg font-semibold text-primary">
          <Logo size={36} /> {appName}
        </Link>
        <div className="flex-1 overflow-y-auto"><NavLinks nav={nav} root={root} pathname={pathname} /></div>
        <UserBox userName={userName} roleLabel={roleLabel} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <Link href={root} className="flex min-w-0 items-center gap-2 font-semibold text-primary">
            <Logo size={30} /> <span className="truncate">{appName}</span>
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
              <Menu className="size-6" />
            </SheetTrigger>
            <SheetContent side="right" className="flex w-72 flex-col gap-4 p-4">
              <SheetHeader className="p-0"><SheetTitle>{appName}</SheetTitle></SheetHeader>
              <div className="flex-1 overflow-y-auto">
                <NavLinks nav={nav} root={root} pathname={pathname} onNavigate={() => setOpen(false)} />
              </div>
              <UserBox userName={userName} roleLabel={roleLabel} />
            </SheetContent>
          </Sheet>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-24 lg:px-8 lg:pt-8 lg:pb-8">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
          {primary.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href, root);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
                  active ? "text-primary font-semibold" : "text-muted-foreground")}>
                <Icon className="size-5" /> <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen(true)}
            className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground">
            <ClipboardList className="size-5" /> More
          </button>
        </nav>
      </div>
    </div>
  );
}
