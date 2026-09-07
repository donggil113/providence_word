# Contabo VPS 배포 가이드 (Cloudflare 도메인 연결)

로컬 PC 에서 돌리던 말씀 아카이브를 **Contabo 서버로 옮겨서 외부에 공개**하는 전체 절차입니다.
`providence-word.com` 기준으로 적었습니다.

전체 흐름:

```
[로컬 PC]  백업 파일 2개 만들기
    │ scp 로 전송
    ▼
[Contabo]  Docker 설치 → 소스 받기 → .env 작성
    │
    ├─ ① DB 만 켜고 백업 복원        (말씀 12,859편)
    ├─ ② 분류 마이그레이션 실행       (enum → Category 테이블)
    └─ ③ 전체 기동 (웹 + Caddy)      → HTTPS 자동 발급
    ▲
    │ A 레코드
[Cloudflare]  providence-word.com → 서버 IP
```

> ⚠️ **순서가 중요합니다.** ①②를 건너뛰고 웹을 먼저 켜면 새 스키마가 빈 DB에 먼저 만들어져,
> 나중에 백업을 복원할 수 없게 됩니다. 아래 순서를 그대로 따라 주세요.

---

## 0. 준비물

- Contabo 서버 IP (이메일로 받은 것)와 root 비밀번호
- Cloudflare 에 등록된 `providence-word.com`
- 로컬 PC 에서 돌아가는 현재 사이트 (컨테이너 `providence_db`, `providence_web`)

---

## 1. 로컬 PC — 데이터 백업 (Windows PowerShell)

프로젝트 폴더가 아니어도 됩니다. 컨테이너 이름으로 직접 뽑습니다.

```powershell
# 1) 데이터베이스
docker exec providence_db sh -c 'pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc -f /tmp/db.dump'
docker cp providence_db:/tmp/db.dump .\db.dump

# 2) 업로드된 원본 파일 (txt/pdf/hwp)
docker exec providence_web sh -c 'tar czf /tmp/uploads.tar.gz -C /app/uploads .'
docker cp providence_web:/tmp/uploads.tar.gz .\uploads.tar.gz

# 3) 크기 확인 (0바이트면 실패한 것)
dir db.dump, uploads.tar.gz
```

서버로 전송 (`서버IP`를 실제 주소로):

```powershell
scp .\db.dump .\uploads.tar.gz root@서버IP:/root/
```

---

## 2. Cloudflare — DNS 연결

Cloudflare 대시보드 → `providence-word.com` → **DNS** → 레코드 추가:

| 유형 | 이름 | 콘텐츠 | 프록시 상태 |
| --- | --- | --- | --- |
| A | `@` | 서버 IP | **DNS only (회색 구름)** |
| A | `www` | 서버 IP | **DNS only (회색 구름)** |

> 처음에는 반드시 **회색 구름(DNS only)** 으로 두세요. 주황색(프록시 켬) 상태면
> Let's Encrypt 인증서 발급이 실패할 수 있습니다. 발급이 끝난 뒤 9번에서 켜면 됩니다.

DNS 반영 확인 (몇 분 걸릴 수 있음):

```powershell
nslookup providence-word.com
```

서버 IP 가 나오면 다음 단계로.

---

## 3. 서버 접속 & 기본 설정

```bash
ssh root@서버IP

# 시스템 최신화
apt update && apt upgrade -y

# 시간대 (로그 시각을 한국 시간으로)
timedatectl set-timezone Asia/Seoul

# 방화벽: SSH·HTTP·HTTPS 만 개방
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 보안 업데이트 자동 적용
apt install -y unattended-upgrades
```

메모리가 4GB 미만이면 빌드 중 멈출 수 있으니 스왑을 만들어 둡니다:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## 4. Docker 설치

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version && docker compose version
```

`systemctl enable` 덕분에 **서버가 재부팅돼도 컨테이너가 자동으로 다시 뜹니다**
(compose 의 `restart: unless-stopped` 와 함께 동작).

---

## 5. 소스 받기 & 환경변수 작성

```bash
mkdir -p /opt && cd /opt
git clone -b claude/sermon-archive-website-a6rks2 \
  https://github.com/donggil113/providence_word.git
cd providence_word

cp .env.example .env

# 비밀번호/시크릿 생성 (아래 두 값을 복사해 두세요)
openssl rand -base64 32   # ← POSTGRES_PASSWORD 용
openssl rand -base64 48   # ← AUTH_SECRET 용

nano .env
```

`.env` 에서 아래 항목을 채웁니다:

```ini
POSTGRES_USER=providence
POSTGRES_PASSWORD=위에서_만든_32자
POSTGRES_DB=providence_word
DATABASE_URL=postgresql://providence:위에서_만든_32자@db:5432/providence_word?schema=public

AUTH_SECRET=위에서_만든_48자

SITE_DOMAIN=providence-word.com
ACME_EMAIL=본인메일@example.com

NEXT_PUBLIC_SITE_NAME=섭리 말씀 아카이브
NEXT_PUBLIC_SITE_URL=https://providence-word.com

UPLOAD_DIR=/app/uploads
```

- `DATABASE_URL` 의 비밀번호는 `POSTGRES_PASSWORD` 와 **똑같아야** 합니다. 호스트는 `db` 그대로 두세요.
- 비밀번호에 `@ : / ?` 같은 기호가 들어가면 URL 이 깨집니다. 위 `openssl` 결과에 그런 문자가
  있으면 다시 생성하거나 영문+숫자로만 만드세요.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` 는 **계정이 하나도 없을 때만** 쓰입니다.
  백업을 복원하면 기존 계정과 비밀번호가 그대로 살아나므로 신경 쓰지 않아도 됩니다.

저장은 `Ctrl+O` → `Enter`, 종료는 `Ctrl+X` 입니다.

앞으로 명령이 길어지니 별칭을 하나 만들어 둡니다:

```bash
alias pw='docker compose -f docker-compose.yml -f docker-compose.prod.yml'
```

---

## 6. ① DB 만 먼저 켜고 백업 복원

```bash
pw up -d db
sleep 15 && pw ps        # db 가 (healthy) 인지 확인
```

```bash
# 덤프를 컨테이너로 넣고 복원
docker cp /root/db.dump providence_db:/tmp/db.dump
pw exec -T db sh -c 'pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --no-owner /tmp/db.dump'

# 건수 확인 — 12859 가 나와야 합니다
pw exec -T db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT count(*) FROM sermons;"'
```

업로드 파일도 복원합니다. 볼륨 이름을 먼저 확인하세요:

```bash
docker volume ls | grep uploads     # 보통 providence_word_uploads
docker run --rm -v providence_word_uploads:/data -v /root:/backup alpine \
  tar xzf /backup/uploads.tar.gz -C /data
docker run --rm -v providence_word_uploads:/data alpine sh -c 'ls /data | wc -l'
```

> `pg_restore` 중에 `WARNING`, `errors ignored on restore` 같은 메시지가 몇 줄 나오는 것은
> 정상입니다 (소유자·확장 관련). 위 `count(*)` 가 맞으면 성공입니다.

---

## 7. ② 분류 마이그레이션 (데이터 손실 없음)

로컬에서 쓰던 DB 는 분류가 `enum` 컬럼이라, 새 코드의 `Category` 테이블 구조로 옮겨야 합니다.
이 스크립트는 하나의 트랜잭션으로 돌고, 중간에 문제가 생기면 전부 되돌립니다.

```bash
pw run --rm --entrypoint sh web -c 'npx tsx scripts/migrate-category.ts'
```

실행 전후 건수와 분류별 분포를 출력합니다. **12,859 → 12,859** 로 같은지 확인하세요.

이어서 본문에 섞여 들어간 파일명·페이지 머리말도 정리합니다 (선택이지만 권장):

```bash
pw run --rm --entrypoint sh web -c 'npx tsx scripts/clean-content.ts --dry-run --show 5'
pw run --rm --entrypoint sh web -c 'npx tsx scripts/clean-content.ts'
```

---

## 8. ③ 전체 기동 + HTTPS 발급

```bash
pw up -d --build
```

첫 빌드는 3~5분 정도 걸립니다. 끝나면 인증서 발급 로그를 확인하세요:

```bash
pw logs -f caddy
```

`certificate obtained successfully` 가 보이면 성공입니다. `Ctrl+C` 로 로그를 빠져나온 뒤:

```
https://providence-word.com
```

브라우저에서 자물쇠 아이콘과 함께 말씀 목록이 보이면 완료입니다.
로그인은 **로컬에서 복구한 그 이메일·비밀번호** 그대로입니다.

### 잘 안 될 때

| 증상 | 확인 |
| --- | --- |
| 접속 자체가 안 됨 | `nslookup providence-word.com` 이 서버 IP 인지, `ufw status` 에 80/443 이 있는지 |
| 인증서 발급 실패 | Cloudflare 프록시가 **회색 구름**인지 (2번), `pw logs caddy` 의 오류 메시지 |
| 502 Bad Gateway | `pw logs web` — DB 접속 실패면 `.env` 의 `DATABASE_URL` 비밀번호 확인 |
| 말씀이 0편 | 6번 복원을 건너뛴 경우. `pw down`(**`-v` 금지**) 후 6번부터 다시 |

---

## 9. Cloudflare 프록시 켜기 (선택)

HTTPS 가 정상 동작하는 것을 확인한 뒤에 하세요. 켜면 서버 IP 가 감춰지고 DDoS 방어·캐시를 받습니다.

1. **SSL/TLS → 개요**에서 암호화 모드를 **Full (strict)** 로 먼저 변경
2. **DNS** 에서 두 A 레코드를 **주황색 구름(프록시됨)** 으로 변경

> 모드가 **Flexible** 이면 무한 리디렉션이 발생합니다. 반드시 **Full (strict)** 로 두세요.
> 무료 플랜은 업로드 100MB 제한이 있는데, 이 사이트의 파일당 최대는 50MB 라 문제없습니다.

---

## 10. 운영

**정기 백업** — 서버 안에만 두면 의미가 약하니, 받은 파일을 다른 곳에도 복사하세요.

```bash
sh scripts/backup.sh                    # ./backups 에 저장
crontab -e
# 매일 새벽 3시
0 3 * * * cd /opt/providence_word && sh scripts/backup.sh >> /var/log/pw-backup.log 2>&1
```

**코드 업데이트**

```bash
cd /opt/providence_word
git pull
pw up -d --build
```

**자주 쓰는 명령**

```bash
pw ps                 # 상태 확인
pw logs -f web        # 웹 로그
pw restart web        # 재시작
pw down               # 정지 (데이터는 볼륨에 그대로 남음)
```

> ⚠️ `pw down -v` / `docker compose down -v` 는 **볼륨(= 말씀 데이터 전체)을 삭제**합니다.
> 어떤 경우에도 `-v` 를 붙이지 마세요.

**계정 관리** — 로그인 후 **관리 → 계정 관리**에서 추가/삭제합니다.
비밀번호를 다시 잊었다면 서버에서:

```bash
pw run --rm --entrypoint sh web -c 'npx tsx scripts/reset-admin.ts --list'
pw run --rm --entrypoint sh web -c 'npx tsx scripts/reset-admin.ts --email 본인메일'
```
