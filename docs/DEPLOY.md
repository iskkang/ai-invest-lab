# Vercel 배포 가이드

## P0 필수 선행조건

- 운영 DB 백업 후 새 마이그레이션 `20261121000003_corporate_action_source_isolation.sql` 적용.
- 마이그레이션 적용 **전** 새 엔진·웹 버전 사용 금지 (새 `corporate_actions.price_source` 컬럼 필요).
- 재실행은 새 실험명(`AIL_EXPERIMENT`)으로 시작할 것을 권장. 기존 실험의 과거 판단은 정정하지 않으며 이전 버전에서 오염된 원장은 엔진이 차단함.
- DEMO 화면 예시 JSON은 수정 전 생성되었으므로 새 DEMO 실험에서 다시 내보내야 함.

1. Vercel → New Project → 이 저장소 → **Root Directory: `web`** (Framework: Next.js 자동 인식)
2. Environment Variables (Production) — 모두 서버 전용, `NEXT_PUBLIC_` 접두사 쓰지 않음
   | 이름 | 값 |
   |---|---|
   | `DATA_MODE` | `live` (처음엔 `demo`로 화면 확인) |
   | `SUPABASE_URL` | Supabase 프로젝트 URL |
   | `SUPABASE_ANON_KEY` | anon 키 (RLS로 공개 테이블 SELECT만 가능) |
   | `AIL_EXPERIMENT` | 엔진과 같은 실험 이름 |
   | `SITE_ACCESS` | `private` (NH 시세 공개 권한 확인 전까지) |
   | `SITE_USER` / `SITE_PASSWORD` | 비공개 모드 접속 계정 |
3. **넣지 말 것**: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `NHPLUG_*` — 웹은 저장된 결과만 읽습니다.
4. 페이지는 5분마다 재검증(ISR). 사용자 방문으로 AI·NH API가 호출되는 경로는 없습니다.
5. 공개 전환 체크리스트
   - [ ] NH투자증권에 시세 데이터 웹 재표시·재배포 가능 여부 서면 확인
   - [ ] 화면 하단 모의투자·투자권유 아님 고지 확인
   - [ ] `SITE_ACCESS=public` 으로 변경 (noindex 해제됨)
