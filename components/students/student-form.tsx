"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { z } from "zod";
import { createStudent, updateStudent } from "@/actions/students";
import { studentSchema } from "@/lib/validation/student";
import { PersonalFieldsFieldset } from "@/components/form/personal-fields";
import { Field, NativeSelect } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type In = z.input<typeof studentSchema>;
type Out = z.output<typeof studentSchema>;

export function StudentForm({ student, classes }: {
  student?: In & { id: string };
  classes: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>();
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(studentSchema),
    defaultValues: student ?? { baptised: false, status: "active", class_id: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setServerErrors(undefined);
      if (student) {
        const res = await updateStudent({ ...values, id: student.id });
        if (!res.ok) { setServerErrors(res.fieldErrors); toast.error(res.error); return; }
        toast.success("Student updated.");
        router.push(`/admin/students/${student.id}`);
      } else {
        const res = await createStudent(values);
        if (!res.ok) { setServerErrors(res.fieldErrors); toast.error(res.error); return; }
        toast.success(res.message ?? "Student added.");
        router.push(`/admin/students/${res.data!.id}`);
      }
    }),
  );

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <PersonalFieldsFieldset register={form.register} errors={errors} serverErrors={serverErrors} />
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <Field id="class_id" label="Sunday School class" error={errors.class_id?.message}>
              <NativeSelect id="class_id" {...form.register("class_id")}>
                <option value="">No class</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </NativeSelect>
            </Field>
            <Field id="status" label="Status" error={errors.status?.message}>
              <NativeSelect id="status" {...form.register("status")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="passed_out">Passed out</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} {student ? "Save changes" : "Add student"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
