"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { changeOwnPassword } from "@/actions/teacher";
import { changePasswordSchema } from "@/lib/validation/staff";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";

const schema = z.object({ current: z.string().min(1, "Enter your current password.") }).and(changePasswordSchema);
type Values = z.infer<typeof schema>;

export function ChangePasswordForm() {
  const [pending, start] = useTransition();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { current: "", password: "", confirm: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => start(async () => {
    const res = await changeOwnPassword(values);
    if (!res.ok) {
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof Values, { message: v[0] });
      toast.error(res.error);
      return;
    }
    toast.success("Password changed. Use the new password next time you sign in.");
    form.reset();
  }));

  return (
    <Card className="max-w-md">
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field id="current" label="Current password" required error={errors.current?.message}>
            <Input id="current" type="password" autoComplete="current-password" {...form.register("current")} />
          </Field>
          <Field id="password" label="New password" required error={errors.password?.message} hint="At least 8 characters.">
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
