export type SignedId = { id: string; sig: string };
export type AllocatedSignedId = SignedId & { str: string };

interface SignedIdAllocatorOptions {
  defaultCacheSize: number;
  maxBatchSize: number;
}

type FetchSignedIds = (count: number) => Promise<SignedId[]>;

const assertPositiveInteger = (value: number, label: string) => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer. Received ${value}`);
  }
};

export class SignedIdQueueAllocator {
  private readonly queue: SignedId[] = [];
  private inFlightFetch: Promise<void> | null = null;
  private allocationChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly fetchSignedIds: FetchSignedIds,
    private readonly options: SignedIdAllocatorOptions,
  ) {}

  getAvailableCount() {
    return this.queue.length;
  }

  private async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.allocationChain;
    let release!: () => void;

    this.allocationChain = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await task();
    } finally {
      release();
    }
  }

  async prefetch(minimumCount = this.options.defaultCacheSize): Promise<void> {
    assertPositiveInteger(minimumCount, "minimumCount");

    while (this.queue.length < minimumCount) {
      if (this.inFlightFetch) {
        await this.inFlightFetch;
        continue;
      }

      const missingCount = minimumCount - this.queue.length;
      const batchSize = Math.min(this.options.maxBatchSize, missingCount);

      const fetchPromise = (async () => {
        try {
          const newIds = await this.fetchSignedIds(batchSize);
          if (newIds.length !== batchSize) {
            console.error("Signed ID generator returned unexpected count", {
              requested: batchSize,
              received: newIds.length,
            });
            throw new Error(
              `Signed ID generator returned ${newIds.length} IDs for request of ${batchSize}`,
            );
          }

          this.queue.push(...newIds);
        } finally {
          this.inFlightFetch = null;
        }
      })();

      this.inFlightFetch = fetchPromise;
      await fetchPromise;
    }
  }

  async allocate(count: number): Promise<AllocatedSignedId[]> {
    assertPositiveInteger(count, "count");

    return this.runExclusive(async () => {
      await this.prefetch(count);

      const allocatedIds = this.queue.splice(0, count);
      if (allocatedIds.length !== count) {
        console.error("Failed to allocate enough signed IDs", {
          requested: count,
          received: allocatedIds.length,
          remainingQueueLength: this.queue.length,
        });
        throw new Error(
          `Failed to allocate enough IDs. Requested ${count}, received ${allocatedIds.length}`,
        );
      }

      void this.prefetch(this.options.defaultCacheSize).catch(
        (error: unknown) => {
          console.error("Failed to replenish signed ID cache", {
            error,
            remainingQueueLength: this.queue.length,
          });
        },
      );

      return allocatedIds.map((signedId) => ({
        ...signedId,
        str: `${signedId.id}:${signedId.sig}`,
      }));
    });
  }
}
