import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fileKindFromName } from "@/lib/categories";
import { extractContent } from "@/lib/extract";
import { makeStoredName, saveFile, deleteStoredFile } from "@/lib/files";
import { renderSermonPdf } from "@/lib/sermon-pdf";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 파일당 50MB
const MAX_BODY_CHARS = 500_000; // 직접 입력 본문 길이 제한(검색 인덱스 비대화 방지)

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

// 직접 입력한 본문(textarea) 읽기
function readManualBody(form: FormData): string {
  const raw = form.get("contentText");
  if (raw === null) return "";
  const s = String(raw).replace(/\r\n/g, "\n").trim();
  if (!s) return "";
  return s.length > MAX_BODY_CHARS ? s.slice(0, MAX_BODY_CHARS) : s;
}

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

async function persistFiles(
  sermonId: string,
  files: ParsedFile[],
  generated = false
) {
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
        generated,
      },
    });
  }
}

// 파일 이름으로 쓸 수 없는 문자를 정리한다.
function safeFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
  return (base || "말씀").slice(0, 80) + ".pdf";
}

/**
 * 본문 텍스트로 만든 PDF 를 최신 상태로 맞춘다.
 * - 사용자가 직접 올린 PDF 가 있으면 생성하지 않는다(그 PDF 가 원문).
 * - 이미 자동 생성된 PDF 가 있으면 지우고 다시 만든다(제목/날짜 변경 반영).
 * - 한글 글꼴을 찾지 못하면 조용히 건너뛴다(등록 자체는 성공).
 */
export async function syncGeneratedPdf(sermonId: string): Promise<boolean> {
  const sermon = await prisma.sermon.findUnique({
    where: { id: sermonId },
    include: { files: true, category: { select: { label: true } } },
  });
  if (!sermon) return false;

  // 기존 자동 생성본 제거
  for (const f of sermon.files.filter((x) => x.generated)) {
    await deleteStoredFile(f.storedName);
    await prisma.sermonFile.delete({ where: { id: f.id } });
  }

  // 사용자가 올린 PDF 가 있으면 자동 생성하지 않는다.
  const hasUserPdf = sermon.files.some((f) => !f.generated && f.kind === "PDF");
  if (hasUserPdf) return false;

  const body = (sermon.contentText || "").trim();
  if (!body) return false;

  try {
    const buf = await renderSermonPdf({
      title: sermon.title,
      body,
      preachedAt: sermon.preachedAt,
      categoryLabel: sermon.category?.label ?? null,
      scripture: sermon.scripture,
      preacher: sermon.preacher,
      department: sermon.department,
      eventName: sermon.eventName,
      siteName: process.env.NEXT_PUBLIC_SITE_NAME || null,
    });
    if (!buf) return false;
    await persistFiles(
      sermonId,
      [{ buf, originalName: safeFileName(sermon.title) }],
      true
    );
    return true;
  } catch (e) {
    // PDF 생성 실패가 말씀 등록을 막지 않도록 한다.
    console.warn("[sermon-pdf] 자동 생성 실패:", (e as Error).message);
    return false;
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
  const extracted = await buildContentText(files);

  // 직접 입력한 본문이 있으면 그것을 본문으로 삼고, 첨부에서 뽑은 텍스트는 뒤에 붙인다.
  const manualBody = readManualBody(form);
  const contentText = [manualBody, extracted].filter(Boolean).join("\n\n").trim();
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
  // 본문은 있는데 PDF 원문이 없으면 명조체 PDF 를 자동 생성한다.
  await syncGeneratedPdf(sermon.id);
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

  // 본문 텍스트 결정
  //   manual : 직접 입력한 본문을 쓴다(+ 이번에 추가한 첨부에서 뽑은 텍스트를 뒤에 붙임)
  //   keep   : 기존 본문을 그대로 둔다(본문이 너무 길어 편집기에 싣지 않은 경우)
  //   files  : 남아있는 첨부 파일에서 다시 추출한다(기본값 — 예전 동작)
  const contentMode = String(form.get("contentMode") || "files");
  let contentText = "";

  if (contentMode === "manual") {
    const manualBody = readManualBody(form);
    const addedText = await buildContentText(newFiles);
    contentText = [manualBody, addedText].filter(Boolean).join("\n\n").trim();
  } else if (contentMode === "keep") {
    contentText = (existing.contentText || "").trim();
  } else {
    // 자동 생성한 PDF 는 본문을 되먹임하게 되므로 제외하고 재추출한다.
    const remaining = await prisma.sermonFile.findMany({
      where: { sermonId: id, generated: false },
    });
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

  // 제목·날짜·본문이 바뀌었을 수 있으므로 자동 생성 PDF 를 다시 만든다.
  await syncGeneratedPdf(id);
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
