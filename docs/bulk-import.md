# 과거 말씀 PDF 대량 자동 등록 가이드

1978년부터의 수백~수천 개 PDF를 자동으로 분석해 등록하는 2단계 파이프라인입니다.

```
PDF 폴더 ──①분석──▶ 검토용 CSV ──(사람이 검토·수정)──▶ ②등록 ──▶ DB + 원본 PDF 첨부
          analyze.ts                                    import.ts
```

- **①분석(`scripts/analyze.ts`)**: PDF에서 본문을 추출(스캔본은 OCR)하고, 파일명·본문을
  분석해 제목/날짜/분류/설교자/성경본문/행사/부서/요약을 자동으로 채운 **CSV**를 만듭니다.
  **DB에 직접 넣지 않습니다.**
- **검토**: 만들어진 CSV를 엑셀 등으로 열어 `검토필요`·`확인필요` 행을 사람이 고칩니다.
- **②등록(`scripts/import.ts`)**: 검토한 CSV를 읽어 말씀을 등록하고 **원본 PDF를 각 말씀에 첨부**합니다.

---

## 0. 준비

```bash
npm install        # @anthropic-ai/sdk 는 정식 의존성이라 함께 설치됩니다

# (선택) 더 정확한 자동 분류를 위해 Claude API 키 설정
export ANTHROPIC_API_KEY=sk-ant-...
#   키가 없으면 파일명·본문 키워드 기반의 '규칙 기반' 모드로 동작합니다(정확도↓).
#   docker 컨테이너에서 실행할 때는 키를 컨테이너로 전달해야 합니다:
#     docker compose exec -e ANTHROPIC_API_KEY=sk-ant-... web npx tsx scripts/analyze.ts --dir ...
#   또는 .env 에 ANTHROPIC_API_KEY 를 추가(스크립트가 dotenv 로 읽음).

# (권장) 스캔(이미지) PDF의 한국어 OCR을 위한 도구
sudo apt-get install -y tesseract-ocr tesseract-ocr-kor poppler-utils
#   도구가 없으면 스캔 PDF는 '처리불가 목록'(.needs-ocr.txt)으로 분리됩니다.
```

DB도 준비되어 있어야 합니다(②등록 단계). 로컬이라면 `npm run db:init`, 도커라면 `docker compose up -d`.

---

## 1. 먼저 샘플 10~20개로 정확도 확인 (중요)

전체를 돌리기 전에 반드시 일부만 먼저 처리해 결과 품질을 확인하세요.

```bash
npx tsx scripts/analyze.ts --dir ./pdfs --out data/sample.csv --limit 15
```

`data/sample.csv`를 열어:
- 분류(`category`)가 11종 코드로 올바른지
- 날짜(`preachedAt`)가 맞는지 (없으면 `확인필요`)
- `needs_review` 열이 `검토필요`인 행이 실제로 애매한지

를 확인합니다. 정확도가 만족스러우면 전체로 진행합니다.

---

## 2. 전체 분석

```bash
npx tsx scripts/analyze.ts --dir ./pdfs --out data/sermons.generated.csv
```

- 하위 폴더까지 재귀적으로 모든 `*.pdf`를 찾습니다.
- 텍스트가 있는 PDF는 그대로 추출하고, 텍스트가 거의 없는 스캔 PDF는 한국어 OCR을 시도합니다.
- OCR도 불가한 PDF는 `data/sermons.generated.needs-ocr.txt`에 경로가 모입니다(별도 처리용).
- 파일별 결과는 `.analyze-cache/`에 캐시되어, 중단 후 다시 실행하면 이어서 진행합니다.

### 주요 옵션

| 옵션 | 설명 | 기본값 |
| --- | --- | --- |
| `--dir <폴더>` | PDF 폴더 (필수, 재귀 검색) | — |
| `--out <파일>` | 결과 CSV 경로 | `data/sermons.generated.csv` |
| `--limit <N>` | 앞 N개만 (샘플 테스트) | 전체 |
| `--model <id>` | Claude 모델 | `claude-opus-4-8` |
| `--effort <level>` | `low`/`medium`/`high` | `low` |
| `--concurrency <N>` | 동시 처리 개수 | `4` |
| `--ocr <mode>` | `auto`/`on`/`off` | `auto` |
| `--ocr-lang <langs>` | tesseract 언어 | `kor+eng` |
| `--no-llm` | Claude 미사용(규칙 기반) | — |
| `--base <경로>` | `files` 열을 이 경로 기준 상대경로로 기록 | 절대경로 |

### 비용/모델 안내

- 기본 모델은 가장 똑똑한 `claude-opus-4-8`입니다. 수천 건을 한 번에 처리하면 비용이 큽니다.
- **권장 흐름**: 먼저 샘플(`--limit`)을 기본 모델로 돌려 정확도를 확인한 뒤, 전체 실행 시
  비용을 줄이려면 더 저렴한 모델로 바꾸세요. 예:
  ```bash
  npx tsx scripts/analyze.ts --dir ./pdfs --out data/sermons.generated.csv --model claude-haiku-4-5
  ```
- 키가 없으면 자동으로 규칙 기반 모드가 됩니다(무료, 대신 분류·요약 정확도는 낮습니다).

### LLM 연결 점검(빠른 실패)

키가 설정된 경우, 본격 처리 전에 **시작 단계에서 Claude에 한 번 시험 호출**해 연결을 확인합니다.

- `LLM 점검 : 연결 확인 중... OK ✓` 가 보이면 정상입니다.
- SDK 미설치/키 누락/연결 실패 시에는 **즉시 중단(exit 1)** 하고 원인을 안내합니다.
  (예전처럼 조용히 규칙 기반으로 바뀌어 `LLM실패` 로 잘못 표시되지 않습니다.)
- 일부러 규칙 기반으로 돌리려면 `--no-llm` 을 붙이세요.

> 개별 문서에서만 일시적 오류가 나면 1회 재시도 후, 그 행의 `review_reason` 에
> 실제 오류 메시지(`LLM오류:...`)가 기록되어 어떤 문서가 왜 실패했는지 알 수 있습니다.

---

## 3. CSV 검토 (사람이 수정)

`data/sermons.generated.csv`를 엑셀/구글시트로 엽니다. 열 구성:

| 열 | 의미 | 비고 |
| --- | --- | --- |
| `preachedAt` | 선포일 `YYYY-MM-DD` | 모르면 `확인필요` → **반드시 수정** |
| `category` | 말씀 종류 코드 | 11종 중 하나 |
| `title` | 제목 | |
| `department` | 부서명 | 부서 말씀일 때 |
| `eventName` | 행사명 | 집회 등 |
| `preacher` | 설교자 | |
| `scripture` | 성경 본문 | |
| `summary` | 요약 | |
| `files` | 원본 PDF 경로 | 등록 시 이 PDF가 첨부됨 |
| `source_pdf` | 원본 PDF 절대경로 | 참고용 |
| `date_source` | 날짜 출처(`filename`/`body`/`none`) | 참고용 |
| `category_confidence` | 분류 확신도 | 참고용 |
| `needs_review` | `검토필요` | 분류·날짜가 애매한 행 |
| `review_reason` | 검토 사유 | 참고용 |
| `extract_method` | `text`/`ocr` | 참고용 |

검토 요령:
- `needs_review`가 `검토필요`이거나 `preachedAt`이 `확인필요`인 행을 우선 확인·수정합니다.
- `category`는 반드시 다음 코드 중 하나여야 합니다:
  `SUNDAY, WEDNESDAY, DAWN, FRIDAY_PRAYER, HOLY_SPIRIT_MEETING, DEPARTMENT, SPECIAL, ETC, HOLY_SPIRIT_STORY, BIBLE_SCHOOL, THEOLOGY`
- `source_pdf`·`date_source` 등 보조 열은 등록 시 **무시**되므로 지우지 않아도 됩니다.
- `preachedAt`이 `확인필요`인 행은 등록 단계에서 실패 처리되어, 누락 없이 다시 채울 수 있습니다.

---

## 4. 등록 (DB + 원본 PDF 첨부)

```bash
npx tsx scripts/import.ts --csv data/sermons.generated.csv
```

- `files` 열의 PDF가 업로드 폴더로 복사되어 각 말씀에 첨부됩니다.
- `txt`·`pdf` 본문은 자동 추출되어 검색에 포함됩니다.
- `preachedAt`/`category`/`title`이 비어 있거나 잘못된 행은 건너뛰고, 마지막에 성공/실패 건수를 보여줍니다.
  실패한 행만 CSV에서 고쳐 다시 실행하면 됩니다.

> `--base`를 분석 때 사용했다면 등록에도 동일하게 넘기세요:
> `npx tsx scripts/import.ts --csv ... --base <같은 경로>`

---

## 스캔(처리불가) PDF 다시 처리

OCR 도구가 없거나 OCR 품질이 낮아 `*.needs-ocr.txt`로 빠진 PDF는:
1. OCR 도구를 설치하고(위 0번) 그 목록의 PDF만 모아 다시 `analyze.ts`를 돌리거나,
2. 메타데이터만 수동으로 CSV에 직접 입력해 `import.ts`로 등록할 수 있습니다.

---

## 파이프라인 점검(개발용)

테스트용 샘플 PDF를 만들어 흐름을 확인할 수 있습니다.

```bash
npx tsx scripts/make-fixtures.ts /tmp/fx          # 샘플 PDF 4개 생성
npx tsx scripts/analyze.ts --dir /tmp/fx --out /tmp/out.csv --no-llm
cat /tmp/out.csv
```
