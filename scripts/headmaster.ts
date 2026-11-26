/**
 * npm run super-admin   (npm run headmaster does the same)
 *
 * Creates the first headmaster (super admin), or resets that password if one exists.
 * There is no default password anywhere: it is typed here (hidden), or given in the environment.
 *
 * Without a terminal (e.g. a deploy step), set all three and it only ever CREATES, once:
 *   SEED_HEADMASTER_EMAIL, SEED_HEADMASTER_NAME, SEED_HEADMASTER_PASSWORD
 * Remove SEED_HEADMASTER_PASSWORD from the environment afterwards.
 *
 * Reads DATABASE_URL (from .env.local or the environment). Only the password's hash is sent.
 */
import fs from "node:fs";
import { z } from "zod";
import { createDrizzle } from "@/db/client";
import { createFirstHeadmaster, findHeadmasters, resetHeadmasterPassword } from "@/lib/authn/headmaster";
import { newPasswordSchema, PASSWORD_MIN } from "@/lib/validation/auth";
import { requiredText } from "@/lib/validation/common";

const emailSchema = z.email("Enter a valid email address.").max(254).trim().toLowerCase();

function prompt(question: string, { hidden = false } = {}): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(question);
  return new Promise((resolve, reject) => {
    let value = "";
    const done = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk: string) => {
      if (chunk.startsWith("\u001b")) return; // arrow and other control keys
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          done();
          return resolve(value);
        }
        if (ch === "\u0003") {
          done();
          return reject(new Error("Cancelled. Nothing was changed."));
        }
        if (ch === "\b" || ch === "\u007f") {
          if (!value) continue;
          value = [...value].slice(0, -1).join("");
          stdout.write("\b \b");
        } else if (ch >= " ") {
          value += ch;
          stdout.write(hidden ? "*" : ch);
        }
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    stdin.resume();
  });
}

async function ask<T>(question: string, schema: z.ZodType<T>, hidden = false): Promise<T> {
  for (;;) {
    const parsed = schema.safeParse((await prompt(question, { hidden })).trim());
    if (parsed.success) return parsed.data;
    console.log(parsed.error.issues[0].message);
  }
}

async function askNewPassword(): Promise<string> {
  for (;;) {
    const first = await ask(`New password (at least ${PASSWORD_MIN} characters): `, newPasswordSchema, true);
    if ((await prompt("Type it again: ", { hidden: true })) === first) return first;
    console.log("They don't match. Try again.");
  }
}

function fromEnvironment() {
  const { SEED_HEADMASTER_EMAIL: email, SEED_HEADMASTER_NAME: name, SEED_HEADMASTER_PASSWORD: password } = process.env;
  if (!email && !name && !password) return null;
  if (!email || !name || !password) throw new Error("Set all of SEED_HEADMASTER_EMAIL, SEED_HEADMASTER_NAME and SEED_HEADMASTER_PASSWORD, or none.");
  const check = <T>(schema: z.ZodType<T>, value: string, what: string) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new Error(`${what}: ${parsed.error.issues[0].message}`);
    return parsed.data;
  };
  return {
    email: check(emailSchema, email, "SEED_HEADMASTER_EMAIL"),
    full_name: check(requiredText("Name"), name.trim(), "SEED_HEADMASTER_NAME"),
    password: check(newPasswordSchema, password, "SEED_HEADMASTER_PASSWORD"),
  };
}

async function main() {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local"); // doesn't override the real environment
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (put it in .env.local).");
  const db = createDrizzle(url);
  const existing = await findHeadmasters(db);
  const seed = fromEnvironment();

  if (seed) {
    if (existing.length) {
      console.log("A super admin already exists. Nothing was changed.");
      return;
    }
    await createFirstHeadmaster(db, seed);
    console.log(`Done. Sign in at /login as ${seed.email}, then remove SEED_HEADMASTER_PASSWORD from the environment.`);
    return;
  }

  if (!process.stdin.isTTY) throw new Error("Run this in a terminal (it asks for a password), or set the SEED_HEADMASTER_* variables.");
  try {
    if (!existing.length) {
      console.log("No super admin yet. Creating the account.\n");
      const email = await ask("Email (used to sign in): ", emailSchema);
      const fullName = await ask("Full name: ", requiredText("Name"));
      await createFirstHeadmaster(db, { email, full_name: fullName, password: await askNewPassword() });
      console.log(`\nDone. Sign in at /login as ${email}`);
      return;
    }

    console.log("A super admin account already exists:");
    for (const h of existing) console.log(`  ${h.full_name} <${h.email}>`);
    console.log("\nTo reset that password, type its email (Ctrl+C to cancel).");
    const email = await ask("Email: ", emailSchema);
    if (!existing.some((h) => h.email === email)) throw new Error("That is not a super admin's email. Nothing was changed.");
    await resetHeadmasterPassword(db, email, await askNewPassword());
    console.log("\nPassword reset. Every device was signed out.");
  } finally {
    process.stdin.destroy(); // pause() alone can keep the process alive
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
});
