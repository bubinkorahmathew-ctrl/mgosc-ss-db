"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { z } from "zod";
import { submitRegistration } from "@/actions/registration";
import { registrationSchema } from "@/lib/validation/registration";
import { PersonalFieldsFieldset } from "@/components/form/personal-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type In = z.input<typeof registrationSchema>;
type Out = z.output<typeof registrationSchema>;

export function RegistrationForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>();
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { baptised: false, website: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setServerErrors(undefined);
      const res = await submitRegistration(values);
      if (res.ok) {
        router.push("/register/success");
      } else {
        setServerErrors(res.fieldErrors);
        toast.error(res.error);
      }
    }),
  );

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <PersonalFieldsFieldset register={form.register} errors={form.formState.errors}
            serverErrors={serverErrors} />

          {/* Honeypot: hidden from people and screen readers; bots tend to fill it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
          </div>

          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Submit registration
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
