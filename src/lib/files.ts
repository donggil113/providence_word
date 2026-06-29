import "server-only";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export function uploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

export async function ensureUploadDir(): Promise<string> {
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// 충돌 없는 저장 파일명 생성 (원본 확장자 유지)
export function makeStoredName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const id = crypto.randomBytes(16).toString("hex");
  return `${Date.now()}-${id}${ext}`;
}

export async function saveFile(buf: Buffer, storedName: string): Promise<void> {
  const dir = await ensureUploadDir();
  await fs.writeFile(path.join(dir, storedName), buf);
}

export async function readStoredFile(storedName: string): Promise<Buffer> {
  // 경로 조작 방지: 파일명만 사용
  const safe = path.basename(storedName);
  return fs.readFile(path.join(uploadDir(), safe));
}

export async function deleteStoredFile(storedName: string): Promise<void> {
  const safe = path.basename(storedName);
  try {
    await fs.unlink(path.join(uploadDir(), safe));
  } catch {
    // 이미 없으면 무시
  }
}
