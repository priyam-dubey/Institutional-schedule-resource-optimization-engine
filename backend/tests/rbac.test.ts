import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { corsOrigins, jwtSecret } from "../src/lib/config";
import {
  authenticate,
  canAssignRole,
  canManageDepartment,
  requireDepartmentAccess,
  requireRole,
  verifyToken,
  type AuthUser,
} from "../src/middleware/rbac";

const SECRET = "x".repeat(40);
const user = (over: Partial<AuthUser> = {}): AuthUser => ({ id: 1, email: "a@b.c", role: "COORDINATOR", departmentId: 10, ...over });

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  return res;
}
const sign = (payload: object, opts: jwt.SignOptions = {}) => jwt.sign(payload, SECRET, { algorithm: "HS256", ...opts });

describe("config", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it("refuses to run in production without a strong JWT secret", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    expect(() => jwtSecret()).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = "short";
    expect(() => jwtSecret()).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = SECRET;
    expect(jwtSecret()).toBe(SECRET);
  });
  it("requires an explicit CORS allow-list in production and never returns a wildcard", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CORS_ORIGIN;
    expect(() => corsOrigins()).toThrow(/CORS_ORIGIN/);
    process.env.CORS_ORIGIN = "https://a.edu, https://b.edu";
    expect(corsOrigins()).toEqual(["https://a.edu", "https://b.edu"]);
  });
});

describe("token verification", () => {
  beforeEach(() => { process.env.JWT_SECRET = SECRET; });

  it("accepts a valid token and exposes a numeric id", () => {
    const t = sign({ email: "a@b.c", role: "HOD", departmentId: 3 }, { subject: "42", expiresIn: 60 });
    expect(verifyToken(t)).toEqual({ id: 42, email: "a@b.c", role: "HOD", departmentId: 3 });
  });
  it("rejects expired, wrongly signed, unknown-role and alg=none tokens", () => {
    expect(verifyToken(sign({ role: "HOD" }, { subject: "1", expiresIn: -10 }))).toBeNull();
    expect(verifyToken(jwt.sign({ role: "HOD" }, "y".repeat(40), { subject: "1" }))).toBeNull();
    expect(verifyToken(sign({ role: "SUPERUSER", email: "x", departmentId: 1 }, { subject: "1" }))).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." +
      Buffer.from(JSON.stringify({ sub: "1", role: "ADMIN", email: "x", departmentId: 1 })).toString("base64url") + ".";
    expect(verifyToken(none)).toBeNull();
    expect(verifyToken("garbage")).toBeNull();
  });
  it("authenticate returns 401 without a bearer token and passes with one", () => {
    const res = mockRes();
    const next = vi.fn();
    authenticate({ headers: {} } as any, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();

    const req: any = { headers: { authorization: "Bearer " + sign({ email: "a", role: "PROFESSOR", departmentId: 1 }, { subject: "5" }) } };
    authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user.id).toBe(5);
  });
});

describe("role hierarchy and scoping", () => {
  it("requireRole enforces the minimum level", () => {
    const next = vi.fn();
    const res = mockRes();
    requireRole("HOD")({ user: user({ role: "COORDINATOR" }) } as any, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    requireRole("HOD")({ user: user({ role: "DEAN" }) } as any, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("department scope: admin/dean global, hod/coordinator own department only, professor never", () => {
    expect(canManageDepartment(user({ role: "ADMIN", departmentId: 1 }), 99)).toBe(true);
    expect(canManageDepartment(user({ role: "DEAN", departmentId: 1 }), 99)).toBe(true);
    expect(canManageDepartment(user({ role: "HOD", departmentId: 10 }), 10)).toBe(true);
    expect(canManageDepartment(user({ role: "HOD", departmentId: 10 }), 11)).toBe(false);
    expect(canManageDepartment(user({ role: "COORDINATOR", departmentId: 10 }), 11)).toBe(false);
    expect(canManageDepartment(user({ role: "PROFESSOR", departmentId: 10 }), 10)).toBe(false);
  });

  it("nobody can mint an account at or above their own level, except ADMIN", () => {
    expect(canAssignRole(user({ role: "ADMIN" }), "ADMIN")).toBe(true);
    expect(canAssignRole(user({ role: "DEAN" }), "ADMIN")).toBe(false);
    expect(canAssignRole(user({ role: "HOD" }), "HOD")).toBe(false);
    expect(canAssignRole(user({ role: "HOD" }), "COORDINATOR")).toBe(true);
    expect(canAssignRole(user({ role: "COORDINATOR" }), "COORDINATOR")).toBe(false);
  });

  it("requireDepartmentAccess blocks cross-department writes and lets unresolved resources through to a 404", async () => {
    const guard = (deptId: number | undefined, u: AuthUser) => {
      const res = mockRes();
      const next = vi.fn();
      return requireDepartmentAccess(() => deptId)({ user: u } as any, res, next).then(() => ({ res, next }));
    };
    const blocked = await guard(11, user({ role: "HOD", departmentId: 10 }));
    expect(blocked.res.statusCode).toBe(403);
    expect(blocked.next).not.toHaveBeenCalled();
    expect((await guard(10, user({ role: "HOD", departmentId: 10 }))).next).toHaveBeenCalledOnce();
    expect((await guard(undefined, user({ role: "HOD" }))).next).toHaveBeenCalledOnce();
  });
});
