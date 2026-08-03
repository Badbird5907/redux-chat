import { randomUUID } from "node:crypto";

import { redis as getRedis } from "@redux/redis";

const RELEASE_LEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const INCREMENT_RATE_LIMIT_SCRIPT = `
local count = redis.call("incr", KEYS[1])
if count == 1 then
  redis.call("expire", KEYS[1], ARGV[1])
end
return count
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
  const count = await getRedis().eval<[string], number>(
    INCREMENT_RATE_LIMIT_SCRIPT,
    [key],
    [String(windowSeconds)],
  );
  return count <= limit;
}
