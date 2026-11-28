"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import type { z } from "zod";
import { signIn } from "@/actions/auth";
import { signInSchema } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

type In = z.input<typeof signInSchema>;
type Out = z.output<typeof signInSchema>;

const field = cn(
  "h-12 w-full rounded-xl border border-[#183B70]/15 bg-white px-4 text-[15px] text-[#14233f] shadow-sm outline-none transition",
  "placeholder:text-slate-400 focus:border-[#183B70] focus:ring-4 focus:ring-[#183B70]/10",
  "aria-invalid:border-red-500 aria-invalid:ring-4 aria-invalid:ring-red-500/10",
);

export function LoginForm({ next }: { next?: string }) {
  const [pending, start] = useTransition();
  const [show, setShow] = useState(false);
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", next, remember: true },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await signIn(values);
      // on success the action redirects, so we only get here on failure
      if (res && !res.ok) toast.error(res.error);
    }),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-[#14233f]">Email address</label>
        <input id="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com"
          aria-invalid={!!errors.email} className={field} {...form.register("email")} />
        {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-[#14233f]">Password</label>
        <div className="relative">
          <input id="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Your password"
            aria-invalid={!!errors.password} className={cn(field, "pr-12")} {...form.register("password")} />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute inset-y-0 right-1 my-auto flex size-10 items-center justify-center rounded-lg text-slate-500 hover:text-[#183B70] focus-visible:outline-2 focus-visible:outline-[#183B70]">
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
        {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[#14233f]">
          <input type="checkbox" className="size-4 rounded accent-[#183B70]" {...form.register("remember")} />
          Remember me
        </label>
        <Link href="/forgot-password" className="flex min-h-11 items-center font-medium text-[#183B70] underline-offset-4 hover:underline">
          Forgot password?
        </Link>
      </div>

      <button type="submit" disabled={pending}
        className={cn(
          "relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#183B70] text-[15px] font-semibold tracking-wide text-white shadow-lg shadow-[#183B70]/25 transition",
          "hover:bg-[#14325f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C6A04A] disabled:opacity-70",
          "after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-[#C6A04A]",
        )}>
        {pending && <Loader2 className="size-5 animate-spin" />} Sign in
      </button>
      <p className="text-center text-xs text-slate-500">
        Without “Remember me” you are signed out after 12 hours.
      </p>
    </form>
  );
}
