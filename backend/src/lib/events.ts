import { getRedis } from "./redis";

/** Publish a `{type, ...}` event; the API process forwards it to every authenticated WebSocket client. */
export async function publishEvent(event: { type: string; [k: string]: unknown }): Promise<void> {
  try {
    await getRedis().publish("samayak:events", JSON.stringify(event));
  } catch (e) {
    console.error("[events] publish failed:", (e as Error).message);
  }
}
