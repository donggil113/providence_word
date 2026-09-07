/**
 * 관리자 계정 확인 / 비밀번호 초기화 (서버에서만 실행)
 * ================================================================
 * 로그인 이메일이나 비밀번호를 잊었을 때 서버에서 직접 복구하는 도구.
 * 웹에서 노출되는 기능이 아니라, 서버 접속 권한이 있는 사람만 실행할 수 있다.
 *
 * ⚠️ prisma/seed.ts 를 다시 돌려도 비밀번호는 초기화되지 않는다.
 *    (기존 계정의 비밀번호를 덮어쓰지 않도록 일부러 그렇게 만들어 두었음)
 *    비밀번호 초기화는 반드시 이 스크립트를 사용할 것.
 *
 * 사용:
 *   # 1) 등록된 계정(이메일) 목록 확인 — 이메일을 잊었을 때
 *   npx tsx scripts/reset-admin.ts --list
 *
 *   # 2) 비밀번호 초기화 (비밀번호를 생략하면 안전한 임시 비밀번호를 만들어 준다)
 *   npx tsx scripts/reset-admin.ts --email admin@providence.word.net
 *   npx tsx scripts/reset-admin.ts --email admin@providence.word.net --password '새비밀번호'
 *
 *   # 3) 계정 자체가 없을 때 새 관리자 계정 만들기
 *   npx tsx scripts/reset-admin.ts --email me@example.com --name 홍길동 --create
 *
 * docker compose 로 운영 중이라면 web 컨테이너 안에서 실행:
 *   docker compose exec web npx tsx scripts/reset-admin.ts --list
 *
 * 옵션:
 *   --list              등록된 계정 목록만 출력하고 종료
 *   --email <이메일>    대상 계정 (대소문자 무시)
 *   --password <비번>   새 비밀번호 (8자 이상). 생략하면 자동 생성
 *   --name <이름>       표시 이름 (--create 시 기본값 '관리자')
 *   --create            해당 이메일 계정이 없으면 새로 만든다
 *   --role <ADMIN|EDITOR>  역할 지정 (기본 ADMIN)
 */
import "dotenv/config";
import crypto from "crypto";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--"))
    return process.argv[i + 1];
  return fallback;
}
const flag = (n: string) => process.argv.includes(`--${n}`);

// 사람이 옮겨 적기 쉬운 임시 비밀번호(혼동되는 O/0, l/1 제외)
function randomPassword(len = 16): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { email: true, name: true, role: true, active: true, createdAt: true },
  });
  if (users.length === 0) {
    console.log("등록된 계정이 없습니다. --create 로 관리자 계정을 만들어 주세요.");
    console.log("  예: npx tsx scripts/reset-admin.ts --email me@example.com --name 관리자 --create");
    return;
  }
  console.log(`등록된 계정 ${users.length}개:\n`);
  for (const u of users) {
    const when = u.createdAt.toISOString().slice(0, 10);
    console.log(
      `  ${u.email}\n    이름: ${u.name} / 권한: ${u.role} / 상태: ${u.active ? "사용중" : "비활성"} / 생성: ${when}`
    );
  }
  console.log("\n비밀번호를 잊었다면:");
  console.log(`  npx tsx scripts/reset-admin.ts --email ${users[0].email}`);
}

async function main() {
  if (flag("list") || process.argv.length <= 2) {
    await listUsers();
    if (process.argv.length <= 2) {
      console.log("\n(옵션 설명은 scripts/reset-admin.ts 상단 주석을 참고하세요.)");
    }
    return;
  }

  const rawEmail = arg("email");
  if (!rawEmail) {
    console.error("--email 이 필요합니다. 어떤 이메일이 등록돼 있는지 모르면 --list 를 먼저 실행하세요.");
    process.exit(1);
  }
  const email = rawEmail.trim().toLowerCase();

  const roleArg = (arg("role") || "ADMIN").toUpperCase();
  if (roleArg !== "ADMIN" && roleArg !== "EDITOR") {
    console.error("--role 은 ADMIN 또는 EDITOR 만 가능합니다.");
    process.exit(1);
  }
  const role = roleArg as Role;

  let password = arg("password");
  let generated = false;
  if (!password) {
    password = randomPassword();
    generated = true;
  }
  if (password.length < 8) {
    console.error("비밀번호는 8자 이상이어야 합니다.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing && !flag("create")) {
    console.error(`'${email}' 계정을 찾을 수 없습니다.`);
    console.error("  등록된 이메일 확인:  npx tsx scripts/reset-admin.ts --list");
    console.error("  새로 만들려면 --create 를 붙이세요.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    // 비밀번호만 바꾸고(그리고 잠긴 계정이면 다시 사용 가능하게) 나머지는 그대로 둔다.
    await prisma.user.update({
      where: { email },
      data: { passwordHash, active: true, ...(flag("role") ? { role } : {}) },
    });
    console.log(`✓ '${email}' 비밀번호를 새로 설정했습니다.`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name: arg("name") || "관리자",
        passwordHash,
        role,
        active: true,
      },
    });
    console.log(`✓ 새 계정 '${email}' 을(를) 만들었습니다. (권한: ${role})`);
  }

  console.log("\n  이메일  : " + email);
  console.log("  비밀번호: " + password);
  if (generated) {
    console.log("\n  ※ 자동 생성된 임시 비밀번호입니다. 로그인한 뒤");
    console.log("     관리자 > 계정 관리에서 원하는 비밀번호로 바꿔 주세요.");
  }
  console.log("  ※ 이 출력은 셸 기록에 남을 수 있으니 확인 후 화면을 정리하세요.");
}

main()
  .catch((e) => {
    console.error("실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
