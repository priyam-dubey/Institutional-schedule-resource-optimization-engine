# Implementation status

Branch: `feat/scheduling-engine-and-hardening`. Updated at the end of every phase.
**Legend:** ✅ done and verified (how, in brackets) · 🟡 implemented, not verified · ⬜ not started

## Verification environment (what "verified" means here)

The authoring sandbox blocks Prisma's native engine download, but it has PostgreSQL 16 and Redis. Verification therefore uses:

* **Real PostgreSQL 16** – migrations are applied to real databases; queries run against them.
* **Real Prisma client logic** via Prisma's WASM query engine + `pg` driver adapter (sandbox-only shim in `backend/.scratch/`, git-ignored). It runs the same generated client code and query planner as production, but **not** the native library engine you will use.
* **Real Redis / BullMQ** where noted.

Anything not exercised that way is marked 🟡.

## Phase 1 — Database architecture

| Item | Status |
|---|---|
| Schema: Institution, AcademicYear, Semester (+SemesterPeriod, Holiday), Program, Subject, Section (+SectionBatch), FacultyProfile (+FacultySubject, FacultyAvailability), RoomAvailability, SubjectRequirement, TimetableGeneration, TimetableEntry, GenerationConflict | ✅ `prisma validate` passes with the real Prisma validator |
| Legacy models preserved (Branch, Course, Room, User, TimetableSlot, IngestionJob) and linked: `Branch.programId`, `Course.subjectId` | ✅ |
| `Classroom` = existing `Room` extended (building, equipment, isActive) rather than duplicated | decision |
| `0_init` baseline migration (legacy schema) + additive `20261123000000_academic_model` | ✅ applied to real PG 16 |
| Backfill on legacy data (default institution, Branch→Program, Course→Subject, faculty profiles, inferred qualifications) | ✅ tested with seeded legacy rows incl. duplicate course codes; re-run is idempotent; legacy slots untouched |
| Migrated DB structurally identical to a DB built from the schema | ✅ columns, defaults, indexes, constraints, enums |
| Every one of the 24 models readable via the real Prisma client on the migrated DB | ✅ |
| `prisma migrate dev` reports **no drift** with the native engine | 🟡 **you must run** (see below) |

### Commands you need to run locally (Phase 1)

```bash
cd backend
npm install
cp .env.example .env           # then edit secrets
# EXISTING database that was created with `prisma db push` (has data):
npx prisma migrate resolve --applied 0_init
npx prisma migrate deploy      # applies 20261123000000_academic_model (additive, with backfill)
# FRESH database:
npx prisma migrate deploy
npx prisma generate
# drift check — should print "No difference detected":
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code
```
If the drift check reports differences, send me the output; the SQL was hand-assembled to Prisma's naming conventions and verified against a real PostgreSQL, but not against Prisma's own differ.

### Compatibility / data-migration strategy
* No table or column is dropped or rewritten. Legacy `timetable_slots` remain and are still served by the existing endpoints.
* When several legacy courses share a code inside one department they collapse to **one Subject** (the lowest-id course supplies name/credits/type); every such Course still links to it.
* Qualifications are inferred from historical `timetable_slots` (who taught which course).
* `departments.institutionId` is NOT NULL after the migration (backfilled to a default institution named "Default Institution", code `DEFAULT` – rename it in Institution Setup).

## Phases 2–7
⬜ Not started at this checkpoint. See the sections below as they are filled in.
