# P0 수정 내역 · AI Invest Lab

범위: 기존 Python 엔진 / PostgreSQL(Supabase) / Next.js 구조 유지. 외부 실계좌 주문 기능 없음.

## 1. DEMO / live 기업행동 완전 분리

- `corporate_actions.price_source` 추가 (`nh_plug` / `demo`). `source`(원본 공시·참고 URL 문자열)와 별도의 **가격 공급원 구분**.
- 기존 DEMO 자료의 정확한 출처 표기 `source='DEMO (synthetic)'`만 `price_source='demo'`로 이전.
- `(symbol, kind, ex_date, price_source)` 복합 유니크 키.
- `portfolio.apply_corporate_actions`, `recorded_splits`가 가격 공급원 필터를 반드시 사용.
- 엔진/판단/데이터 내보내기에서 실험 모드와 가격 공급원이 다르면 차단.
- 이전 버전의 교차 적용이 원장이나 주문 만료 기록에 나타난 경우 새 엔진이 실행을 중단. 기존 원장·체결 데이터를 임의 변경하지 않음.

## 2. 판단 시점 기준(point-in-time) 분할 조정

- `recorded_splits`에 `through`(마지막 확정 거래일), `cutoff`(판단 시각) 조건 추가.
- 판단 스냅샷은 `ex_date <= through` 기업행동만 사용.
- live는 `created_at <= cutoff`인, **그 당시 DB에 등록되어 있던** 분할만 사용. DEMO는 역사 재생용 고정 가상 스케줄을 사용하므로 등록 시각 조건을 적용하지 않음.
- 거래 대상 목록에서 제외된 보유종목의 마지막 종가 조회도 가격 공급원/데이터 획득 시각 필터로 통일.

## 3. live 웹 시세와 차트 일치

- 기존의 모든 공급원 혼합 조회를 제거하고 `stock_prices.source='nh_plug'`만 조회.
- 거래 이력이 없는 미거래 종목도 조회하도록 전체 활성 종목·보유종목·거래종목으로 범위 확장.
- `corporate_actions`에서 `price_source='nh_plug'`, `kind='split'`, `ex_date<=through`, `created_at<=now` 조건을 적용하여 Python과 같은 '분할 전 OHLC÷비율, 거래량×비율' 계산.
- `DATA_MODE=live`로 DEMO 실험을 실수로 열 경우 즉시 오류.

## 테스트

- Python 구문 검사: **통과**.
- P0 Python 로직 모의 DB 스모크 테스트: **5개 통과**.
- 웹 가격조정 회귀 테스트: **3개 통과** (`npm run test:p0`).
- 신규 웹 가격조정 모듈 TypeScript 정적 검사: **통과**.
- 웹 비밀정보 검사: **통과**.
- 실제 PostgreSQL 회귀 테스트: **현재 작업 환경에 PostgreSQL/psycopg가 없어 미실행**. DB 기반 회귀 테스트 4개를 `engine/tests/test_p0_integrity.py`에 추가하고 CI에 반영함.
- Next.js 전체 `npm run typecheck`, `npm run build`: **작업 환경에 npm 의존성이 없어 미실행**. GitHub Actions CI에서 확인 필요.
- NH PLUG 및 OpenRouter 실제 API 호출: **미실행**.

## 배포 순서 (중요)

1. Supabase 운영 DB 백업.
2. `supabase db push`로 `20261121000003_corporate_action_source_isolation.sql` 적용.
3. GitHub Actions CI에서 Python/PostgreSQL·웹 테스트가 모두 통과하는지 확인.
4. 엔진과 웹을 함께 업데이트. `DATA_MODE=live`와 `AIL_EXPERIMENT`가 실제 live 실험을 가리키는지 확인.
5. 교차 적용으로 오염된 기존 원장이나 결정 기록은 변경하지 말고 **새로운 실험 이름으로 시작**.
6. 기존 `web/data/demo.json`은 과거 엔진으로 생성된 샘플(분할 이전 판단 11개 포함). 새 DEMO **데이터베이스와 실험 이름**에서 `python -m ail demo --sessions 60 --export ../web/data/demo.json`으로 재생성.

**아직 변경하지 않은 P1/P2:** 익명 DB 공개 읽기 정책, LLM 1개 실패 시 전원 중단 정책, 중복 실행 오류 처리, 외부 API 실호출 검증, 자동 보고서 등.
