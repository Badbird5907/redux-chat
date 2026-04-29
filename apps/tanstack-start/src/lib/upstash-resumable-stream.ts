import type { Publisher, Subscriber } from "resumable-stream";

import { redis as getRedis } from "@redux/redis";

export const createUpstashPubSub = () => {
  const redis = getRedis();
  const publisher: Publisher = {
    connect: async () => {
      return Promise.resolve();
    },
    publish: async (channel: string, message: string) => {
      // console.log("Publishing message to channel:", channel, message);
      return redis.publish(channel, JSON.stringify(message));
    },
    set: async (key: string, value: string, options) => {
      return redis.set(
        key,
        value,
        options?.EX ? { ex: options.EX } : undefined,
      );
    },
    get: async (key: string) => {
      return redis.get(key);
    },
    incr: async (key: string) => {
      return redis.incr(key);
    },
  };

  const subscriptions = new Map<string, ReturnType<typeof redis.subscribe>>();

  const subscriber: Subscriber = {
    connect: async () => {
      return Promise.resolve();
    },
    subscribe: (channel: string, callback: (message: string) => void) => {
      const subscription = redis.subscribe<unknown>([channel]);
      subscription.on("message", ({ message }) => {
        callback(
          typeof message === "string" ? message : JSON.stringify(message),
        );
      });
      subscriptions.set(channel, subscription);
      return Promise.resolve();
    },
    unsubscribe: async (channel: string) => {
      const subscription = subscriptions.get(channel);
      subscriptions.delete(channel);
      return subscription?.unsubscribe([channel]);
    },
  };

  return {
    publisher,
    subscriber,
  };
};
