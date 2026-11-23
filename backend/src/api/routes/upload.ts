import { Router } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../lib/prisma";
import { csvImportQueue, pdfParseQueue } from "../../lib/queues";
import { authenticate, requireRole } from "../../middleware/rbac";

const router = Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// POST /api/upload/csv/:entity
router.post("/csv/:entity", authenticate, requireRole("COORDINATOR"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const entity = req.params.entity as "departments" | "rooms" | "courses" | "users";
  const jobRecord = await prisma.ingestionJob.create({
    data: { type: "csv-import", status: "QUEUED", filename: req.file.originalname },
  });

  await csvImportQueue.add("import", {
    jobId: jobRecord.id,
    filePath: req.file.path,
    entity,
  });

  res.status(202).json({ jobId: jobRecord.id, message: "Import queued", correlationId: req.correlationId });
});

// POST /api/upload/pdf
router.post("/pdf", authenticate, requireRole("COORDINATOR"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  if (!/\.pdf$/i.test(req.file.originalname) || (req.file.mimetype && req.file.mimetype !== "application/pdf")) {
    return res.status(400).json({ error: "Only PDF files are accepted" });
  }

  const jobRecord = await prisma.ingestionJob.create({
    data: { type: "pdf-parse", status: "QUEUED", filename: req.file.originalname, createdById: req.user!.id },
  });

  await pdfParseQueue.add("parse", {
    jobId: jobRecord.id,
    filePath: req.file.path,
    department: req.body.department,
  });

  res.status(202).json({ jobId: jobRecord.id, message: "PDF queued for parsing", correlationId: req.correlationId });
});

// GET /api/upload/job/:id — Poll job status
router.get("/job/:id", authenticate, async (req, res) => {
  const job = await prisma.ingestionJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

export default router;
