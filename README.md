# ADR 괴리율 모니터 개발 안내

기준 소스·기록은 이 Drive 폴더다. 작업 전 `PROJECT_HANDOVER.md`와 `DEVELOPMENT_CHAT_HANDOFF.md`를 전체 읽는다. 로컬 검증과 GitHub/운영 반영은 별도 단계다.

## 실행과 검증

2026-09-09 SEO 권장 조치의 구현·검증·GitHub main 반영·Cloudflare 배포를 완료했다. 커밋 `1364c5e`와 Custom Domain 설정 `71df372`의 원격 검증이 성공했고, 운영 확인은 `reports/2026-09-09-seo.md`를 따른다.

Node.js 24.x, pnpm 11.19.0을 사용한다. Wrangler 4.112.0을 유지하고 잠금 파일을 함께 관리한다.

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev
```

출력된 로컬 주소로 접속한다. Windows에서는 `start.bat`도 동일한 Worker를 실행한다. 로컬 API는 실제 Yahoo 데이터를 요청하므로 원본 지연/장 마감은 운영과 같다. 별도 환율 공급처나 토스 설정은 사용하지 않는다.

```powershell
pnpm test
pnpm build
pnpm test:browser
# 위 세 단계를 한 번에 실행:
pnpm verify
```

- `test`: Node 기본 테스트 러너의 Yahoo 파싱·캐시·동시 요청·계산·Worker 경로 검사. 외부 시세 요청 없음.
- `build`: Wrangler의 `--dry-run`. 로컬 `dist/`를 생성할 뿐 배포하지 않음.
- `test:browser`: 실제 Chromium, 데스크톱 1440px·모바일 390px. 시세·분석·폰트 외부 요청을 차단하고 모의 시세로 검증. 결과와 화면은 `test-results/`에 생성.
- 승인된 화면 개선 이후에는 이전 화면과 픽셀 동일성을 요구하지 않는다. `reports/baseline.html`은 안정성 작업 이전 화면의 로컬 보관본이며 Git에 포함하지 않는다. 현재 검사는 ADR 1주 기준 달러 가격 비교·요약, 관심·펼침 복원, 실패 표시, 키보드·터치 버튼, 320px 및 200% 글자 확대 시 가로 넘침을 확인한다. 가이드·약관·개인정보처리방침의 공통 스타일, 링크와 확대 표시도 검사한다.
- Drive 링크 제약을 피하기 위해 `pnpm-workspace.yaml`과 `.npmrc`에 hoisted 설치를 설정했다. 그래도 실행이 불가능한 환경에서는 승인된 고정 로컬 작업 복제본을 사용하고 Drive와 반영 파일 목록을 대조한다. 설치 도구 버전을 임의로 올리지 않는다.

## 파일 역할

| 경로 | 역할 |
|---|---|
| `worker.js` | 운영 HTTP/API 경로 및 정적 파일 제공 |
| `src/yahoo.js` | Yahoo 응답 파싱·가격/시각 검증·8초 제한 |
| `src/market-service.js` | 기존 TTL 캐시·강제 조회·중복 억제·병렬 조회 |
| `src/render-home.js` | 공통 템플릿·기업 설정으로 초기 HTML 생성(시세 조회 없음, 메타데이터 이스케이프) |
| `index.html` | 화면 구조·SEO·GTM 삽입 |
| `assets/app.js` | 초기 HTML 기업 카드 재사용·요약·갱신·오류 복구·관심 정렬·이벤트 |
| `assets/model.js` | 공통 계산·표시 형식·요약·브라우저 설정 직렬화 및 검증 |
| `assets/styles.css` | 화이트·블루 반응형 비교 화면 및 가이드·약관·개인정보 공통 스타일 |
| `companies.json` | 기업·티커·ADR 비율·검증 출처 |
| `tests/`, `scripts/` | 회귀 테스트와 Node용 Worker 테스트 로더 |
| `.github/workflows/verify.yml` | 승인 후 Git 반영 시 실행할 검사 구성. 배포 기능 없음 |
| `archive/legacy-preview/` | 운영과 달랐던 과거 미리보기의 복구용 보관본 |

테스트 서버는 자동 테스트 전용이며 `/api/` 미모의 요청을 거절한다. 일상 미리보기는 반드시 `pnpm dev`를 사용한다.

홈은 Worker 초기화 시 `index.html`의 공통 템플릿과 `companies.json`으로 생성한다. HTML 제공은 Yahoo 응답에 의존하지 않으며 기업명·티커·ADR 비율만 먼저 담는다. 실제 가격·기준 시각은 기존 API에서 받는다. HTML 파일을 직접 열면 템플릿이 처리되지 않으므로 Worker 주소로 확인한다. 검색봇과 일반 사용자에게 같은 HTML을 제공한다. 홈의 app.js 참조에 버전 쿼리를 붙여 이전 클라이언트 캐시와 새 HTML의 혼용을 줄인다.

SEO 회귀 검사에는 초기 HTML의 9개 기업, 메타데이터 이스케이프, API 지연·첫 실패·복구, JavaScript 비활성화, 주소 308 리디렉션의 쿼리 보존, 계산 예시와 실제 계산 모듈의 일치가 포함된다. 운영 호스트의 HTTP를 HTTPS로, `/index.html`을 `/`로, 가이드 주소를 끝 `/`가 있는 주소로 통일하며 localhost의 HTTP는 유지한다. `www`는 Worker 도달 전 DNS·TLS·도메인 연결이 먼저 필요하다.

## 유지하는 정책

- Yahoo Finance 단일 공급처, 한국 정규장 메타값 우선/1분봉 fallback, 미국 ADR 시간외 포함 정책 유지.
- 미국 ADR은 `range=5d&interval=1m&includePrePost=true`의 마지막 유효 분봉을 원본 시각과 함께 사용한다. 한국 시세·환율 조회 범위는 `1d`를 유지한다. 원본 요청 횟수는 늘리지 않으며 5d 안에도 값이 없으면 기존 오류/이전 값 처리로 돌아간다.
- 일반 시세 캐시 60초, 환율 캐시 1시간, 자동 갱신 1시간 유지.
- 버튼 수동 요청만 `force=1`. 초기 화면 API는 메인→전체 두 요청이며 전체 응답의 기업 정보를 재사용한다. 강제 요청은 전체 시세 응답 한 번을 모든 카드에 공유한다.
- 동시에 겹치는 강제 조회는 같은 진행 중 Yahoo 요청을 공유한다. 진행 중 일반 조회를 강제 조회가 재사용하지는 않는다. 캐시/화면에 늦게 도착한 이전 요청이 더 최신 결과를 덮지 않게 보호한다.
- 조회 실패 시 이전 값은 `stale`로 구분한다. 환율 실패는 기존 오류 영역으로 알리고, 잘못된 값이나 이전 값 사용을 정상 새로고침 완료로 기록하지 않는다. 원본 값·시각이 그대로인 정상 응답은 오류가 아니다.
- 캐시는 실행 인스턴스별 임시 상태다. 전역 공유 캐시나 영구 보관을 약속하지 않는다. 자동 재시도·추가 폴링은 없다.
- 미국 라벨과 기기 현지 시각 표시 정책은 바꾸지 않았다. 원본 지연, 시간대 정책, 기업행동/비율 최신성은 별도 운영 점검 대상이다.

## 브라우저 화면 설정과 비교 요약

- PC·모바일은 모두 기업별 독립 카드와 14px 간격을 사용한다. PC의 가로 열 정렬과 모바일의 가격 요약 배치는 유지한다. ADR 5d 조회와 PC 카드 분리는 2026-09-08 커밋 `87beffd`로 GitHub main 및 Cloudflare 운영 반영을 완료했다(`reports/2026-09-08-adr-range-cards.md`).
- 모든 카드의 접힌 요약은 `(미국 ADR 가격 / 국내 가격의 ADR 1주 기준 달러 환산가 - 1) × 100`을 사용한다. 두 방향 상세 괴리율의 분모는 서로 다르므로 요약은 항상 ADR 기준으로 통일한다.
- 반올림한 0.00%는 `거의 같음`, 잘못된 값은 `비교 불가`, 이전 값 사용은 `이전 시세 · 확인 필요`로 구분한다. 요약에서도 국내와 ADR의 원본 기준 시각·시장 라벨을 각각 보여 준다.
- 별 버튼은 관심 기업을 위에 고정한다. 관심 그룹 내부와 나머지 그룹은 기업 설정 순서를 유지하며, 괴리율 순위·투자 신호는 만들지 않는다.
- `localStorage['adrgap.preferences.v1']`에는 `version`, 관심 기업 ID 목록 `pinned`, 기업별 펼침 여부 `expanded`만 저장한다. 시세·환율은 저장하지 않는다.
- 2026-09-08 배포 디자인의 초기값은 모든 기업 접힘이다. 저장된 기업별 펼침·관심 설정은 같은 키로 그대로 복원한다. 다른 브라우저·기기·localhost/운영 도메인 사이에 공유되지 않는다.
- JSON 파손, 지원하지 않는 버전, 저장소 접근/쓰기 실패는 기본값 또는 현재 메모리 상태로 처리한다. 시세 조회를 막지 않는다. 사이트 데이터 삭제 시 설정이 초기화된다.
- 관심·펼침 조작과 설정 복원은 추가 시세 요청을 만들지 않는다. 관심 이벤트는 새로 수집하지 않으며 자동 상태 복원도 기존 `company_toggle` 이벤트를 발생시키지 않는다.
- 요약 행은 국내 시세의 ADR 1주 기준 달러 환산가와 미국 ADR 가격을 나란히 표시한다. 요약은 ADR 기준 괴리율 하나이며, 펼친 상세에서는 기존 양방향 계산과 원본 시세를 유지한다.
- 기업 식별 박스에는 각 미국 ADR의 전체 티커를 표시한다. 티커는 companies.json의 usTicker 원문을 사용하며, 티커 앞 일부만 잘라 쓰지 않는다.
- 현재 운영 배포 버전은 미국 ADR 전체 티커를 표시한다. 커밋 `99d4889ff7a9dfd1afd4352fc6fbca0155b84925`의 Cloudflare Build `38a73ee1-0fde-4be7-be8a-9c894b86b89c`, 배포 버전 `98722e22-0825-45e1-acf6-68a6cc15c1c5` 성공과 운영 반영을 확인했다.
- 2026-09-08 전체 티커 표시를 커밋 `99d4889`로 운영 반영했다. 데스크톱·모바일에서 `SKHY`, `SHG`, `PKX` 등 전체 티커와 수동 `force=1` 재조회를 확인했다.
- 기존 안정성·UX 개선은 2026-09-07 운영 반영 완료했다(`reports/2026-09-07-ux.md`). 2026-09-08 전체 디자인과 ADRGAP 앞 아이콘 제거도 커밋 `66ee84f`로 운영 반영하고 데스크톱·모바일 검증을 완료했다(`reports/2026-09-08-design.md`).

## 분석 ID 전환

GTM/GA4 계정 설정은 변경하지 않는다. 이번 코드가 **배포된 시점 이후** 추가 기업의 `company_id`는 설정 파일의 ID를 사용한다. 과거 데이터는 소급 변경되지 않으며, 분석 시 아래 매핑으로 연결한다. 메인은 `sk-hynix`로 동일하다.

| 기존 ID | 새 ID |
|---|---|
| `105560-KB` | `kb-financial` |
| `055550-SHG` | `shinhan-financial` |
| `005490-PKX` | `posco-holdings` |
| `316140-WF` | `woori-financial` |
| `015760-KEP` | `kepco` |
| `017670-SKM` | `sk-telecom` |
| `030200-KT` | `kt` |
| `034220-LPL` | `lg-display` |

이벤트 이름, `toggle_action`과 GA4 `action`의 기존 매핑, 가이드 이벤트는 유지한다.

## 개선 근거

- [Cloudflare 실행 인스턴스와 전역 상태](https://developers.cloudflare.com/workers/reference/how-workers-works/)
- [Cloudflare 테스트 안내](https://developers.cloudflare.com/workers/testing/)
- [Playwright CI 안내](https://playwright.dev/docs/ci-intro)

배포 승인·확인·복구 절차는 `DEPLOY.md`를 따른다.
