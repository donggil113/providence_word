# 과거 말씀 PDF 대량 자동 등록 가이드

1978년부터의 수백~수천 개 PDF를 **규칙 기반(AI 없이)** 으로 정리해 등록하는 파이프라인입니다.

```
PDF 폴더 ──①규칙분석──▶ 검토용 CSV ──(사람이 검토·수정)──▶ ②등록 ──▶ DB + 원본 PDF 첨부
          analyze.ts                                       import.ts
```

- **①분석(`scripts/analyze.ts`)**: 기본은 **규칙 기반**입니다. PDF 본문을 추출(스캔본은 한국어 OCR)하고,
  **파일명·상위 폴더명·본문**을 규칙으로 분석해 제목/날짜/분류/성경본문을 채운 **CSV**를 만듭니다.
  **AI(Claude) 호출은 하지 않습니다.** (`--llm` 을 줄 때만 AI로 보정)
- **검토**: 만들어진 CSV를 엑셀 등으로 열어 확인·수정합니다.
- **②등록(`scripts/import.ts`)**: 검토한 CSV를 읽어 말씀을 등록하고 **원본 PDF를 각 말씀에 첨부**합니다.

> ⚠️ analyze.ts 는 DB에 직접 넣지 않습니다. CSV만 만듭니다.

---

## 규칙 (어떻게 자동으로 채우나)

| 항목 | 규칙 |
| --- | --- |
| **날짜** | 파일명 **앞부분 숫자**에서 추출: `YYMMDD` 또는 `YYYYMMDD` (예: `950305_…`→1995-03-05, `20240815_…`→2024-08-15). 2자리 연도는 78~99→19xx, 00~77→20xx. 앞부분에 없으면 파일명 전체→본문 순으로 보조 탐색. |
| **분류** | **파일명 + 상위 폴더명**의 키워드로 판정. 폴더가 `주일말씀`이면 SUNDAY, `수요말씀`→WEDNESDAY, `금요기도회`→FRIDAY_PRAYER, `성령집회`→…, `교역자`→PASTORAL, `교육`→EDUCATION 등. **관리자 페이지에서 추가한 분류 이름도 자동으로 규칙에 포함**됩니다. |
| **제목** | 파일명에서 날짜·분류 키워드를 뺀 나머지. |
| **성경본문** | PDF 본문 텍스트에서 규칙으로 추출(예: `요한복음 3:16`). |
| **설교자·요약** | 비워둠 (AI가 필요한 항목). 필요하면 나중에 손으로 채우거나 `--llm` 사용. |

**날짜나 분류를 규칙으로 못 잡은 파일**은 `확인필요`로 표시되어 **별도 CSV(`*.needs-review.csv`)로 분리**됩니다.

---

## 0. 준비

```bash
npm install

# (권장) 스캔(이미지) PDF의 한국어 OCR 도구
sudo apt-get install -y tesseract-ocr tesseract-ocr-kor poppler-utils
#   없으면 스캔 PDF는 '처리불가 목록'(*.needs-ocr.txt)으로 분리됩니다.
```

DB도 준비되어 있어야 합니다(②등록 단계, 그리고 사용자 추가 분류를 규칙에 반영하려면 ①에서도 권장).
로컬이면 `npm run db:init`, 도커면 `docker compose up -d`.

---

## 1. 먼저 샘플 30개로 확인

```bash
npx tsx scripts/analyze.ts --dir ./pdfs --out data/sample.csv --limit 30
```

`data/sample.csv`(확인완료)와 `data/sample.needs-review.csv`(확인필요)를 열어:
- 분류·날짜가 맞는지, 폴더 구조에 맞게 잘 분류됐는지 확인합니다.

---

## 2. 전체 분석

```bash
npx tsx scripts/analyze.ts --dir ./pdfs --out data/sermons.generated.csv
```

출력 파일:

| 파일 | 내용 |
| --- | --- |
| `data/sermons.generated.csv` | **확인완료** 행 (날짜·분류를 규칙으로 잡음) |
| `data/sermons.generated.needs-review.csv` | **확인필요** 행 (날짜 또는 분류 못잡음, `확인필요` 표시) |
| `data/sermons.generated.needs-ocr.txt` | 텍스트 없음 + OCR 불가 PDF 목록 |

주요 옵션: `--limit N`(샘플), `--ocr auto|on|off`, `--ocr-lang kor+eng`, `--concurrency N`,
`--base <경로>`(files 열을 상대경로로), `--cache <폴더>`(재실행 시 이어서).

### (선택) AI 보정

설교자·요약까지 자동으로 채우거나 더 똑똑한 분류를 원하면 `--llm` 을 추가합니다(이때만 AI 호출).

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx tsx scripts/analyze.ts --dir ./pdfs --out data/sermons.generated.csv --llm
#   docker 안에서 실행 시 키 전달: docker compose exec -e ANTHROPIC_API_KEY=... web npx tsx scripts/analyze.ts ...
```

시작 시 `LLM 점검 … OK ✓` 로 연결을 확인하며, 키/설치 문제가 있으면 즉시 중단합니다.

---

## 3. CSV 검토 (사람이 수정)

엑셀/구글시트로 엽니다. import.ts 가 쓰는 열은 앞쪽 9개이고, 뒤쪽은 검토 보조용(등록 시 무시)입니다.

| 열 | 의미 |
| --- | --- |
| `preachedAt` | 선포일 `YYYY-MM-DD` (모르면 `확인필요` → 수정) |
| `category` | 분류 **코드** (아래 참고) |
| `title` | 제목 |
| `department` `eventName` `preacher` `scripture` `summary` | 부서/행사/설교자/성경본문/요약 |
| `files` | 원본 PDF 경로 (등록 시 이 PDF가 첨부됨) |
| `source_pdf` `date_source` `category_confidence` `needs_review` `review_reason` `extract_method` | 검토 보조용(무시됨) |

- `needs_review`가 `검토필요`이거나 `preachedAt`이 `확인필요`인 행을 우선 확인하세요(별도 CSV에 모여 있음).
- `category`는 분류 **코드**입니다. 기본 코드:
  `SUNDAY, WEDNESDAY, DAWN, FRIDAY_PRAYER, HOLY_SPIRIT_MEETING, DEPARTMENT, SPECIAL, ETC, HOLY_SPIRIT_STORY, BIBLE_SCHOOL, THEOLOGY`
  그 외 코드(예: `PASTORAL`, `EDUCATION`, 직접 만든 코드)는 **등록 시 자동으로 새 분류로 생성**됩니다.
  (관리자 페이지 **분류 관리**에서 라벨·색을 다듬을 수 있습니다.)

---

## 4. 등록 (DB + 원본 PDF 첨부)

```bash
npx tsx scripts/import.ts --csv data/sermons.generated.csv
# 확인필요 행을 채웠다면 그 CSV도 같은 방식으로 등록
npx tsx scripts/import.ts --csv data/sermons.generated.needs-review.csv
```

- `files` 열의 PDF가 업로드 폴더로 복사되어 각 말씀에 첨부됩니다.
- `txt`·`pdf` 본문은 자동 추출되어 검색에 포함되고, 말씀 상세 페이지의 **‘PDF 원문 보기’ 탭**에서 원문을 볼 수 있습니다.
- CSV 의 분류 코드가 DB에 없으면 자동으로 새 분류를 만들고(`+ 새 분류 자동 생성: …`), 실패한 행만 마지막에 보고합니다.

> `--base` 를 분석 때 썼다면 등록에도 동일하게 넘기세요.

---

## 분류(말씀 종류)를 직접 추가/관리

기본 11종 외 분류는 두 가지 방법으로 생깁니다.

1. **자동**: CSV `category`에 새 코드가 있으면 등록 시 자동 생성.
2. **수동**: 관리자 로그인 → **관리 → 분류 관리**에서 이름·색·순서를 지정해 추가.
   여기서 추가한 분류 이름은 다음 번 `analyze.ts` 실행 시 **규칙 키워드로도 자동 반영**됩니다
   (예: ‘교역자 말씀’ 분류를 만들면 `교역자` 폴더가 그 분류로 잡힘).

---

## 파이프라인 점검(개발용)

폴더 구조 기반 분류·날짜 규칙을 확인하려면 임의의 폴더 구조에 PDF를 넣고 돌려보세요.

```bash
npx tsx scripts/analyze.ts --dir ./pdfs --out /tmp/out.csv
cat /tmp/out.csv ; cat /tmp/out.needs-review.csv
```
