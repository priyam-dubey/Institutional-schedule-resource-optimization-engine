# Institutional Schedule & Resource Optimization Engine

An enterprise-grade academic operations platform designed to automate timetable management, institutional resource allocation, schedule optimization, and academic analytics.

The system provides a centralized solution for managing departments, courses, faculty, classrooms, and timetable data while supporting intelligent PDF timetable ingestion, real-time updates, and role-based access control.

---

## Overview

Managing academic schedules across departments often involves fragmented spreadsheets, manual updates, scheduling conflicts, and inefficient resource utilization.

The Institutional Schedule & Resource Optimization Engine addresses these challenges through:

- Automated timetable ingestion from PDF documents
- Centralized schedule management
- Resource allocation tracking
- Real-time analytics
- Conflict detection
- Role-based administrative workflows
- Queue-based background processing

---

## Features

### Timetable Management

- Department-wise timetable management
- Academic year and semester support
- Schedule slot creation and updates
- Conflict-aware timetable persistence
- Automated timetable validation

### PDF Timetable Ingestion

Upload institutional timetable PDFs and automatically:

- Extract timetable structures
- Parse schedule information
- Detect departments and semesters
- Identify courses and rooms
- Match existing entities
- Create missing resources
- Persist timetable slots

### Resource Management

Manage:

- Departments
- Faculty members
- Courses
- Classrooms
- Schedule slots

### Analytics Dashboard

Institution-wide insights:

- Resource utilization
- Room occupancy statistics
- Faculty workload visibility
- Department scheduling metrics
- Timetable completion status

### Real-Time Updates

- WebSocket-powered event broadcasting
- Live dashboard updates
- Instant schedule refreshes

### Role-Based Access Control (RBAC)

Multiple institutional roles:

- Administrator
- Dean
- Head of Department
- Timetable Coordinator
- Faculty

Permission-based API protection ensures secure access to critical operations.

### Queue-Based Processing

Heavy operations are executed asynchronously using BullMQ:

- PDF parsing
- Timetable ingestion
- Analytics recomputation
- Bulk imports

This prevents blocking user-facing requests and improves scalability.

---

## System Architecture

```text
┌─────────────────────────┐
│      React Client       │
└────────────┬────────────┘
             │ REST API
             ▼
┌─────────────────────────┐
│   Express + TypeScript  │
└────────────┬────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
 PostgreSQL      BullMQ
   Prisma         Redis
      │             │
      └──────┬──────┘
             ▼
      PDF Workers
             │
             ▼
  Timetable Persistence
             │
             ▼
     Analytics Engine
```

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- Zustand
- Tailwind CSS
- React Dropzone
- Axios
- React Hot Toast

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Zod Validation

### Real-Time

- WebSockets

### Infrastructure

- Docker Ready
- Queue Workers
- Background Job Processing

---

## Database Design

Core entities include:

### Departments

- Department metadata
- Academic branches

### Users

- Faculty
- Coordinators
- HODs
- Administrators

### Courses

- Course catalog
- Department mapping

### Rooms

- Classroom inventory
- Resource allocation

### Schedule Slots

- Day
- Time
- Faculty
- Course
- Room

---

## PDF Processing Pipeline

The ingestion engine follows a multi-stage workflow:

```text
PDF Upload
    │
    ▼
Validation
    │
    ▼
Queue Job Creation
    │
    ▼
PDF Parsing
    │
    ▼
Metadata Detection
    │
    ▼
Course Resolution
    │
    ▼
Room Resolution
    │
    ▼
Conflict Detection
    │
    ▼
Database Persistence
    │
    ▼
Analytics Recalculation
```

---

## Authentication & Authorization

JWT-based authentication with role hierarchy:

```text
ADMIN
 │
 ├── DEAN
 │
 ├── HOD
 │
 ├── COORDINATOR
 │
 └── PROFESSOR
```

Protected routes enforce permission-based access at both API and UI levels.

---

## Local Development

### Clone Repository

```bash
git clone https://github.com/priyam-dubey/Institutional-schedule-resource-optimization-engine.git

cd Institutional-schedule-resource-optimization-engine
```

### Install Dependencies

Backend

```bash
cd backend
npm install
```

Frontend

```bash
cd frontend
npm install
```

---

## Environment Variables

Backend

```env
NODE_ENV=development

DATABASE_URL=

REDIS_HOST=
REDIS_PORT=

API_HOST=127.0.0.1
API_PORT=3001

JWT_SECRET=

CORS_ALLOWED_ORIGINS=http://localhost:5173
```

---

## Database Setup

Generate Prisma Client

```bash
npx prisma generate
```

Run Migrations

```bash
npx prisma migrate dev
```

Seed Database

```bash
npm run seed
```

---

## Running the Application

Backend

```bash
npm run dev
```

Worker

```bash
npm run worker
```

Frontend

```bash
npm run dev
```

---

## API Highlights

### Authentication

```http
POST /api/auth/login
GET  /api/auth/me
```

### Departments

```http
GET    /api/departments
POST   /api/departments
PUT    /api/departments/:id
DELETE /api/departments/:id
```

### Courses

```http
GET    /api/courses
POST   /api/courses
PUT    /api/courses/:id
DELETE /api/courses/:id
```

### Rooms

```http
GET    /api/rooms
POST   /api/rooms
PUT    /api/rooms/:id
DELETE /api/rooms/:id
```

### PDF Ingestion

```http
POST /api/ingestions/pdf

GET  /api/ingestions/pdf/status/:jobId
```

---

## Key Engineering Highlights

- Queue-driven architecture using BullMQ
- Large PDF timetable ingestion workflow
- Real-time WebSocket event system
- RBAC implementation across APIs
- Prisma-powered relational modeling
- Type-safe validation using Zod
- Analytics aggregation pipelines
- Enterprise-grade backend structure
- Background worker processing
- Scalable modular architecture

---

## Future Enhancements

- AI-assisted timetable generation
- Automatic conflict resolution
- Predictive classroom utilization
- Faculty load balancing
- Multi-campus scheduling
- Advanced reporting dashboards
- Resource recommendation engine

---

## Author

**Priyambad Kumar Dubey**

- Full Stack Development
- Distributed Systems
- Backend Engineering
- System Design
- Data Processing Pipelines

GitHub:
https://github.com/priyam-dubey