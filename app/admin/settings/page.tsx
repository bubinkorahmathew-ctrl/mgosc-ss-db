import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { readNavStyle } from "@/lib/validation/menu-icons";
import { ADMIN_NAV, styleNav, TEACHER_NAV, type NavItem } from "@/components/layout/nav-config";
import { PageHeader } from "@/components/page-header";
import { SettingsForm, SignatureUpload } from "./settings-form";
import { MenuIconsForm } from "./menu-icons-form";
import { PrayerUnitsForm } from "./prayer-units-form";
import { getPrayerUnits, prayerUnitUsage } from "@/lib/data/students";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  if (!(await requireRole("headmaster")).superAdmin) redirect("/admin");
  const [s, units, usage] = await Promise.all([getSettings(), getPrayerUnits(), prayerUnitUsage()]);
  const style = readNavStyle(s.nav_icons);
  const sections = (nav: NavItem[]) => styleNav(nav, style).map((n, i) => ({
    href: n.href, label: n.label, icon: n.icon, color: n.color, defaultIcon: nav[i].icon, defaultColor: nav[i].color,
  }));
  return (
    <>
      <PageHeader title="Settings" description="School details and certificate wording. The church banner is printed at the top of every report card and certificate." />
      <div className="space-y-6">
        <SignatureUpload url={s.signature_url} />
        <SettingsForm initial={{
          school_name: s.school_name, address: s.address ?? "", headmaster_name: s.headmaster_name ?? "",
          certificate_wording: s.certificate_wording,
        }} />
        <PrayerUnitsForm units={units.map((u) => ({ ...u, used: usage.get(u.id) ?? 0 }))} />
        <MenuIconsForm groups={[
          { title: "Admin menu", sections: sections(ADMIN_NAV) },
          { title: "Teacher menu", sections: sections(TEACHER_NAV) },
        ]} />
      </div>
    </>
  );
}
