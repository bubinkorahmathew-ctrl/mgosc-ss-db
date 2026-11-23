import "server-only";
import { randomUUID } from "node:crypto";
import type { Executor } from "@/lib/db/connection";
import { hashIp } from "@/lib/rate-limit";

/**
 * Only failures count: a correct password removes its attempt. That matters because the whole
 * church may share one IP on a Sunday.
 */
export const SIGN_IN_LIMITS = {
  /** one account from one address */
  pair: { max: 8, minutes: 15 },
  /** one address, any account */
  ip: { max: 30, minutes: 15 },
  /** one account, any address (an IP header can be faked). Higher, so strangers can't easily lock staff out. */
  account: { max: 50, minutes: 60 },
} as const;

export type Attempt = { allowed: false } | { allowed: true; succeeded(): Promise<void> };

/**
 * The attempt is written BEFORE the password is checked, so a burst of parallel guesses
 * cannot all pass the count.
 */
export async function beginAttempt(
  database: Executor, account: string, ip: string, salt: string, now = new Date(),
): Promise<Attempt> {
  const id = randomUUID();
  const accountKey = hashIp(`account:${account}`, salt);
  const ipKey = hashIp(`ip:${ip}`, salt);
  await database.query("insert into sign_in_attempts (id, account_key, ip_key, created_at) values (?, ?, ?, ?)",
    [id, accountKey, ipKey, now]);

  const since = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  const { pair, ip: byIp, account: byAccount } = SIGN_IN_LIMITS;
  const [n] = await database.query<{ pair: number; ip: number; account: number }>(
    `select
       (select count(*) from sign_in_attempts where account_key = ? and ip_key = ? and created_at > ?) as pair,
       (select count(*) from sign_in_attempts where ip_key = ? and created_at > ?) as ip,
       (select count(*) from sign_in_attempts where account_key = ? and created_at > ?) as account`,
    [accountKey, ipKey, since(pair.minutes), ipKey, since(byIp.minutes), accountKey, since(byAccount.minutes)]);

  if (Number(n.pair) > pair.max || Number(n.ip) > byIp.max || Number(n.account) > byAccount.max) {
    // not kept, otherwise retrying while blocked would extend the block for ever
    await database.query("delete from sign_in_attempts where id = ?", [id]);
    return { allowed: false };
  }

  if (Math.random() < 0.05) {
    await database.query("delete from sign_in_attempts where created_at < ?", [since(24 * 60)]);
    await database.query("delete from sessions where expires_at < ?", [now]);
  }

  return {
    allowed: true,
    async succeeded() {
      await database.query("delete from sign_in_attempts where id = ? or (account_key = ? and ip_key = ?)",
        [id, accountKey, ipKey]);
    },
  };
}
