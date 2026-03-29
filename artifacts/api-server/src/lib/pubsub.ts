import type { Redis } from "ioredis";

// All cross-instance WebSocket events are relayed through these Redis channels.
export const CHANNEL_TRIP_UPDATE = "gnncab:trip_update";
export const CHANNEL_DRIVER_LOCATION = "gnncab:driver_location";

export interface TripUpdatePayload {
  tripId: string;
  status: string;
  recipientUserIds?: string[];
}

export interface DriverLocationPayload {
  driverId: string;
  lat: number;
  lng: number;
  status: string;
}

// Returns null when REDIS_URL is not configured so single-instance mode still works.
let publisher: Redis | null = null;
let subscriber: Redis | null = null;

function isRedisConfigured(): boolean {
  return typeof process.env.REDIS_URL === "string" && process.env.REDIS_URL.length > 0;
}

async function getPublisher(): Promise<Redis | null> {
  if (!isRedisConfigured()) {
    return null;
  }

  if (publisher) {
    return publisher;
  }

  const { default: IORedis } = await import("ioredis");
  publisher = new IORedis(process.env.REDIS_URL as string, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  publisher.on("error", (error: Error) => {
    console.error("[PubSub] Publisher error:", error.message);
  });
  await publisher.connect();
  return publisher;
}

async function getSubscriber(): Promise<Redis | null> {
  if (!isRedisConfigured()) {
    return null;
  }

  if (subscriber) {
    return subscriber;
  }

  const { default: IORedis } = await import("ioredis");
  // A dedicated connection is required for subscribe mode.
  subscriber = new IORedis(process.env.REDIS_URL as string, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  subscriber.on("error", (error: Error) => {
    console.error("[PubSub] Subscriber error:", error.message);
  });
  await subscriber.connect();
  return subscriber;
}

export async function publish(channel: string, payload: unknown): Promise<void> {
  const pub = await getPublisher();
  if (!pub) {
    return;
  }

  try {
    await pub.publish(channel, JSON.stringify(payload));
  } catch (error) {
    console.error(
      `[PubSub] Publish failed on channel ${channel}:`,
      error instanceof Error ? error.message : error
    );
  }
}

export async function subscribe(
  channel: string,
  handler: (payload: unknown) => void
): Promise<void> {
  const sub = await getSubscriber();
  if (!sub) {
    return;
  }

  try {
    await sub.subscribe(channel);
    sub.on("message", (receivedChannel: string, rawPayload: string) => {
      if (receivedChannel !== channel) {
        return;
      }

      try {
        handler(JSON.parse(rawPayload));
      } catch (error) {
        console.error(
          `[PubSub] Failed to parse message on channel ${receivedChannel}:`,
          error instanceof Error ? error.message : error
        );
      }
    });
  } catch (error) {
    console.error(
      `[PubSub] Subscribe failed on channel ${channel}:`,
      error instanceof Error ? error.message : error
    );
  }
}
