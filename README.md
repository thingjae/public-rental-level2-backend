# 한빛구 공공 생활물품 대여소 · 백엔드 (Level 2)

거점 4곳의 공구, 캠핑, 생활, 행사 물품을 주민이 예약하고 반납하는 서비스의 **처리 서버(API)**입니다.
기획 내용은 [기획서.md](기획서.md)에 있습니다. 모든 기관, 인물, 연락처는 **가상**입니다.

> ⏳ **처음 접속이 느릴 수 있어요.** Render 무료 서버라 15분 동안 아무도 쓰지 않으면 잠들고, 다음 첫 요청에 1분 가까이 걸립니다. 고장이 아니에요. 잠시 기다리면 정상으로 돌아옵니다.

- 배포 주소: https://public-rental-level2-backend.onrender.com
- 프론트엔드 화면: https://public-rental-level2-frontend.vercel.app
- DB 연결 확인: https://public-rental-level2-backend.onrender.com/health
- 프론트엔드 저장소: https://github.com/thingjae/public-rental-level2-frontend

## 기술

| 부분 | 사용 |
| --- | --- |
| 서버 | NestJS 12 (TypeScript) |
| DB | PostgreSQL (Render), 이 과제 전용 스키마 `level2` |
| DB 도구 | Prisma 7 (`@prisma/adapter-pg`) |
| 입력값 확인 | class-validator (안내 문구는 한국어) |

## 데이터 구조

```
거점(locations) 1 ──< N 물품(items) 1 ──< N 예약(reservations)
                          └──< N 고장 신고(damage_reports)
```

예약 상태는 DB에 **예약 / 취소 / 반납 완료** 세 가지만 저장합니다. "대여 중"과 "반납 지연"은 지금 시각과 비교해 계산합니다. 모든 날짜 계산은 **한국 시간** 기준입니다(서버는 UTC로 돌기 때문).

## 서버가 지키는 규칙

규칙을 어기면 서버가 거절하고, `{ code, message }`로 쉬운 안내를 돌려줍니다.

| 코드 | 규칙 |
| --- | --- |
| R1 | 같은 물품은 겹치는 시간에 두 번 예약할 수 없다 (동시에 들어와도 하나만 성공) |
| R2 | 물품마다 정한 최대 대여 기간을 넘을 수 없다 (시간형 최대 6시간, 날짜형 최대 7일) |
| R3 | 한 사람(이름+연락처)은 예약과 대여 중을 합쳐 3건까지 |
| R4 | 시작일이 오늘부터 7일 이내여야 하고, 지난 시간은 예약할 수 없다 |
| R5 | 취소는 대여 시작 전까지만 |
| R6 | 점검 필요나 수리 중인 물품은 예약할 수 없다 |
| R7 | 반납 지연 중인 사람은 새로 예약할 수 없다 |
| R8 | 취소와 반납은 예약할 때 쓴 이름·연락처가 맞아야 한다 |

## API

| 기능 | 주소 |
| --- | --- |
| DB 연결 상태 | `GET /health` |
| 거점 목록 | `GET /locations` |
| 물품 목록 (검색·필터) | `GET /items?keyword=&locationId=&category=&availableNow=true` |
| 물품 상세 + 7일 예약 현황 | `GET /items/:id` |
| 물품 등록 | `POST /items` |
| 물품 상태 바꾸기 | `PATCH /items/:id/status` |
| 예약 신청 | `POST /reservations` |
| 내 예약 조회 | `POST /reservations/lookup` (이름·연락처는 주소창이 아니라 본문으로) |
| 예약 취소 | `POST /reservations/:id/cancel` |
| 반납 (QR 반납 포함) | `POST /reservations/:id/return` |
| 직원: 전체 예약 | `GET /admin/reservations?state=&locationId=` |
| 직원: 반납 처리 | `POST /admin/reservations/:id/return` |
| 고장 신고 / 목록 / 처리 | `POST /damage-reports`, `GET /damage-reports`, `PATCH /damage-reports/:id` |
| 현황 숫자 | `GET /stats?locationId=` |
| 가상 데이터 다시 채우기 | `POST /seed/reset` |

## Render에 올리기

**New → Web Service**에서 이 저장소를 고르고 아래처럼 넣습니다. 지역은 DB와 같은 **Singapore**.

| 칸 | 값 |
| --- | --- |
| Language | Node |
| Build Command | `npm ci && npm run build` |
| Start Command | `npx prisma migrate deploy && npm run start:prod` |
| Instance Type | Free |

**설정값 (Environment Variables)**

| 이름 | 뜻 | 예시 |
| --- | --- | --- |
| `DATABASE_URL` | DB 주소. Render DB의 **Internal** 주소 끝에 `?schema=level2` | `postgresql://...@dpg-xxxx-a/dbname?schema=level2` |
| `FRONTEND_ORIGIN` | 요청을 허용할 프론트엔드 주소. 여러 개면 쉼표, 끝에 `/` 없이 | `https://public-rental-level2-frontend.vercel.app` |

`PORT`는 Render가 자동으로 넣어 줍니다.

## 내 컴퓨터에서 실행

```bash
npm install
cp .env.example .env    # DATABASE_URL 에 Render DB의 External 주소 + ?schema=level2&sslmode=verify-full
npx prisma migrate deploy
npm run seed            # 가상 데이터 채우기
npm run start:dev       # http://localhost:4000
```

## 규칙 자동 점검

화면을 거치지 않고 서버에 직접 규칙 위반 요청을 보내서 모두 거절되는지 확인합니다. (시작과 끝에 가상 데이터를 다시 채웁니다)

```bash
npm run check-rules                                              # 로컬
API_URL=https://public-rental-level2-backend.onrender.com npm run check-rules   # 배포 서버
```

최근 결과: [배포 서버 35/35 통과](docs/check-rules-deployed.md) · [로컬 35/35 통과](docs/check-rules-local.md)
