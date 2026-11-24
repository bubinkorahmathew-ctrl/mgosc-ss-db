import { z } from "zod";
import { requiredText, uuid } from "./common";

export const prayerUnitSchema = z.object({
  /** absent for a new unit */
  id: uuid.optional(),
  name: requiredText("Prayer unit name", 120),
  active: z.boolean().default(true),
});

export const deletePrayerUnitSchema = z.object({ id: uuid });
