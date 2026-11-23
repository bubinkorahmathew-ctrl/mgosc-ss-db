"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { SCHOOL_CLASSES } from "@/lib/config";
import type { PersonalFieldsInput } from "@/lib/validation/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxField, Field, NativeSelect, firstError } from "./field";

type Props = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  errors: FieldErrors<PersonalFieldsInput>;
  serverErrors?: Record<string, string[]>;
};

/** Fields shared by the public registration form and the student form. */
export function PersonalFieldsFieldset({ register, errors, serverErrors }: Props) {
  const e = (name: keyof PersonalFieldsInput) => firstError(errors[name] as { message?: string }, serverErrors, name);
  const invalid = (name: keyof PersonalFieldsInput) => !!e(name) || undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="full_name" label="Child's full name" required error={e("full_name")} className="sm:col-span-2">
        <Input id="full_name" autoComplete="off" aria-invalid={invalid("full_name")} {...register("full_name")} />
      </Field>
      <Field id="dob" label="Date of birth" required error={e("dob")}>
        {/* no `max` attribute: it would be frozen at build time in the prerendered form; Zod rejects future dates */}
        <Input id="dob" type="date" aria-invalid={invalid("dob")} {...register("dob")} />
      </Field>
      <Field id="gender" label="Gender" required error={e("gender")}>
        <NativeSelect id="gender" aria-invalid={invalid("gender")} {...register("gender")}>
          <option value="">Select…</option>
          <option value="male">Boy</option>
          <option value="female">Girl</option>
        </NativeSelect>
      </Field>
      <Field id="school_class" label="Class at school" required error={e("school_class")}>
        <NativeSelect id="school_class" aria-invalid={invalid("school_class")} {...register("school_class")}>
          <option value="">Select…</option>
          {SCHOOL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
      </Field>
      <Field id="school_name" label="School name" error={e("school_name")}>
        <Input id="school_name" aria-invalid={invalid("school_name")} {...register("school_name")} />
      </Field>
      <Field id="father_name" label="Father's name" error={e("father_name")}>
        <Input id="father_name" aria-invalid={invalid("father_name")} {...register("father_name")} />
      </Field>
      <Field id="mother_name" label="Mother's name" error={e("mother_name")}>
        <Input id="mother_name" aria-invalid={invalid("mother_name")} {...register("mother_name")} />
      </Field>
      <Field id="prayer_group" label="Prayer group name" error={e("prayer_group")} className="sm:col-span-2" hint="Optional">
        <Input id="prayer_group" autoComplete="off" aria-invalid={invalid("prayer_group")} {...register("prayer_group")} />
      </Field>
      <Field id="guardian_phone" label="Parent / guardian phone" required error={e("guardian_phone")}>
        <Input id="guardian_phone" type="tel" inputMode="tel" autoComplete="tel"
          aria-invalid={invalid("guardian_phone")} {...register("guardian_phone")} />
      </Field>
      <div className="flex items-end">
        <CheckboxField id="baptised" label="Baptised" {...register("baptised")} />
      </div>
      <Field id="address" label="Address" error={e("address")} className="sm:col-span-2">
        <Textarea id="address" rows={3} aria-invalid={invalid("address")} {...register("address")} />
      </Field>
    </div>
  );
}
