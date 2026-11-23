/** Shared bootstrap for HTTP-level integration tests. Call vi.mock for lib/prisma in the test file (hoisting). */
import jwt from "jsonwebtoken";
import type { AddressInfo } from "net";
import { createTestDb, testDbRef } from "./db";
import { seedBasic, type SeedOpts } from "./fixture";

export const prismaMock = () => ({
  prisma: new Proxy({}, {
    get: (_t, k) => {
      const c = testDbRef.db!.prisma;
      const v = c[k];
      return typeof v === "function" ? v.bind(c) : v;
    },
  }),
});

export async function startHarness(seedOpts?: SeedOpts) {
  testDbRef.db = await createTestDb();
  const prisma = testDbRef.db.prisma;
  const seed = await seedBasic(prisma, seedOpts);
  const { httpServer } = await import("../../src/api/server");
  await new Promise<void>((r) => httpServer.listen(0, r));
  const base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  const { startGenerationWorker } = await import("../../src/workers/generationWorker");
  const worker = startGenerationWorker();
  const tokenFor = (u: { id: number; email: string; role: string; departmentId: number }) =>
    jwt.sign({ sub: String(u.id), email: u.email, role: u.role, departmentId: u.departmentId }, process.env.JWT_SECRET!, { algorithm: "HS256" });
  const call = async (method: string, path: string, user: any, body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${tokenFor(user)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  const waitFor = async (id: number, user: any, want = ["COMPLETED", "FAILED", "CANCELLED"], ms = 60000) => {
    const end = Date.now() + ms;
    for (;;) {
      const r = await call("GET", `/api/generations/${id}`, user);
      if (want.includes(r.body.status)) return r.body;
      if (Date.now() > end) throw new Error(`timeout waiting for generation ${id}: ${JSON.stringify(r.body)}`);
      await new Promise((s) => setTimeout(s, 150));
    }
  };
  const generate = async (user: any, sectionIds: number[], semesterId: number, config: object = { seed: 1, timeLimitMs: 10000 }) => {
    const c = await call("POST", "/api/generations", user, { semesterId, sectionIds, config });
    if (c.status !== 202) throw new Error(`create failed ${c.status} ${JSON.stringify(c.body)}`);
    return waitFor(c.body.id, user);
  };
  const stop = async () => {
    await worker.close();
    const { getRedis } = await import("../../src/lib/redis");
    getRedis().disconnect();
    await new Promise((r) => httpServer.close(r));
    await testDbRef.db?.close();
  };
  return { seed, prisma, base, call, waitFor, generate, stop, tokenFor };
}
