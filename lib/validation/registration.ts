import { z } from "zod";
import { optionalText, personalFields, uuid } from "./common";

/** Public form. `website` is a hidden honeypot that humans never fill in. */
export const registrationSchema = personalFields.extend({
  website: z.string().optional(),
});
export type RegistrationInput = z.input<typeof registrationSchema>;

export const approveRegistrationSchema = z.object({
  registration_id: uuid,
  class_id: uuid.or(z.literal("")).refine((v) => v !== "", "Choose a class."),
});

export const rejectRegistrationSchema = z.object({
  registration_id: uuid,
  review_note: optionalText("Note", 500),
});
