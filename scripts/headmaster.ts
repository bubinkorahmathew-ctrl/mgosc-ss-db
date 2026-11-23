/**
 * npm run super-admin   (npm run headmaster does the same)
 *
 * Creates the super admin, or resets the super admin's password if one exists.
 * The password is typed here, hidden, and only its hash is sent to the database.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createFirstHeadmaster, findHeadmasters, resetHeadmasterPassword } from "@/lib/authn/headmaster";
import { configFromEnv, createDatabase, createPool, type TiDbConfig } from "@/lib/db/connection";
import { requiredText } from "@/lib/validation/common";

const MIN_LENGTH = 12;

function loadConfig(): TiDbConfig {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local"); // doesn't override the real environment
  if (process.env.TIDB_HOST) return configFromEnv();
  const file = path.resolve("tibcloud.txt");
  if (!fs.existsSync(file)) return configFromEnv(); // explains what is missing
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const field = (k: string) => lines[lines.indexOf(`${k}:`) + 1];
  // tibcloud.txt says "sys", TiDB's system schema; the app lives in its own database
  return {
    host: field("HOST"), port: Number(field("PORT")), user: field("USERNAME"), password: field("PASSWORD"),
    database: process.env.TIDB_DATABASE || "studentmasterdb",
  };
}

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

async function askNewPassword(): Promise<string> {
  for (;;) {
    const first = await prompt(`New password (at least ${MIN_LENGTH} characters): `, { hidden: true });
    if ([...first].length < MIN_LENGTH || first.length > 72) {
      console.log(`Use ${MIN_LENGTH} to 72 characters.`);
      continue;
    }
    if ((await prompt("Type it again: ", { hidden: true })) === first) return first;
    console.log("They don't match. Try again.");
  }
}

async function ask<T>(question: string, schema: z.ZodType<T>): Promise<T> {
  for (;;) {
    const parsed = schema.safeParse((await prompt(question)).trim());
    if (parsed.success) return parsed.data;
    console.log(parsed.error.issues[0].message);
  }
}

async function main() {
  if (!process.stdin.isTTY) throw new Error("Run this yourself in a terminal: it asks for a password.");
  const pool = createPool(loadConfig());
  try {
    const database = createDatabase(pool);
    const existing = await findHeadmasters(database);
    const email = z.email("Enter a valid email address.").max(254).toLowerCase();

    if (!existing.length) {
      console.log("No super admin yet. Creating the account.\n");
      const address = await ask("Email (used to sign in): ", email);
      const fullName = await ask("Full name: ", requiredText("Name"));
      await createFirstHeadmaster(database, { email: address, full_name: fullName, password: await askNewPassword() });
      console.log(`\nDone. Sign in at /login as ${address}`);
      return;
    }

    console.log("A super admin account already exists:");
    for (const h of existing) console.log(`  ${h.full_name} <${h.email}>`);
    console.log("\nTo reset that password, type its email (Ctrl+C to cancel).");
    const address = await ask("Email: ", email);
    if (!existing.some((h) => h.email === address)) throw new Error("That is not a super admin's email. Nothing was changed.");
    await resetHeadmasterPassword(database, address, await askNewPassword());
    console.log("\nPassword reset. Every device was signed out.");
  } finally {
    await pool.end();
    process.stdin.destroy(); // pause() alone can keep the process alive
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
});
