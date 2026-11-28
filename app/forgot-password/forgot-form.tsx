"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { requestPasswordReset } from "@/actions/password-reset";
import { authButton, authField } from "@/components/auth/auth-card";

export function ForgotForm() {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [sent, setSent] = useState<string>();
  const [error, setError] = useState<string>();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(undefined);
      const res = await requestPasswordReset({ email, website });
      if (!res.ok) { setError(res.error); return; }
      setSent(res.message);
    });
  };

  if (sent) {
    return (
      <div role="status" className="flex gap-3 text-sm text-slate-700">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        <div className="space-y-2">
          <p>{sent}</p>
          <p className="text-slate-500">The link works once, for 1 hour. Check your spam folder if it doesn&apos;t arrive in a few minutes.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-[#14233f]">Email address</label>
        <input id="email" type="email" autoComplete="email" inputMode="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} className={authField} placeholder="you@example.com" />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      {/* honeypot: hidden from people, filled in by bots */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <button type="submit" disabled={pending || !email.trim()} className={authButton}>
        {pending && <Loader2 className="size-5 animate-spin" />} Send reset link
      </button>
    </form>
  );
}
