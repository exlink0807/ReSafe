# RE:SAFE — AI Digital Safety & Recovery Platform

딥페이크·불법촬영물·온라인 사기 등 디지털 범죄 피해자가 **신고 → 상담 → 삭제요청 → 후속지원**을 한 흐름으로 진행할 수 있도록 돕는 플랫폼입니다. 이 저장소는 해커톤 MVP 코드베이스이며, VS Code에서 바로 열어 개발을 이어갈 수 있는 Next.js/TypeScript/Supabase 구조입니다.

> ⚠️ **이 코드는 데모(SIMULATED) 단계입니다.** 실제 플랫폼 크롤링, 실제 LLM 연동, 실제 EEG 기기 연동은 구현되어 있지 않습니다. 아래 "실제 vs 시뮬레이션" 표에서 어떤 기능이 진짜 동작하고 어떤 기능이 자리만 잡아둔 것인지 확인하세요.

---

## 1. 빠른 시작 (VS Code)

```bash
# 1. 의존성 설치 (네트워크 필요 — 이 코드는 샌드박스에서 작성되어 설치/빌드가
#    실행·검증되지 않았습니다. 처음 실행 시 타입 오류가 있을 수 있습니다.)
npm install

# 2. 환경변수 설정
cp .env.example .env.local
# NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 본인 Supabase 프로젝트 값으로 채우기

# 3. Supabase에 스키마 적용 (Supabase SQL Editor에서 supabase/schema.sql 실행)

# 4. 개발 서버 실행
npm run dev
# http://localhost:3000
```

VS Code에서 열면 `app/`, `components/`, `lib/` 폴더 구조로 바로 탐색·수정이 가능합니다. `@/` 경로 별칭은 `tsconfig.json`의 `paths`로 설정되어 있습니다.

---

## 2. 전체 구조

```
resafe-next/
├─ app/
│  ├─ layout.tsx, page.tsx, globals.css      # App Router 엔트리
│  └─ api/{cases,trace,evidence,removal,watermark}/route.ts   # API 라우트
├─ components/
│  ├─ Nav.tsx                 # 좌측 탭 네비게이션
│  ├─ AiSecurityCard.tsx       # 항상 보이는 AI 보안 현황 사이드바
│  ├─ Dashboard.tsx, Report.tsx, TraceRemove.tsx, Recover.tsx, Prevent.tsx, Vault.tsx
├─ lib/
│  ├─ types.ts                 # AppState, 신고 질문 16문항, 상태 기본값
│  ├─ store.ts                 # useAppState() — localStorage 영속화 React 훅
│  ├─ supabase.ts              # 사용자 JWT 기반 DB 클라이언트, 케이스 소유권 검증, audit/보안이벤트 로깅
│  ├─ privacy.ts                # 원문 미전송 가드, PII 마스킹
│  ├─ ai/
│  │  ├─ guard.ts               # 입력 가드·숨은 지시 제거·모의 AI 응답 (규칙 기반 1차 필터)
│  │  ├─ llm.ts                 # 실제 Claude API 호출 래퍼 (2차 판정, 키 없으면 호출 안 함)
│  │  ├─ outputGuard.ts         # 출력 가드 — canary 토큰 유출·미동의 PII 노출 탐지
│  │  ├─ client.ts              # 클라이언트에서 /api/ai/reply 호출 + 실패 시 모의 응답 폴백
│  │  ├─ categorize.ts          # 신고 답변 → 범죄 유형 분류 + 실제 연락처
│  │  └─ provider.ts            # 추적(Trace) 공급자 인터페이스 (기본: simulated)
│  ├─ security/
│  │  ├─ phash.ts               # 8x8 perceptual hash + Hamming distance (재유포 탐지)
│  │  └─ watermark.ts           # LSB 스테가노그래피 비가시 워터마크
│  └─ pdf/statement.ts          # 진술서 HTML 생성 + window.print() 기반 PDF 저장
├─ app/api/ai/reply/route.ts    # 신고 전 상담·추가 상담 공용 AI 응답 엔드포인트 (가드→LLM→출력가드)
└─ supabase/schema.sql          # 전체 DB 스키마 + RLS 정책
```

---

## 3. 4단계 흐름과 기능 명세

### Step 1. 신고 — 반복 설명 없이 안전하게 접수 (`components/Report.tsx`)
- **구현됨:** 사이버범죄 신고 시 일반적으로 요구되는 항목들에 대응하는 **16개 질문**을 순서대로, 대화형으로 진행합니다 (`lib/types.ts`의 `INTAKE_QUESTIONS`). 모든 질문에 "건너뛰기"가 있어 답하기 어려운 항목을 스킵할 수 있습니다.
  - ⚠️ **정직한 고지:** 이 16개 문항은 일반적으로 알려진 신고 카테고리를 참고해 구성한 것이며, 경찰청·디지털성범죄피해자지원센터의 **공식 신고서 양식을 직접 확인하고 만든 것이 아닙니다.** 실제 제출 전 해당 기관에 필수 항목을 재확인하는 것을 권장합니다.
  - 기존 12문항에 **가해자 추가 인적사항·경제적 피해·증거 보유 현황·처벌 의사** 4개 문항을 보완했습니다 (`lib/types.ts`).
- **구현됨:** 16개 답변이 모이면 `lib/ai/categorize.ts`가 **디지털 성범죄 / 사이버사기 / 사이버 명예훼손·모욕 / 기타 디지털 범죄** 중 하나로 분류하고, 분류별로 검증된 실제 연락처(112, 디지털성범죄피해자지원센터 02-735-8994, 여성긴급전화 1366, 경찰청 ECRM, 금융감독원 1332 등)를 제시합니다.
- **구현됨 — 신고 중 위기 신호 감지:** 추가 상담 창뿐 아니라 **신고 답변 자체**에서도 자살·자해 신호가 감지되면 즉시 지원 연계 메시지(1393, 109)를 대화에 끼워 넣습니다 (`Report.tsx`의 `answer()` → `guardCheck()`).
- **구현됨 — PDF 진술서 저장:** `lib/pdf/statement.ts`가 답변을 표로 정리한 진술서 HTML을 만들고, `window.print()`로 인쇄/PDF 저장합니다 (라이브러리 기반 PDF 대신 브라우저 인쇄를 쓰는 이유: 한글 폰트 임베딩 문제 회피).
- **구현됨 — "AI에게 물어보기":** 신고 도중 질문이 이해 안 되면 별도 입력창으로 AI에게 물어볼 수 있습니다. 내부적으로 `/api/ai/reply`를 호출합니다 (아래 Step 2 참고).
- **왜 이렇게 설계했나:** 피해자가 경찰서·상담센터·플랫폼마다 같은 이야기를 반복하는 것이 2차 피해입니다. 매뉴얼 순서 그대로 한 번만 답하게 하고, 그 결과를 구조화된 형태로 어디든 들고 갈 수 있게 하는 것이 핵심입니다.

### Step 2. 상담 — AI 상황 정리와 지원 안내 (`Report.tsx`의 "추가 상담" + `app/api/ai/reply/route.ts`)
- **구현됨 — 실제 LLM 연동 배선 (`lib/ai/llm.ts`):** 신고 전 상담의 "AI에게 물어보기"와 "추가 상담" 모두 **단일 서버 엔드포인트** `/api/ai/reply`를 거칩니다. 처리 순서:
  1. `requireUser()` — 로그인 확인
  2. (caseId가 있으면) `requireOwnedCase()` — 본인 소유 사례인지 DB로 검증
  3. `stripHiddenInstructions()` — 숨은 지시 제거
  4. `guardCheck()` — 위기/인젝션 1차 필터 (규칙 기반)
  5. 통과한 입력만 `callLlm()`으로 **실제 Claude API 호출** (`ANTHROPIC_API_KEY` 설정 시)
  6. 응답은 `checkOutput()`(출력 가드)을 통과한 것만 반환
  - **키가 없거나 호출이 실패하면** 자동으로 기존 규칙 기반 모의 응답(`mockAiReply`)으로 폴백합니다 — API 키 없는 환경(심사용 노트북 등)에서도 데모가 끊기지 않습니다.
  - ⚠️ **정직한 고지:** 이 LLM 연동 코드는 네트워크가 차단된 환경에서 작성되어, **실제 Anthropic API 호출을 이 세션에서 테스트하지 못했습니다.** `npm install` 후 `ANTHROPIC_API_KEY`를 넣고 직접 호출해보며 확인이 필요합니다.
  - **로그인(Supabase Auth) 화면이 구현되었습니다** (`app/login/page.tsx`, `lib/supabaseBrowser.ts`, `lib/useSession.ts`). 이메일/비밀번호로 가입·로그인하면 `app/page.tsx`가 세션을 확인해 메인 앱을 보여주고, `lib/ai/client.ts`가 로그인 세션의 액세스 토큰을 `Authorization` 헤더에 실어 `/api/ai/reply`를 호출합니다 — 이제 로그인하면 실제 LLM 호출 경로가 열립니다. 로그인 안 한 상태이거나 호출이 실패하면 여전히 클라이언트 쪽 모의 응답으로 자연스럽게 폴백합니다.
  - ⚠️ **Supabase 설정 한 가지 필요:** 기본값은 가입 시 이메일 확인 메일을 요구합니다. 데모 중 번거로우면 Supabase 대시보드 → Authentication → Providers → Email → **"Confirm email" 끄기**로 가입 즉시 로그인되게 할 수 있습니다.
- **구현됨 — 출력 가드 (`lib/ai/outputGuard.ts`):** 응답마다 무작위 canary 토큰을 시스템 프롬프트에 심고, 그 토큰이 응답에 그대로 나오면 "시스템 프롬프트 유출"로 판정해 안전한 대체 메시지로 교체합니다. 이메일/전화번호/UUID 형태 문자열이 사용자가 이번 턴에 직접 말하지 않은 형태로 응답에 등장해도 같은 방식으로 차단합니다.
- **구현됨 — 세션/권한 격리 (`lib/supabase.ts`의 `requireOwnedCase()`):** AI가 대화 중에 어떤 case_id나 다른 사용자 이름을 말하더라도, 서버는 그 말을 쿼리에 쓰지 않습니다. 클라이언트가 보낸 caseId는 DB에서 "요청자 본인 소유가 맞는지" 검증한 뒤에만 사용되고, 실패하면 즉시 403으로 막습니다.
- **구현됨 — AI 보안 레이어 1차 필터 (`lib/ai/guard.ts`):**
  - `INJECTION_RULES` 10종: 시스템 프롬프트 탐색, 이전 지시 무시, 역할 변경(관리자 모드 등), 타 사용자 정보 조회 시도, 인코딩된 페이로드 등을 정규식으로 탐지.
  - `CRISIS_RULES`: 자살·자해 신호를 탐지하면 차단이 아니라 **상담 연계 메시지**(1393, 109)로 분기.
  - `stripHiddenInstructions()`: 증거 텍스트·외부 페이지 텍스트에서 숨은 지시 문장을 줄 단위로 제거.
  - 사이드바의 "AI 가드 켜짐/꺼짐" 토글로 방어 전/후 차이를 직접 시연할 수 있습니다 (꺼두면 LLM 호출 없이 "유출 데모" 메시지를 그대로 보여줌).
- **왜 이렇게 설계했나(설계 전제):** 가해자가 피해자의 지인이거나 같은 서비스에 접근할 수 있다는 전제를 둡니다. "한 번만 말한다" 원칙 때문에 한 세션에 신고·증거·삭제요청·회복 기록이 모두 모이므로, AI 하나가 뚫리면 여러 민감정보가 한꺼번에 노출됩니다. 그래서 AI가 다루는 모든 입력(대화, 증거 파일, 외부 페이지)을 공격 경로로 보고 방어합니다.

### Step 3. 삭제요청 — 플랫폼·기관 연계 삭제 요청 (`components/TraceRemove.tsx`)
- **구현됨:** 추적 후보 목록(현재는 `lib/ai/provider.ts`의 `simulatedProvider`가 고정 데모 데이터 반환) → "삭제요청" 버튼 → 상태 추적(`prepared → submitted → reviewing → removed/rejected/unknown`)까지 전체 흐름이 동작합니다.
- **구현됨:** `lib/security/phash.ts`의 8×8 평균 해시 + Hamming distance로 "같은 이미지의 변형본"을 유사도(%)로 비교하는 로직 — 데모 HTML 버전에서는 실제 캔버스로 동작을 확인했습니다. Next.js 버전에도 동일 함수가 포팅되어 있으나, 실제 업로드→비교 UI 연결은 다음 단계 작업입니다.
- **시뮬레이션:** 실제 플랫폼 크롤링/스크래핑, 실제 삭제요청 API 연동은 없습니다. `TraceProvider` 인터페이스(`lib/ai/provider.ts`)로 추상화되어 있어, 실제 공급자를 붙일 때 이 인터페이스만 구현하면 됩니다 — 단, 반드시 **플랫폼 ToS/robots.txt 준수, 공개 데이터만 조회, 무단 접근·로그인 우회 금지** 원칙을 지켜야 합니다 (아래 "화이트 해킹 경계" 참조).

### Step 4. 후속지원 — 진행 상황 관리와 회복 연계 (`components/Recover.tsx`, `Prevent.tsx`, `Vault.tsx`)
- **구현됨:** 뉴로피드백 세션 기록 UI(데모 난수 데이터), 법률/심리 상담 연계 연락처, 예방 체크리스트.
- **구현됨 — 비가시 워터마크 (`lib/security/watermark.ts`):** PNG 이미지의 블루 채널 LSB에 "RSAF" + 16자리 코드를 심어, 언제·어디에·어떤 목적으로 게시할지(게시 예정일 포함)를 눈에 보이지 않게 기록합니다. 지인 범죄 억제 + 유출 시 후보 좁히기 목적. **한계(항상 고지할 것):** 무손실 PNG에서만 보존되며, JPEG 재압축·리사이즈·스크린샷에는 살아남지 않습니다. 100% 유출자 식별을 보장하지 않는 보조 수단입니다.
- **구현됨 — 증거 보관함 (`Vault.tsx`):** 이미지/영상은 SHA-256 해시만 계산해 저장(원본 비전송), 텍스트 증거는 "AI 요약"을 누르기 전까지 원문을 어디에도 저장하지 않습니다(브라우저 메모리 한정) — 피해자 본인이 "정리해서 넘길지"를 직접 결정하는 원칙.
- **시뮬레이션:** 실제 EEG 기기 SDK 연동, 딥페이크 생성 차단(얼굴 인식 기반) 기술은 미구현.

---

## 4. 강조 차별점 5가지 — 현재 구현 상태

| 차별점 | 상태 | 위치 |
|---|---|---|
| 자체 보안(AI도 공격받는다는 전제) | **구현됨 — 로그인까지 연결됨.** 입력 가드·출력 가드·세션 격리·실제 LLM 연동·로그인이 모두 배선되어 있고, `ANTHROPIC_API_KEY`만 설정하면 로그인 후 실제 Claude 응답이 나옵니다 | `lib/ai/guard.ts`, `lib/ai/llm.ts`, `lib/ai/outputGuard.ts`, `app/api/ai/reply/route.ts`, `app/login/page.tsx` |
| 뉴로피드백 | **데모 UI만** — 실제 EEG 연동 없음 | `components/Recover.tsx` |
| 화이트 해킹(불법 사이트 탐지) | **미구현, 다음 단계 핵심 과제** | 아래 5번 섹션 |
| 워터마킹 | **구현됨** — 클라이언트 스테가노그래피 | `lib/security/watermark.ts` |
| 딥페이크 생성 차단(얼굴 인식 기반) | **미구현** | — |

---

## 5. 다음 개발 중점: 화이트 해킹 & 보안 심화

> **경계(반드시 지킬 것):** 자체 소유 테스트 환경, 명시적으로 권한을 받은 외부 시스템, 공개 보안 리서치 프로그램(버그바운티 등)에서만 테스트합니다. **무단 접근, 인증 우회, 침입, 데이터 유출, 악성코드 작성·배포는 어떤 명분으로도 하지 않습니다.** "불법 사이트 탐지"는 공개적으로 접근 가능한 정보(OSINT) 기반 식별·신고 흐름으로 한정하고, 해당 사이트에 대한 공격성 행위(해킹)로 확장하지 않습니다.

이 원칙 위에서, 현재 코드베이스를 기반으로 다룰 수 있는 구체적 작업들 (✅는 이번 라운드에서 배선까지 완료, 🔲는 아직 미착수):

0. ✅ **Supabase Auth 로그인 화면 구현.** `app/login/page.tsx`(이메일/비밀번호 가입·로그인), `lib/supabaseBrowser.ts`(브라우저 세션 클라이언트), `lib/useSession.ts`(세션 훅)를 추가했습니다. `app/page.tsx`는 로그인 안 되어 있으면 `/login`으로 보내고, `lib/ai/client.ts`는 세션의 액세스 토큰을 `Authorization` 헤더에 실어 보냅니다. 이제 `ANTHROPIC_API_KEY`만 설정하면 **1번(LLM 연동)·6번(세션 격리)이 로그인 후 실제로 동작합니다.**
1. ✅ **LLM 연동:** `lib/ai/llm.ts`로 Claude API 호출 배선 완료, 로그인과도 연결됨. 다만 이 세션은 네트워크가 차단되어 있어 **실제 API 호출·응답 품질을 직접 테스트하지 못했습니다** — `ANTHROPIC_API_KEY`를 넣고 로그인한 뒤 실제 대화 품질을 확인해 주세요.
2. ✅ **문항 검증 및 보완:** 12문항 → 16문항으로 확장(가해자 추가 정보/경제적 피해/증거 보유/처벌 의사). 단, 공식 체크리스트로 검증된 것은 아니므로 실제 접수 기관 확인 권장.
3. ✅ **위기평가 통합:** 신고 전 상담 답변 자체에서도 위기 신호를 감지하도록 `Report.tsx`의 `answer()`에 반영.
4. ✅ **PDF 저장:** `lib/pdf/statement.ts` + `window.print()`로 실제 동작하도록 연결.
5. ✅ **출력 가드:** `lib/ai/outputGuard.ts`로 canary 토큰 유출·PII 패턴 노출 차단 구현. 다만 PII 정규식은 이메일/전화번호/UUID 형태만 보수적으로 잡는 수준이라, 실제 운영 전 더 넓은 패턴(주민번호, 계좌번호 등)과 오탐률 테스트 필요.
6. ✅ **세션/권한 격리:** `lib/supabase.ts`의 `requireOwnedCase()`로 "AI가 말한 case_id"가 아니라 "DB가 검증한 소유권"만 쓰도록 구현. 로그인이 연결되어 이제 실제 요청 경로에서 검증이 일어남 — 다만 "다른 사람 계정으로 로그인해서 접근 시도" 같은 실제 침투 테스트는 아직 수행되지 않았음.
7. 🔲 **RLS 테스트:** `supabase/schema.sql`의 모든 정책에 대해 "다른 사용자 토큰으로 접근 시 반드시 0행 반환"을 검증하는 통합 테스트 작성. 특히 `ai_security_events`처럼 `user_id` OR `case_id` 이중 조건 정책은 우회 경로가 없는지 집중 점검.
8. 🔲 **입력 가드 고도화:** `lib/ai/guard.ts`의 `INJECTION_RULES`를 실제 공격 문장 세트(OWASP LLM Top 10의 프롬프트 인젝션 예시 등) 기준으로 확장하고, 각 규칙에 대한 회귀 테스트(참/거짓 양쪽) 작성.
9. 🔲 **CSP·XSS 재검토:** `Report.tsx`/`Vault.tsx`는 AI 응답(신뢰 문자열)만 `dangerouslySetInnerHTML`로 렌더링하고 사용자 입력은 `esc()`로 이스케이프하지만, 새 기능 추가 시 이 원칙을 계속 지켜야 함. `next.config.mjs`에 CSP 헤더 추가 권장.
10. 🔲 **비밀값 관리:** `.env.local`이 커밋되지 않는지, `ANTHROPIC_API_KEY`·Supabase anon key 모두 안전하게 관리되는지(특히 `ANTHROPIC_API_KEY`는 `NEXT_PUBLIC_` 접두사가 없어야 서버 전용으로 유지됨) 재확인.
11. 🔲 **의존성 스캔:** `npm audit` / Dependabot 설정, OWASP Top 10에 현재 구조를 매핑한 체크리스트 작성.
12. 🔲 **워터마크·phash 한계 문서화:** 실제 공격 시나리오(스크린샷, 재인코딩)에서 현재 구현이 실패하는 지점을 정리하고, 대안 검토.

---

## 6. 알려진 제약 (정직하게 고지)

- 이 저장소는 네트워크가 차단된 샌드박스에서 작성되어 **`npm install`/`npm run build`가 실행·검증되지 않았습니다.** 처음 실행 시 타입 오류나 누락된 패키지가 있을 수 있습니다. (타입스크립트 문법 자체는 `tsc`로 개별 검사해 오류 없음을 확인했습니다.)
- **로그인(Supabase Auth) 화면이 구현되었습니다** (`/login`). 다만 이메일 확인 설정에 따라 가입 직후 바로 로그인이 안 될 수 있으니 위 "Step 2"의 설정 안내를 참고하세요. 로그인 상태가 아니면 AI 상담은 자동으로 모의 응답으로 동작합니다(의도된 폴백).
- **다른 화면(신고/추적/증거)은 여전히 로그인 사용자의 DB(Supabase `cases` 등 테이블)와 연결되어 있지 않습니다.** 지금은 모든 신고·추적·증거 데이터가 **브라우저 localStorage에만** 저장됩니다. `app/api/cases`, `app/api/evidence` 등 API 라우트 자체는 만들어져 있지만, 화면(`Report.tsx`, `Vault.tsx` 등)에서 아직 이 라우트들을 호출하도록 연결하지 않았습니다 — 그래서 로그인해도 "내 신고 데이터가 DB에 남는다"는 보장은 아직 없습니다. 이 연결 작업이 아직 남아있습니다.
- `lib/ai/llm.ts`의 실제 Claude API 호출 코드는 **이 세션에서 네트워크 제약으로 테스트하지 못했습니다.** `ANTHROPIC_API_KEY`를 넣고 실제로 호출해보며 모델명, 응답 형식(response.content 구조) 등을 확인해 주세요.
- 모든 "추적", "삭제요청 상태 변화", "EEG 세션", "딥페이크 생성 차단"은 **SIMULATED**입니다. 실제 서비스로 전환하려면 각 모듈의 인터페이스(`TraceProvider`, EEG SDK 연동 지점 등)를 실제 구현으로 교체해야 합니다.
- 신고 문항(16개)은 **공식 신고서 양식을 검증하고 만든 것이 아닙니다.** 일반적으로 알려진 카테고리를 참고한 근사치이니, 실제 제출 전 경찰청 사이버수사국·디지털성범죄피해자지원센터에 필수 항목을 재확인하세요.
- 출력 가드의 PII 탐지는 이메일/전화번호/UUID 형태만 보는 **보수적인 수준**이라, 더 다양한 유출 패턴(이름+맥락 조합 등)은 아직 못 잡습니다.
- 연락처(112, 02-735-8994, 1366, 1332 등)는 **작성 시점 기준**이며 변동될 수 있습니다. 실제 신고 전 재확인을 권장합니다.
