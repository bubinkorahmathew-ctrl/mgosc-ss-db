/** Signed-in users for calling lib/repo in tests, as lib/auth would hand them over. */
import type { SessionUser } from "@/lib/authn/login";
import type { UserRole } from "@/lib/db/types";

/** role is the effective role (as loadSessionUser gives it). */
export function viewer(id: string, role: UserRole = "super_admin", superAdmin = role === "super_admin"): SessionUser {
  return {
    id, email: `${id}@test.invalid`, superAdmin, mustChangePassword: false,
    profile: { id, full_name: "Test", phone: null, twelfth_passed_year: null, role, active: true, created_at: new Date(0).toISOString(), designation: null },
  };
}
