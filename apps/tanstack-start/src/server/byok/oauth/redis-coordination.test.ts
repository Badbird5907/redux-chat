import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  acquireRedisLease,
  checkStartRateLimit,
  releaseRedisLease,
} from "./redis-coordination";

const mocks = vi.hoisted(() => ({
  set: vi.fn<() => Promise<"OK" | null>>(),
  eval: vi.fn<() => Promise<number>>(),
}));

vi.mock("@redux/redis", () => ({
  redis: () => mocks,
}));

describe("Redis OAuth coordination", () => {
  beforeEach(() => {
    mocks.set.mockResolvedValue("OK");
    mocks.eval.mockResolvedValue(1);
  });

  it("uses unique lease tokens and compare-and-delete release", async () => {
    const token = await acquireRedisLease("lease-key", 30_000);
    expect(token).toEqual(expect.any(String));
    expect(mocks.set).toHaveBeenCalledWith("lease-key", token, {
      nx: true,
      px: 30_000,
    });

    await releaseRedisLease("lease-key", token ?? "");
    expect(mocks.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get", KEYS[1])'),
      ["lease-key"],
      [token],
    );
  });

  it("limits authorization starts per user and connector window", async () => {
    mocks.eval
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    const args = {
      userId: "user-a",
      connector: "chatgpt",
      limit: 2,
      windowSeconds: 600,
    };
    await expect(checkStartRateLimit(args)).resolves.toBe(true);
    await expect(checkStartRateLimit(args)).resolves.toBe(true);
    await expect(checkStartRateLimit(args)).resolves.toBe(false);
    expect(mocks.eval).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('redis.call("expire", KEYS[1], ARGV[1])'),
      ["redux-chat:byok:oauth-start:user-a:chatgpt"],
      ["600"],
    );
  });
});
