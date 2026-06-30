import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fileKindFromName } from "@/lib/categories";
import { extractContent } from "@/lib/extract";
import { makeStoredName, saveFile, deleteStoredFile } from "@/lib/files";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 파일당 50MB

const metaSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요.").max(500),
  category: z.string().trim().min(1, "말씀 종류를 선택하세요."), // 분류 코드
  department: z.string().trim().max(200).optional().nullable(),
  eventName: z.string().trim().max(300).optional().nullable(),
  preacher: z.string().trim().max(200).optional().nullable(),
  scripture: z.string().trim().max(300).optional().nullable(),
  summary: z.string().trim().max(5000).optional().nullable(),
  preachedAt: z.string().refine((v) => !isNaN(new Date(v).getTime()), {
    message: "올바른 날짜가 아닙니다.",
  }),
});

function emptyToNull(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export interface ParsedFile {
  buf: Buffer;
  originalName: string;
}

async function collectFiles(form: FormData): Promise<ParsedFile[]> {
  const files: ParsedFile[] = [];
  for (const entry of form.getAll("files")) {
    if (typeof entry === "string") continue;
    const file = entry as File;
    if (file.size === 0) continue;
    if (file.size > MAX_FILE_BYTES) {
      throw new ValidationError(
        `파일 "${file.name}" 용량이 너무 큽니다(최대 50MB).`
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    files.push({ buf, originalName: file.name });
  }
  return files;
}

// 여러 파일에서 검색용 본문 텍스트를 모은다.
async function buildContentText(files: ParsedFile[]): Promise<string> {
  const parts: string[] = [];
  for (const f of files) {
    const kind = fileKindFromName(f.originalName);
    const text = await extractContent(f.buf, kind);
    if (text) parts.push(text);
  }
  return parts.join("\n\n").trim();
}

async function persistFiles(sermonId: string, files: ParsedFile[]) {
  for (const f of files) {
    const storedName = makeStoredName(f.originalName);
    await saveFile(f.buf, storedName);
    const kind = fileKindFromName(f.originalName);
    await prisma.sermonFile.create({
      data: {
        sermonId,
        originalName: f.originalName,
        storedName,
        kind,
        mimeType: guessMime(f.originalName),
        size: f.buf.length,
      },
    });
  }
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  switch (ext) {
    case "txt":
      return "text/plain; charset=utf-8";
    case "pdf":
      return "application/pdf";
    case "hwp":
      return "application/x-hwp";
    case "hwpx":
      return "application/hwp+zip";
    default:
      return "application/octet-stream";
  }
}

export class ValidationError extends Error {}

// 분류 코드 → categoryId (없으면 오류)
async function resolveCategoryId(code: string): Promise<string> {
  const cat = await prisma.category.findUnique({ where: { code } });
  if (!cat) throw new ValidationError(`존재하지 않는 말씀 종류입니다: ${code}`);
  return cat.id;
}

export async function createSermon(form: FormData, userId: string) {
  const parsed = metaSchema.safeParse({
    title: form.get("title"),
    category: form.get("category"),
    department: emptyToNull(form.get("department")),
    eventName: emptyToNull(form.get("eventName")),
    preacher: emptyToNull(form.get("preacher")),
    scripture: emptyToNull(form.get("scripture")),
    summary: emptyToNull(form.get("summary")),
    preachedAt: form.get("preachedAt"),
  });
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors[0].message);
  }
  const data = parsed.data;

  const categoryId = await resolveCategoryId(data.category);
  const files = await collectFiles(form);
  const contentText = await buildContentText(files);
  const preachedAt = new Date(data.preachedAt);

  const sermon = await prisma.sermon.create({
    data: {
      title: data.title,
      categoryId,
      department: data.department || null,
      eventName: data.eventName || null,
      preacher: data.preacher || null,
      scripture: data.scripture || null,
      summary: data.summary || null,
      contentText: contentText || null,
      preachedAt,
      year: preachedAt.getFullYear(),
      createdBy: userId,
    },
  });

  await persistFiles(sermon.id, files);
  return sermon;
}

export async function updateSermon(id: string, form: FormData) {
  const existing = await prisma.sermon.findUnique({
    where: { id },
    include: { files: true },
  });
  if (!existing) throw new ValidationError("말씀을 찾을 수 없습니다.");

  const parsed = metaSchema.safeParse({
    title: form.get("title"),
    category: form.get("category"),
    department: emptyToNull(form.get("department")),
    eventName: emptyToNull(form.get("eventName")),
    preacher: emptyToNull(form.get("preacher")),
    scripture: emptyToNull(form.get("scripture")),
    summary: emptyToNull(form.get("summary")),
    preachedAt: form.get("preachedAt"),
  });
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors[0].message);
  }
  const data = parsed.data;

  // 삭제할 기존 파일 처리
  const deleteIds = form.getAll("deleteFileIds").map(String).filter(Boolean);
  for (const fid of deleteIds) {
    const file = existing.files.find((f) => f.id === fid);
    if (file) {
      await deleteStoredFile(file.storedName);
      await prisma.sermonFile.delete({ where: { id: file.id } });
    }
  }

  // 새 파일 추가
  const newFiles = await collectFiles(form);
  await persistFiles(id, newFiles);

  // 본문 텍스트 재계산: 남아있는 파일 전체로 다시 추출하지 않고,
  // 기존 contentText 에서 삭제분을 정확히 빼긴 어려우므로,
  // 현재 DB 에 남은 모든 파일을 디스크에서 다시 읽어 재구성한다.
  const remaining = await prisma.sermonFile.findMany({ where: { sermonId: id } });
  let contentText = "";
  if (remaining.length) {
    const { readStoredFile } = await import("@/lib/files");
    const parts: string[] = [];
    for (const f of remaining) {
      try {
        const buf = await readStoredFile(f.storedName);
        const text = await extractContent(buf, f.kind);
        if (text) parts.push(text);
      } catch {
        // 읽기 실패 시 건너뜀
      }
    }
    contentText = parts.join("\n\n").trim();
  }

  const categoryId = await resolveCategoryId(data.category);
  const preachedAt = new Date(data.preachedAt);
  const sermon = await prisma.sermon.update({
    where: { id },
    data: {
      title: data.title,
      categoryId,
      department: data.department || null,
      eventName: data.eventName || null,
      preacher: data.preacher || null,
      scripture: data.scripture || null,
      summary: data.summary || null,
      contentText: contentText || null,
      preachedAt,
      year: preachedAt.getFullYear(),
    },
  });
  return sermon;
}

export async function deleteSermon(id: string) {
  const existing = await prisma.sermon.findUnique({
    where: { id },
    include: { files: true },
  });
  if (!existing) return;
  for (const f of existing.files) {
    await deleteStoredFile(f.storedName);
  }
  await prisma.sermon.delete({ where: { id } }); // files 는 cascade 삭제
}
