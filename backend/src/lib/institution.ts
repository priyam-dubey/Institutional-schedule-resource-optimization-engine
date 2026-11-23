import { prisma } from "./prisma";

/**
 * The institution a new record should belong to.
 * Users act inside their own department's institution; callers without a user
 * (CSV import worker, seed) fall back to the oldest institution, which the
 * academic-model migration guarantees exists.
 */
export async function resolveInstitutionId(userDepartmentId?: number): Promise<number> {
  if (userDepartmentId !== undefined) {
    const d = await prisma.department.findUnique({ where: { id: userDepartmentId }, select: { institutionId: true } });
    if (d) return d.institutionId;
  }
  const inst = await prisma.institution.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
  if (!inst) throw new Error("No institution exists. Run the database migrations (npx prisma migrate deploy).");
  return inst.id;
}
