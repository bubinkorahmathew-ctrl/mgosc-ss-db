"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { resetPassword } from "@/actions/password-reset";
import { PASSWORD_MIN, resetPasswordSchema } from "@/lib/validation/auth";
import { authButton, authField } from "@/components/auth/auth-card";

export function ResetForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [done, setDone] = useState<string>();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const check = resetPasswordSchema.safeParse({ password, confirm });
    if (!check.success) {
      const f = check.error.flatten().fieldErrors;
      setErrors({ password: f.password?.[0], confirm: f.confirm?.[0] });
      return;
    }
    start(async () => {
      setErrors({});
      const res = await resetPassword({ token, password, confirm });
      if (!res.ok) { setErrors({ form: res.error }); return; }
      setDone(res.message);
    });
  };

  if (done) {
    return (
      <div role="status" className="space-y-4 text-sm text-slate-700">
        <p className="flex gap-2"><CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden /> {done}</p>
        <Link href="/login" className={authButton}>Sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-[#14233f]">New password</label>
        <div className="relative">
          <input id="password" type={show ? "text" : "password"} autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} className={`${authField} pr-12`} />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
            className="absolute inset-y-0 right-1 my-auto flex size-10 items-center justify-center rounded-lg text-slate-500 hover:text-[#183B70]">
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
        {errors.password ? <p className="text-sm text-red-600">{errors.password}</p>
          : <p className="text-xs text-slate-500">At least {PASSWORD_MIN} characters. A short sentence is easy to remember.</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium text-[#14233f]">Repeat new password</label>
        <input id="confirm" type={show ? "text" : "password"} autoComplete="new-password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} className={authField} />
        {errors.confirm && <p className="text-sm text-red-600">{errors.confirm}</p>}
      </div>
      {errors.form && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errors.form} <Link href="/forgot-password" className="font-medium underline">Get a new link</Link>
        </p>
      )}
      <button type="submit" disabled={pending} className={authButton}>
        {pending && <Loader2 className="size-5 animate-spin" />} Save new password
      </button>
    </form>
  );
}
