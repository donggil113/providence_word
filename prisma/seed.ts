/**
 * 초기 데이터 시드.
 * - 환경변수로 지정한 최초 관리자 계정을 생성(또는 갱신)한다.
 * - 멱등하게 동작하므로 재실행해도 안전하다.
 */
import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { BUILTIN_CATEGORIES } from "../src/lib/categories";

const prisma = new PrismaClient();

async function main() {
  // 기본 분류 11종 생성/갱신 (코드 기준 upsert, 사용자 라벨 변경은 보존)
  for (const c of BUILTIN_CATEGORIES) {
    await prisma.category.upsert({
      where: { code: c.code },
      update: { isBuiltin: true }, // 라벨/색/순서는 사용자가 바꿨을 수 있으니 덮어쓰지 않음
      create: {
        code: c.code,
        label: c.label,
        color: c.color,
        sortOrder: c.sortOrder,
        isBuiltin: true,
      },
    });
  }
  console.log(`✓ 기본 분류 ${BUILTIN_CATEGORIES.length}종 준비 완료`);

  const email = process.env.ADMIN_EMAIL || "admin@providence.word.net";
  const password = process.env.ADMIN_PASSWORD || "changeme1234";
  const name = process.env.ADMIN_NAME || "관리자";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      // 비밀번호는 기존 계정이 있으면 덮어쓰지 않는다(운영 중 비번 초기화 방지).
      name,
      role: Role.ADMIN,
      active: true,
    },
    create: {
      email,
      name,
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
  });

  console.log(`✓ 관리자 계정 준비 완료: ${user.email}`);
  console.log("  (기존 계정이 있으면 비밀번호는 변경되지 않습니다.)");
}

main()
  .catch((e) => {
    console.error("시드 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
