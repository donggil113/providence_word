# 섭리 말씀 아카이브 (Providence Word Archive)

1978년부터 선포된 우리 교단의 **모든 말씀**을 한 곳에 정리·보관하고,
누구나 **날짜·기간·키워드**로 쉽게 찾아볼 수 있도록 만든 웹 사이트입니다.

> 예시 도메인: `https://www.providence.word.net`

---

## 주요 기능

- **말씀 종류별 분류** — 기본 11종(주일·수요·새벽·금요기도회·성령집회·부서·특별·기타·성령사연·성경학교·신학)
  외에 **관리자가 직접 분류를 추가·수정** (관리 → 분류 관리)
- **시간 순 정리** — 연도별 보기, 최신순/오래된순 정렬
- **강력한 검색** — 제목·성경본문·설교자·행사명·부서, 그리고 **txt/pdf 본문 내용**까지 검색
- **기간 선택** — 특정 기간 내에 선포된 말씀만 모아보기
- **말씀 상세 보기** — **‘말씀 내용 보기’ 탭**(추출 본문)과 **‘PDF 원문 보기’ 탭**(원문 PDF를 브라우저에서 바로 표시)
- **다양한 파일 지원** — `txt`, `pdf`, `hwp(hwpx)` 업로드 및 보기/다운로드
- **모바일·데스크톱 모두 지원** — 반응형 디자인
- **매주 손쉬운 추가** — 로그인한 관리자/편집자가 관리자 페이지에서 말씀 등록
- **말씀 일괄 관리** — 관리 목록에서 제목·날짜·성경본문·설교자 **인라인 수정**,
  분류 **드롭다운 변경**, 여러 건 **체크 후 일괄 재분류**(현재 필터 전체 이동 포함),
  ‘검토필요’·‘기타(ETC)’만 모아보는 필터. (‘기타’로 잘못 분류된 대량 자료를 빠르게 재분류)
- **계정 관리** — 관리자가 여러 운영자 계정을 만들고 권한을 부여
- **독립 DB 서버** — PostgreSQL 을 별도 서비스로 두어 데이터가 안전하게 영구 보관

---

## 기술 구성

| 구분 | 사용 기술 |
| --- | --- |
| 프론트엔드/백엔드 | Next.js 14 (App Router), React 18, TypeScript |
| 스타일 | Tailwind CSS (반응형) |
| 데이터베이스 | PostgreSQL 16 (독립 서비스) |
| ORM | Prisma |
| 한글 검색 | PostgreSQL `pg_trgm` + GIN 인덱스 (부분 일치 가속) |
| 인증 | 자체 세션(JWT, HTTP-only 쿠키) + bcrypt |
| 파일 저장 | 디스크 볼륨 (`/app/uploads`) |
| 배포 | Docker / Docker Compose |

---

## 빠른 시작 (Docker Compose · 권장)

가장 간단하게 전체 스택(웹 + DB)을 실행하는 방법입니다.

```bash
# 1) 환경변수 파일 준비
cp .env.example .env
#   .env 를 열어 비밀번호/시크릿을 반드시 변경하세요.
#   - POSTGRES_PASSWORD : DB 비밀번호
#   - AUTH_SECRET       : openssl rand -base64 48 로 생성 권장
#   - ADMIN_EMAIL / ADMIN_PASSWORD : 최초 관리자 계정

# 2) 빌드 & 실행
docker compose up -d --build

# 3) 브라우저에서 접속
#   http://localhost:3000
```

실행되면 자동으로:
1. DB 스키마가 적용되고,
2. 한글 검색 인덱스가 설정되며,
3. `.env` 에 지정한 최초 관리자 계정이 생성됩니다.

> **첫 로그인 후 반드시 비밀번호를 바꾸거나 새 계정을 만드세요.**
> 관리 → 계정 관리 메뉴에서 운영자 계정을 추가할 수 있습니다.

---

## 로컬 개발 (Docker 없이)

PostgreSQL 이 따로 떠 있어야 합니다.

```bash
# 1) 의존성 설치
npm install

# 2) .env 작성 (DATABASE_URL 의 host 를 localhost 로)
cp .env.example .env
#   예: DATABASE_URL=postgresql://providence:비밀번호@localhost:5432/providence_word?schema=public

# 3) DB 초기화 (스키마 + 검색 인덱스 + 관리자 시드)
npm run db:init

# 4) 개발 서버
npm run dev
#   http://localhost:3000
```

### 자주 쓰는 명령

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 |
| `npm run db:push` | 스키마를 DB 에 반영 |
| `npm run db:setup-search` | pg_trgm 확장 + 검색 인덱스 생성 |
| `npm run db:seed` | 최초 관리자 계정 생성 |
| `npm run db:init` | 위 3개를 한 번에 |
| `npm run db:migrate-category` | 기존 DB의 분류 enum → 테이블 **무손실 마이그레이션** |
| `npm run db:clean-content` | 저장된 본문의 파일명/페이지 머리말·꼬리말 잔재 청소 (`--dry-run` 먼저) |

> **이미 말씀이 등록된 DB가 있다면**(분류가 아직 enum 컬럼): `prisma db push` 가 리셋을
> 요구할 수 있습니다. 데이터를 잃지 않고 옮기려면 **[docs/migrate-existing-db.md](docs/migrate-existing-db.md)**
> 의 안내(`npm run db:migrate-category`)를 따르세요.

---

## 매주 말씀 추가하기

1. 사이트 우측 상단 **로그인** → 관리자/편집자 계정으로 로그인
2. **관리 → 새 말씀 등록**
3. 제목·말씀 종류·선포일을 입력하고, 필요한 항목(성경 본문, 설교자, 부서, 행사명, 요약)을 채웁니다.
4. `txt`·`pdf`·`hwp` 파일을 첨부합니다. (여러 개 가능, 파일당 최대 50MB)
   - `txt`·`pdf` 파일은 **본문 내용이 자동 추출**되어 검색에 포함됩니다.
   - `hwp` 는 신뢰할 수 있는 자동 추출이 어려워 제목·요약 등 입력 정보로 검색됩니다.
5. **등록**을 누르면 끝. 시간 순서에 맞게 자동 정리됩니다.

---

## 기존 자료 대량 등록 (1978년~ 백업본 마이그레이션)

수십 년치 파일을 한 번에 올리려면 CSV 일괄 등록 스크립트를 사용하세요.

```bash
# data/sermons.example.csv 형식을 참고해 목록 CSV 를 만든 뒤:
npx tsx scripts/import.ts --csv data/sermons.csv --base data/files
```

- CSV 컬럼: `preachedAt, category, title, department, eventName, preacher, scripture, summary, files`
- `files` 는 `--base` 경로 기준 상대경로이며 여러 개는 `;` 로 구분합니다.
- 자세한 형식은 [`data/sermons.example.csv`](data/sermons.example.csv) 와 `scripts/import.ts` 상단 주석 참고.

### PDF 자동 분석(수백~수천 개 일괄)

직접 CSV를 만들기 어려운 대량 PDF는 **규칙 기반 자동 분석 파이프라인**을 쓰세요(AI 호출 없음).
PDF 본문을 추출(스캔본은 한국어 OCR)하고 **파일명 앞부분 숫자(YYMMDD/YYYYMMDD)로 날짜**,
**파일명·상위 폴더명 키워드로 분류**를 자동으로 채운 **검토용 CSV**를 만든 뒤, 사람이 확인·수정하고 등록합니다.

```bash
# 1) 먼저 샘플 30개로 확인 → 2) 전체 분석 → (검토) → 3) 등록(원본 PDF 첨부)
npx tsx scripts/analyze.ts --dir ./pdfs --out data/sermons.generated.csv --limit 30
npx tsx scripts/analyze.ts --dir ./pdfs --out data/sermons.generated.csv
npx tsx scripts/import.ts  --csv data/sermons.generated.csv
```

- 날짜·분류를 규칙으로 못 잡은 파일은 `확인필요`로 표시되어 `*.needs-review.csv` 로 분리됩니다.
- 설교자·요약까지 AI로 보정하려면 `ANTHROPIC_API_KEY` 설정 후 `--llm` 옵션을 추가하세요(이때만 AI 호출).

전체 절차·옵션·OCR 설치는 **[docs/bulk-import.md](docs/bulk-import.md)** 를 참고하세요.

---

## 도메인 연결 & HTTPS

`www.providence.word.net` 같은 주소로 공개하려면, 도메인을 서버 IP 로 연결한 뒤
앞단에 리버스 프록시(HTTPS 종료)를 두는 것을 권장합니다.

### 예시: Caddy (자동 HTTPS)

서버에 Caddy 를 설치하고 `Caddyfile` 을 아래처럼 작성하면 인증서가 자동 발급됩니다.

```
www.providence.word.net {
    reverse_proxy localhost:3000
}
providence.word.net {
    redir https://www.providence.word.net{uri}
}
```

### 예시: Nginx

```nginx
server {
    server_name www.providence.word.net;
    client_max_body_size 60M;   # 큰 말씀 파일 업로드 대비
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
# 인증서는 certbot 등으로 발급 (sudo certbot --nginx -d www.providence.word.net)
```

> DNS: 도메인의 A 레코드를 서버 공인 IP 로 지정하세요.

---

## 데이터 백업

데이터는 두 곳에 있습니다. 둘 다 정기 백업을 권장합니다.

1. **데이터베이스** (말씀 메타데이터·검색 텍스트·계정)
   ```bash
   # 백업
   docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup_$(date +%F).sql
   # 복원
   cat backup.sql | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
   ```
2. **업로드 파일** (`uploads` 볼륨의 실제 txt/pdf/hwp 파일)
   ```bash
   docker run --rm -v providence_word_uploads:/data -v "$PWD":/backup alpine \
     tar czf /backup/uploads_$(date +%F).tar.gz -C /data .
   ```

---

## 환경변수 정리

[`.env.example`](.env.example) 참고. 핵심 항목:

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `AUTH_SECRET` | 세션 JWT 서명 키 (길고 무작위하게) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | 최초 관리자 계정 |
| `UPLOAD_DIR` | 업로드 파일 저장 경로 (기본 `/app/uploads`) |
| `NEXT_PUBLIC_SITE_NAME` / `NEXT_PUBLIC_SITE_URL` | 사이트 이름/주소 |

---

## 폴더 구조

```
src/
  app/            # 페이지 & API 라우트 (App Router)
    page.tsx              # 홈 (검색 + 종류/연도 바로가기 + 최근 말씀)
    sermons/             # 말씀 검색/목록, 상세
    login/               # 로그인
    admin/               # 관리자(말씀 등록/수정, 계정 관리)
    api/                 # REST API (sermons, files, users, auth)
  components/      # 재사용 UI 컴포넌트
  lib/            # DB, 인증, 검색, 파일/텍스트 처리 유틸
prisma/           # 스키마 & 시드
scripts/          # 검색 인덱스 설정, 일괄 등록, 컨테이너 엔트리포인트
```
