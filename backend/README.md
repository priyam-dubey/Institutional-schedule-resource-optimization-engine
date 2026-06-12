# Samayak Admin Panel

Mission-critical academic operations platform for Indian universities — built for BIT Mesra and extensible to any institution.

## Stack
- **API**: Node.js + Express + TypeScript (strict)
- **ORM**: Prisma 5 + PostgreSQL 16
- **Queue**: BullMQ + Redis 7
- **Auth**: JWT + RBAC (Admin → Dean → HOD → Coordinator → Professor)
- **Observability**: Correlation ID tracing on every request
- **Real-time**: WebSocket push (Redis pub/sub → WS clients)
- **Frontend**: React + Vite + Figtree + Samayak Design System

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env

# 2. Spin up everything
docker compose up --build

# 3. The API runs on :4000, Frontend on :3000
```

On first boot the API container automatically runs `prisma migrate deploy`.  
Seed BIT Mesra data:
```bash
docker compose exec api npm run prisma:seed
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        docker-compose                           │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────┐              │
│  │ Frontend │───▶│  API :4000   │───▶│ Postgres │              │
│  │  :3000   │◀WS─│  (Express)   │    │  :5432   │              │
│  └──────────┘    └──────┬───────┘    └──────────┘              │
│                         │                                       │
│                    ┌────▼──────────┐    ┌──────────┐           │
│                    │  BullMQ       │───▶│  Redis   │           │
│                    │  Queues       │◀───│  :6379   │           │
│                    └────┬──────────┘    └──────────┘           │
│                         │                                       │
│                  ┌──────▼──────────────────┐                   │
│                  │      Worker Process      │                   │
│                  │  ┌─────────────────────┐│                   │
│                  │  │ csvImport worker    ││                   │
│                  │  │ pdfParser worker    ││                   │
│                  │  │ analyticsWorker     ││                   │
│                  │  └─────────────────────┘│                   │
│                  └─────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | — | DB + Redis + Queue status |
| GET | `/api/analytics` | PROFESSOR+ | Live dashboard metrics |
| GET/POST/PUT/DELETE | `/api/departments` | COORDINATOR+ | Department CRUD |
| GET/POST/PUT/DELETE | `/api/rooms` | COORDINATOR+ | Room CRUD |
| GET/POST/PUT/DELETE | `/api/courses` | COORDINATOR+ | Course CRUD |
| GET/POST/DELETE | `/api/timetable` | COORDINATOR+ | Slot management |
| GET/POST/DELETE + restore | `/api/users` | COORDINATOR+ | Faculty + soft deletes |
| POST | `/api/upload/csv/:entity` | COORDINATOR+ | Bulk CSV/Excel import |
| POST | `/api/upload/pdf` | COORDINATOR+ | PDF timetable ingestion |
| GET | `/api/upload/job/:id` | PROFESSOR+ | Poll BullMQ job status |
| WS | `/ws` | — | Live analytics push |

## Dashboard Analytics Formulas

| Metric | Formula |
|--------|---------|
| Room Utilization | `(slots_occupied / total_available) × 100` |
| P(empty \| slot S) | `free_rooms_in_S / total_rooms` |
| Under-Running | `scheduled_slots < ceil(credits × 2)` |
| Avg Empty Room-Hours/Day | `mean_per_room(unscheduled_slots × 50/60)` |

## RBAC Levels

| Role | Level | Permissions |
|------|-------|-------------|
| ADMIN | 5 | Full access, view soft-deleted users |
| DEAN | 4 | Approve + read all |
| HOD | 3 | Delete entities within department |
| COORDINATOR | 2 | Full CRUD, manage timetable, trigger imports |
| PROFESSOR | 1 | Read-only |

## PDF Parser

The `pdfParser` worker is **generic** — it handles any BIT Mesra department layout without hardcoded CSE logic:

1. Extract text items + XY positions via `pdfjs-dist`  
2. Group into rows by Y-coordinate bucketing (8pt tolerance)  
3. Auto-detect metadata: Branch, Semester from header rows  
4. Build column-X → Period map from the period header row  
5. Tokenize day-row cells → `(course_abbr, room_code)` pairs  
6. Resolve courses via exact code match + Levenshtein distance ≤ 3  
7. Resolve/create rooms; split composite "219/220" cells with warnings  
8. Upsert `TimetableSlot` records with conflict detection  
9. Enqueue `analytics-recompute` → triggers live WS broadcast  
