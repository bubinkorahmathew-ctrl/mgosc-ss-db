"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { changeOwnPassword } from "@/actions/auth";
import { changePasswordSchema, PASSWORD_MIN, type ChangePasswordInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";

/** `forced`: replacing a temporary password; goes to the home page afterwards. */
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: "", password: "", confirm: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => start(async () => {
    const res = await changeOwnPassword(values);
    if (!res.ok) {
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof ChangePasswordInput, { message: v[0] });
      toast.error(res.error);
      return;
    }
    toast.success("Password changed. Use the new password next time you sign in.");
    form.reset();
    if (forced && res.data) router.replace(res.data.home);
  }));

  return (
    <Card className="max-w-md">
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field id="current" label={forced ? "Temporary password" : "Current password"} required error={errors.current?.message}>
            <Input id="current" type="password" autoComplete="current-password" {...form.register("current")} />
          </Field>
          <Field id="password" label="New password" required error={errors.password?.message}
            hint={`At least ${PASSWORD_MIN} characters. A short sentence is easy to remember.`}>
            <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field id="confirm" label="Repeat new password" required error={errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <Loader2 className="animate-spin" />} Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
