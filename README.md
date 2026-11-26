# LogicSight

> "AI는 실제로 주식투자를 잘할까?" — GPT·Claude·Gemini·DeepSeek가 **같은 데이터, 같은 규칙**으로 미국 대형주 30종목을 모의투자하고, 결과를 감사 가능한 기록으로 공개하는 웹 서비스.

교육·연구용 **모의투자**입니다. 실제 주문 기능은 없습니다(NH API는 시세 조회만, 주문 경로는 코드에서 차단).

## 공개 웹사이트 / 언어 / SEO

- 기본 주소 `/` 및 기존 `/lab` → `/ko` (기존 AI 리더보드 디자인 그대로, 로그인 없이 공개).
- 4개 언어: `/ko`, `/en`, `/zh`, `/ja`. 상단에서 언어 선택 시 현재 페이지의 종류를 유지합니다.
- AI 비교·수익률 차트·포트폴리오·거래·성과·AI 4개별 상세·종목별 판단 페이지와 실험 방법·FAQ·개인정보 페이지를 언어별로 제공합니다. 공개 광고 계획 페이지는 제거했습니다.
- `/robots.txt`, `/sitemap.xml` (48개 핵심 다국어 URL), `/llms.txt`와 `/ads.txt`를 구성했습니다.
- API/관리자 경로는 비밀번호 보호 상태를 유지합니다. NH 시세 원본·모의 체결 단가는 제공사의 재배포 권리가 확인될 때까지 공개 뷰에서 숨깁니다. AI가 생성한 판단 설명 원문은 현재 한국어이며, 4개 언어 자동 번역 별도 작업이 필요합니다.
- 애드센스는 사이트·계정 승인, 정책 검토, 인증된 동의관리(CMP) 연결 후에만 광고 코드가 작동하도록 비활성화된 광고 슬롯을 준비했습니다. 현재 광고/추적 스크립트는 로드되지 않습니다.
- [공개 웹사이트·SEO·광고 운영 가이드](docs/PUBLIC_LAUNCH.md).

## 구조

```
ai-invest-lab/
├─ engine/                 Python 3.11+ 자동 투자 엔진 (웹과 분리)
│  ├─ ail/
│  │  ├─ sources.py        NH PLUG 시세 어댑터(공식 nhplug SDK, 해외 일봉 gubun=3) + DEMO 합성 시세
│  │  ├─ market_data.py    수집·정합성 검사(누락/사후수정/분할 의심 중단)·분할조정·스냅샷(해시)
│  │  ├─ indicators.py     SMA20/50/200, EMA12/26, RSI14, MACD, 변동성, MDD, 모멘텀, 거래량 변화
│  │  ├─ decision.py       시스템 프롬프트 · JSON Schema · 응답 검증
│  │  ├─ llm.py            OpenRouter(모델 고정·비용 기록·예산 추정) + DEMO 규칙 공급자
│  │  ├─ portfolio.py      원장 · 다음 시가 체결 · 20% 한도 · 분할/배당/상장폐지 · 평가
│  │  ├─ pipeline.py       일일 실행 흐름(거래일 확인 → 수집 → 체결·평가 → 판단 회차)
│  │  ├─ stats.py          성과 지표(표본 부족 시 계산 안 함)
│  │  ├─ admin.py          모델 변경·일시중단·종목 변경·기업행동 입력·읽기 전용 재검증·비용 보고
│  │  └─ cli.py            `ail` 명령
│  └─ tests/               실제 PostgreSQL 기반 회귀 테스트
├─ supabase/migrations/    스키마 · 불변 트리거 · RLS
├─ web/                    Next.js 16 + TypeScript + Tailwind 4 + Lightweight Charts 5
└─ .github/workflows/      daily.yml(자동 실행) · ci.yml(테스트)
```

## 개발 및 실행 (LIVE 전용)

실제 NH PLUG 시세와 OpenRouter 실제 AI 응답만 서비스합니다. 웹 합성 JSON과 공개 DEMO 화면, `ail demo` CLI는 제거되었습니다.
시세·판단·모의 체결이 없으면 **실제 데이터 대기** 또는 연결 오류를 표시합니다. 수익률을 만들어내지 않습니다.

- 웹: `cd web && npm ci && npm run build` (운영 서버는 Supabase 비밀 환경변수가 필요)
- 엔진: `pip install ./engine` (GitHub Actions 서버 측)
- 매 방문 시 AI 호출 없음. 저장된 진짜 AI 판단 및 거래 기록만 읽습니다.
- 원본 NH 시세 및 가상 체결 단가는 공급자 재배포 허가 확인 전 공개하지 않습니다.

## 실제 운영 (live)

1. Supabase 프로젝트 생성 → `supabase db push` (또는 SQL 편집기에 `supabase/migrations/*.sql` 순서대로 실행)
2. GitHub Actions의 `Secrets and variables`에 비밀값을 직접 등록합니다. Secrets: `DATABASE_URL`, `OPENROUTER_API_KEY`, `NHPLUG_APP_KEY`, `NHPLUG_APP_SECRET` (키를 GitHub 코드, 채팅, Vercel 웹 프로젝트에 넣지 마세요).
   `DATABASE_URL`은 Supabase 대시보드 Connect > **Session pooler (5432)** 연결 문자열을 사용합니다. GitHub-hosted runner는 IPv4 전용입니다. DB 비밀번호가 URL 특수문자를 포함하면 URL 인코딩합니다.
3. 먼저 **읽기 전용 점검**: Actions → `provider-preflight` → Run workflow. DB `SELECT`, AAPL 과거 일봉 1회 조회, OpenRouter `/key`·`/models` 호출만 수행합니다. **실제 AI 판단·매매·DB 수정·자동 실행을 하지 않습니다.**
4. 외부 API 3개가 정상이라면 Actions → `model-smoke-test` → Run workflow를 눌러 **유료 AI 4회 호출**을 별도로 검증할 수 있습니다. 1종목(AAPL)의 실제 과거 종가만 사용하고, 같은 시장 스냅샷으로 4개 모델의 JSON 응답을 검증합니다. 예상 요청비용 총액이 $0.15를 초과하면 호출 전에 중단합니다(예상액일 뿐 실제 청구액의 절대 상한은 아님). 데이터베이스에 쓰거나 모의 주문을 만들지 않습니다.
5. 모든 점검이 통과해도 `AIL_ENGINE_ENABLED`는 `false` 또는 미설정으로 유지합니다. `daily-engine`의 실제 실행 활성화는 별도 운영 검증 후에만 진행합니다.
6. 이후 실험/데이터 초기화·장중 판단 시간 검증·비용 한도를 마친 뒤에만 LIVE 모의투자를 시작합니다.
7. 웹: Vercel 배포 → [docs/DEPLOY.md](docs/DEPLOY.md) (`DATA_MODE=demo` 유지).

### 매일 흐름

| 시각(ET) | 작업 | 내용 |
|---|---|---|
| 08:30 | `ail run-daily` | 직전 거래일 P까지 시세 수집·검사 → P까지 체결·평가 → P 기준 스냅샷 → 4개 AI 동시 호출 → 검증 → 오늘 시가 체결 대기 주문 |
| 폐장 후 | `ail run-settle` | 오늘 시가로 체결, 종가로 평가, 통계 갱신 |

`ail verify`는 **이미 저장된 기록**을 검사하며 새 시세 수집·정산의 성공 증거는 아닙니다.
`run-settle`은 대상 거래일의 시세와 AI 4개·벤치마크 3개 계좌의 실제 평가 자료를
`settlement_receipt`로 확인하고, 검증되지 않으면 실패합니다. 뉴욕 자정이 지난 뒤의 복구는
`AIL_EXPECTED_SESSION=YYYY-MM-DD ail run-settle`로 이미 폐장한 거래일을 명시합니다.
수집 시각은 실제 현재 시각으로 기록하며, 과거 AI 판단을 생성하지 않습니다.
시세 문제는 수집 전체를 되돌리고 모든 실패 종목을 함께 보고합니다. 읽기 전용 전체 종목 대조는
Actions의 `market-data-audit` 또는 `python engine/scripts/market_data_audit.py --through YYYY-MM-DD`를 사용합니다.

## 공정성·무결성 규칙 (코드와 테스트로 강제)

- 네 AI는 같은 시각, **같은 시장 스냅샷**(SHA-256 해시 저장)을 받음. 다른 AI 정보는 패킷에 없음.
- 판단은 개장 전에만 가능. 개장 이후 판단은 예외로 거부(시가를 알게 되므로).
- 체결 = 판단 이후 정규장 **시가** ± 슬리피지. 수수료는 센트 올림. 매도 먼저 → 매수, 종목코드 순.
- 매수는 현금·20% 비중을 실제 시가로 재검증하고, 위반 주문은 **수량을 엔진이 줄이지 않고 거부**(사유 기록).
- AI 하나라도 실패·무효 응답이면 그 회차 **신규 체결 전부 보류**. 중단된 회차는 자동 재호출하지 않음.
- 시세 누락 → 진행 중단(이전 가격으로 위장 체결 없음). 저장된 봉이 사후 수정되면 덮어쓰지 않고 중단.
  분할로 보이는 시가 갭(±40% 초과)인데 기업행동 기록이 없으면 중단 → `ail corporate-action` 입력 후 재실행.
- P0 데이터 경계: 기업행동은 `price_source`로 DEMO/실제 분리; 실시간 판단용 과거 가격은 `ex_date <= data_as_of`, `created_at <= cutoff`로 미래정보 차단 (DEMO는 고정 가상 이벤트 스케줄).
- 판단·주문·체결·원장·스냅샷·감사로그는 **DB 트리거로 수정·삭제 불가**. 중복 실행은 UNIQUE 제약 + advisory lock.
- 모델 ID는 고정. OpenRouter가 다른 모델로 응답하면 오류 처리. 자동교체 별칭(`~...-latest`) 금지.
- 월 예산: 회차 전체(4개) 예상비용이 남은 예산을 넘으면 아무도 호출하지 않음. 실제 토큰·비용은 `api_usage`에 기록.

## 관리자 명령

```bash
ail verify                         # 읽기 전용 재검증(원장↔보유, 스냅샷 해시, 체결가=시가, 판단<개장)
ail costs                          # 오늘/이번 달 AI별 요청·실패·토큰·비용
ail pause --reason "점검"           # 실험 일시중단 (resume 으로 재개)
ail set-model claude anthropic/claude-sonnet-5.5 --reason "..."   # 변경 이력·감사로그 기록
ail universe-add ADBE "Adobe" "Information Technology" --reason "..."
ail universe-remove CSCO --reason "..."
ail corporate-action NVDA split 2027-06-10 --ratio 10 --source "<IR 공시 URL>" # --price-source nh_plug 기본
# DEMO 전용 이벤트는 --price-source demo (실제 시세와 절대 혼합 불가)
ail corporate-action KO cash_dividend 2027-03-14 --amount 0.51 --source "<공시 URL>"
```

웹 관리자 화면은 아직 없습니다(CLI·SQL로 운영). 아래 "남은 일" 참고.

## 테스트

```bash
cd engine && pytest -q              # PostgreSQL 필요 (TEST_PG_ADMIN_URL, TEST_PG_ENGINE_URL)
cd web && npm run test:p0 && npm run typecheck && npm run test:secrets && npm run build
python web/tests/mobile_check.py    # next start 후 모바일 화면 점검(Playwright)
```

필수 테스트 대응: `test_engine.py`의 `test_01`…`test_14`, 모바일은 `web/tests/mobile_check.py`.

## 검증 상태 (정직한 표시)

| 항목 | 상태 |
|---|---|
| 원본 엔진·DB·RLS·체결·기업행동·벤치마크 | 원본 README: 로컬 PostgreSQL 16 테스트 35개 통과 (이번 수정에서 재실행 필요) |
| P0 수정(가격공급원 분리·미래분할 차단·live 차트) | 회귀 테스트 추가. 실제 PostgreSQL·Supabase·빌드 검증은 환경에 맞춰 재실행 필요 |
| NH PLUG 시세 연동 | ✅ provider-preflight에서 AAPL 일봉 5개 실제 조회 성공. 31종목 전체 데이터 적재와 이후 정기 안정성 검증은 별도. |
| NH 시세 수정주가 여부 | ⚠️ 명세에 표시 없음 → 분할 감지·중단 + 수동 기업행동 입력으로 대응 |
| OpenRouter 호출·비용 필드 | ✅ provider-preflight에서 인증·4모델 카탈로그 조회 성공. 4모델 실제 추론·JSON 성공은 model-smoke-test 수동 실행이 필요. |
| 각 모델의 structured output(json_schema) 지원 | ⚠️ 모델마다 다를 수 있음. 지원하지 않아도 엔진이 스키마로 다시 검증 |
| Supabase 웹 조회(DATA_MODE=live) | ✅ 비공개 Vercel health check에서 DB 연결 확인. LIVE 실험 계좌 생성 완료, 초기 AI 판단·성과 데이터는 아직 없음. |
| GitHub Actions | ✅ CI 및 provider-preflight 실행 성공. 이후 daily-engine을 자동 활성화하지 않음. |
| NH 시세 공개 재배포 권한 | ❌ 미확인 → 공개 편집형 사이트와 비공개 /lab을 분리. 원본 시세·투자 거래 상세 공개 금지. |

## P0 마이그레이션 및 기존 기록 주의

- 기존 DB는 반드시 백업한 뒤 `supabase db push`(새 `20261121000003_corporate_action_source_isolation.sql`)를 먼저 적용하십시오. 이후 엔진과 웹을 같이 배포해야 합니다.
- 이전 버전의 `DEMO (synthetic)` 기업행동만 기존 레코드에서 `price_source='demo'`로 분류합니다. 기존 원장과 거래 내역은 수정하지 않습니다.
- 과거에 실험 간 기업행동이 잘못 적용되어 기록이 오염된 경우 엔진이 해당 실험을 차단합니다. 과거 결과를 덮어쓰지 말고 새 실험을 시작해야 합니다.
- 판단용 시계열은 NH 기업행동의 DB 등록 시각도 검사합니다. 과거 시점에 나중에 등록된 이벤트는 당시 판단에 반영하지 않습니다.
- 웹의 live 차트는 `nh_plug` 가격만 불러와 엔진과 같은 분할조정 규칙을 적용합니다. 기존 데이터가 누락된 경우 보정하거나 만들어내지 않습니다.
- 번들된 `web/data/demo.json`은 **수정 전의 예시 생성물**입니다. 정확한 P0 규칙으로 데모 실험을 새로 만든 뒤 `python -m ail demo --sessions 60 --export ../web/data/demo.json`으로 다시 생성하십시오(동일 실험을 기존 DB에 재실행해도 과거 회차는 재계산하지 않습니다).

## 남은 일

- 실제 키로 1회 연결 점검(NH period 응답 1건, OpenRouter 4모델 각 1회)
- 웹 관리자 화면(실행 상태·비용·오류·종목/모델 관리 — 현재 CLI 제공)
- 주간·월간 자동 리포트, 모델 버전별 성과 비교 화면 (Phase 5)
- 배당 기준일/지급일 분리(현재는 배당락일에 현금 지급으로 단순화)

## 라이선스·출처

- NH투자증권 공식 SDK [nhplug-sdk](https://github.com/PLUG-OpenAPI/nhplug-sdk) (MIT, 의존성으로 사용)
- 설계 참고: [namuh-plug-ai-invest-lab](https://github.com/youtube-jocoding/namuh-plug-ai-invest-lab) (MIT) — 코드 복사 없이 개념 참고. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- 차트: TradingView Lightweight Charts™ (Apache-2.0, 차트에 TradingView 로고 표기 유지)
