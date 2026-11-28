import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

/** Static page: the database is only touched by the form's server action, never while rendering. */
export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot your password?" intro="Enter the email you sign in with. We'll email you a link to choose a new password.">
      <ForgotForm />
    </AuthCard>
  );
}
