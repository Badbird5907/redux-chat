import { randomUUID } from "node:crypto";

import { redis as getRedis } from "@redux/redis";

const RELEASE_LEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export async function acquireRedisLease(
  key: string,
  ttlMs: number,
): Promise<string | undefined> {
  const token = randomUUID();
  const result = await getRedis().set(key, token, { nx: true, px: ttlMs });
  return result === "OK" ? token : undefined;
}

export async function releaseRedisLease(
  key: string,
  token: string,
): Promise<void> {
  await getRedis().eval(RELEASE_LEASE_SCRIPT, [key], [token]);
}

export async function checkStartRateLimit(args: {
  userId: string;
  connector: string;
  limit?: number;
  windowSeconds?: number;
}): Promise<boolean> {
  const limit = args.limit ?? 5;
  const windowSeconds = args.windowSeconds ?? 600;
  const key = `redux-chat:byok:oauth-start:${args.userId}:${args.connector}`;
  const count = await getRedis().incr(key);
  if (count === 1) {
    await getRedis().expire(key, windowSeconds);
  }
  return count <= limit;
}
