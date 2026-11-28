import { describe, expect, it } from "vitest";
import { ADMIN_NAV, styleNav, TEACHER_NAV } from "@/components/layout/nav-config";
import { ICON_NAMES, ICON_SET } from "@/components/layout/icons";
import { navStyleSchema, readNavStyle } from "@/lib/validation/menu-icons";
import { RIGHTS } from "@/lib/roles";

describe("menu icons", () => {
  it("every built-in section uses a known icon", () => {
    for (const n of [...ADMIN_NAV, ...TEACHER_NAV]) expect(ICON_NAMES).toContain(n.icon);
    expect(Object.values(ICON_SET).every((i) => typeof i.icon === "object" || typeof i.icon === "function")).toBe(true);
  });

  it("stores only changes from the built-in look", () => {
    const parsed = navStyleSchema.parse({
      "/admin/students": { icon: "church", color: "purple" },
      "/admin/classes": { icon: "classes", color: "indigo" }, // unchanged
      "/teacher/marks": { icon: "trophy", color: "amber" },
    });
    expect(parsed).toEqual({ "/admin/students": { icon: "church", color: "purple" }, "/teacher/marks": { icon: "trophy", color: "amber" } });
  });

  it.each([
    ["unknown section", { "/admin/../x": { icon: "star", color: "red" } }],
    ["unknown icon", { "/admin/students": { icon: "skull", color: "red" } }],
    ["unknown colour", { "/admin/students": { icon: "star", color: "bg-red-500 x" } }],
    ["extra keys", { "/admin/students": { icon: "star", color: "red", label: "Hacked" } }],
    ["not an object", "students"],
  ])("refuses %s", (_label, input) => {
    expect(navStyleSchema.safeParse(input).success).toBe(false);
  });

  it("reads saved choices leniently and applies them to the menu", () => {
    const style = readNavStyle({
      "/admin/students": { icon: "church", color: "purple" },
      "/admin/users": { icon: "nope", color: "red" },
      "/elsewhere": { icon: "star", color: "red" },
    });
    expect(style).toEqual({ "/admin/students": { icon: "church", color: "purple" } });
    expect(readNavStyle(null)).toEqual({});
    expect(readNavStyle("[]")).toEqual({});
    const nav = styleNav(ADMIN_NAV, style);
    expect(nav.find((n) => n.href === "/admin/students")).toMatchObject({ label: "Students", icon: "church", color: "purple" });
    expect(nav.find((n) => n.href === "/admin/users")).toMatchObject({ icon: "teachers", color: "purple" });
    expect(nav.map((n) => n.href)).toEqual(ADMIN_NAV.map((n) => n.href));
  });

  it("only the super admin row has the settings rights", () => {
    const top = RIGHTS[0];
    expect([top.super, top.admin, top.teacher]).toEqual(["yes", "no", "no"]);
  });
});
