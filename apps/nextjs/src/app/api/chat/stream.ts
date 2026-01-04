import { redis } from "@redux/redis";
import type { Publisher, Subscriber } from "resumable-stream/generic";

export const createPubSub = () => {
  const r = redis();
  const subscribers = new Map<string, { unsubscribe: (channels: string[]) => void }>();
  return {
    publisher: {
      connect: async () => {
        // Upstash Redis is connectionless, so this is a no-op
        return Promise.resolve();
      },
      publish: async (channel: string, message: string) => {
        return await r.publish(channel, message);
      },
      set: async (key: string, value: string, options?: { EX?: number }) => {
        if (options?.EX) {
          return await r.set(key, value, { ex: options.EX });
        }
        return await r.set(key, value);
      },
      get: async (key: string) => {
        return await r.get(key);
      },
      incr: async (key: string) => {
        return await r.incr(key);
      },
    } satisfies Publisher,
    subscriber: {
      connect: async () => {
        // Upstash Redis is connectionless, so this is a no-op
        return Promise.resolve();
      },
      subscribe: async (channel: string, callback: (message: string) => void) => {
        const subscriber = r.subscribe(channel);
        subscribers.set(channel, subscriber);
        subscriber.on('message', (message) => {
          // Ensure the message is a string - Upstash Redis might parse JSON automatically
          const msg = typeof message.message === 'string' 
            ? message.message 
            : JSON.stringify(message.message);
          callback(msg + "\n\n"); // the \n\n IS CRITICAL. The resumable-stream library does not do this for us and the SSE will not work without it.
        });
        return Promise.resolve();
      },
      unsubscribe: async (channel: string) => {
        subscribers.get(channel)?.unsubscribe([channel]);
        subscribers.delete(channel);
        return Promise.resolve();
      },
    } satisfies Subscriber,
  }
}
