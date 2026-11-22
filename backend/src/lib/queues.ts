import { Queue } from "bullmq";
import { getRedis } from "./redis";
const conn = getRedis();
export const csvImportQueue = new Queue("csv-import", { connection: conn });
export const pdfParseQueue  = new Queue("pdf-parse",  { connection: conn });
export const analyticsQueue = new Queue("analytics-recompute", { connection: conn });
export type CsvImportJobData = { jobId: string; filePath: string; entity: "departments"|"rooms"|"courses"|"users" };
export type PdfParseJobData  = { jobId: string; filePath: string; department?: string };
export type AnalyticsJobData = { trigger: "mutation"|"ingestion-complete"; entityType?: string };
