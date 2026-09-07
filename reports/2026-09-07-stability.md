# 안정성·개발 효율 개선 결과

작성: 2026-09-07 (KST)
상태: **승인 범위의 로컬 구현·검증 완료 / Git 커밋·push·Cloudflare 배포 미실행**

## 1. 승인 범위와 유지 사항

사용자의 2026-09-07 검토 개선안 승인에 따라 구현했다. Yahoo Finance 단일 공급처, 한국 정규장/미국 시간외 포함 원칙, ADR 비율·계산식, 정상 화면 구성과 문구, 일반 시세 60초·환율 1시간 캐시, 자동 갱신 1시간을 유지했다. 원본 갱신 지연 자체를 오류로 취급하지 않는다.

새 공급처·새 화면 요소·두 기준 시각 분리 표시·추가 폴링·자동 재시도·광고·금융 판단 기능은 추가하지 않았다. 정상 화면 변경 없이 실패 시 기존 오류 영역의 복구·환율 stale 처리를 바로잡았다.

## 2. 구현 결과

- KRX 정규장 메타값을 1분봉 유무와 독립적으로 먼저 검사한다. 가격은 유한한 양수, 시각은 유한한 양수이면서 Date로 변환 가능해야 한다.
- 메타값을 사용할 수 없으면 가격과 동일 인덱스 시각이 모두 유효한 마지막 1분봉으로 fallback한다. null 시각의 1970년 변환, 0/음수/비정상 가격을 막는다.
- Yahoo 헤더 수신뿐 아니라 응답 본문 읽기까지 8초 제한을 적용한다. 타임아웃 후 도착한 데이터는 캐시에 쓰지 않는다.
- 종목 18건과 환율 1건을 병렬로 시작한다. 일부 실패는 개별 errors/stale로 반환한다.
- 겹친 강제 요청은 진행 중인 강제 Yahoo 요청을 공유한다. 강제 요청이 그 전에 시작한 일반 조회를 재사용하지 않도록 분리했다.
- 원본 시각과 요청 순서를 비교해 늦은 과거 응답이 최신 캐시를 덮지 못하게 했다. 화면에서도 세대 번호·취소 신호로 이전 갱신 결과를 무시한다.
- 메인과 추가 기업 카드의 계산·검증·날짜 표시·오류 처리 로직을 공통화했다.
- 실패 후 정상 응답에서 오류를 지운다. 잘못된 값 또는 실패에 따른 이전 값 사용은 정상 새로고침 완료로 기록하지 않는다. FX stale은 기존 오류 영역으로 처리한다.
- 초기 기업 목록을 시세 응답에서 재사용한다. 강제 조회는 같은 전체 응답을 모든 카드에 공유한다.
- 비활성 스크립트, 도달 불가능 코드, 과거 차트 함수와 미사용 스타일을 제거했다.
- PowerShell 별도 API를 없애고 로컬에서도 동일한 Worker를 실행한다. 과거 파일은 복구용 보관 폴더로 이동했다.
- 설치 버전을 고정하고 잠금 파일을 갱신했다. 기본 자동 테스트·브라우저 테스트·배포 없는 빌드·CI 구성을 준비했다.
- company_toggle의 company_id를 companies.json의 ID로 통일했다. 실제 적용은 배포 이후이며, 과거 ID 연결 표는 README에 있다. 외부 GTM/GA4 설정은 변경하지 않았다.

## 3. 측정한 효율 개선

| 항목 | 변경 전 | 변경 후 |
|---|---:|---:|
| 초기 화면 API 요청 | 3회: 메인/기업 목록/전체 | 2회: 메인/전체 |
| 수동 새로고침 화면 API 요청 | 1회 | 1회 유지 |
| 단일 전체 강제 조회의 Yahoo 요청 | 18개 시세 + 환율 1개 | 19개 유지, 겹친 강제 요청 공유 |
| 환율 조회 시작 | 모든 시세를 기다린 뒤 | 시세와 동시에 |
| 홈페이지 HTML·JS·CSS 비압축 합계 | 41,362 bytes | 25,316 bytes |

홈페이지 코드 합계는 약 38.8% 감소했다. 새 HTML 7,019 + app.js 9,751 + model.js 2,439 + styles.css 6,107 bytes 기준이며, API JSON·외부 폰트·HTTP 헤더는 제외했다. 분리된 정적 자산 요청은 추가되므로 이 수치가 실제 로딩 시간 개선률을 뜻하지는 않는다. 실서비스 지연 시간은 Yahoo 응답과 캐시 인스턴스에 따라 달라진다.

## 4. 검증 결과

최종 실행: `pnpm verify` 종료 코드 0.

- Node 단위·API 경로 테스트: **31개 통과, 실패 0**.
- Wrangler 4.112.0 dry-run 빌드: **통과**, 업로드 예상 54.26 KiB / gzip 15.71 KiB. 실제 배포 없음.
- Chromium 데스크톱 1440×1000 / 모바일 폭 390×844: **모두 통과**.
- 수정 전 초기 정상 화면과 텍스트·요소 좌표·픽셀 일치. 실행 시각에 따라 달라지는 마지막 새로고침 영역은 픽셀 비교에서만 숨겼다.
- 가로 넘침 없음, 카드 펼치기/접기와 company_id 이벤트 확인.
- 수동 요청은 `/api/market?force=1` 한 번, 초기 요청은 force 없는 두 번 확인.
- 더 최신 모의 응답은 기존 기준 시각 갱신, 동일 원본은 시각 유지 확인.
- 오류 후 복구, 잘못된 메인/추가 가격, FX stale, 일부 기업 실패, 이전 자동 요청의 늦은 완료가 새 수동 결과를 덮지 않는 상황 확인.
- 테스트는 Yahoo·GTM·폰트 외부 요청을 차단한다. 테스트 화면의 가격은 모의 데이터이며 실제 시세가 아니다.
- 로컬 Wrangler에서 홈 및 새 JS/CSS 경로가 HTTP 200과 올바른 Content-Type으로 응답함을 별도 확인했다.
- 실제 로컬 Worker의 `/api/market?company=sk-hynix&force=1` 원본 조회에서 000660·SKHY·Yahoo 환율 응답 및 errors={}를 확인했다. 한국 기준 2026-09-07 15:30:12 KST, 환율 기준 16:56:58 KST였다. 운영 사이트 배포 후 검증을 대신하는 기록은 아니다.

### 확인 화면

- [데스크톱](../test-results/desktop.png)
- [데스크톱 카드 펼침](../test-results/desktop-expanded.png)
- [모바일](../test-results/mobile.png)
- [모바일 카드 펼침](../test-results/mobile-expanded.png)
- [브라우저 검사 결과](../test-results/browser-results.json)

화면은 Chromium의 데스크톱/모바일 폭 검사다. 실제 휴대폰·Safari 검증은 수행하지 않았다. 같은 픽셀 대조용 baseline.html은 로컬에만 보관한다. 원격 CI에서는 baseline 없는 기본 기능·표시·넘침 검사가 실행된다.

## 5. 변경 파일

| 구분 | 파일 |
|---|---|
| 운영 진입점·화면 | worker.js, index.html, wrangler.jsonc |
| 신규 운영 모듈 | src/yahoo.js, src/market-service.js, assets/app.js, assets/model.js, assets/styles.css |
| 개발 환경 | package.json, pnpm-lock.yaml, pnpm-workspace.yaml, .npmrc, .gitignore, server.ps1, start.bat |
| 회귀 테스트 | tests/market.test.js, tests/router.test.js, tests/fixtures.js, tests/browser.mjs |
| 테스트 도구·CI | scripts/register-loader.mjs, scripts/test-server.mjs, .github/workflows/verify.yml |
| 문서 | README.md, DEPLOY.md, PROJECT_HANDOVER.md, DEVELOPMENT_CHAT_HANDOFF.md, WORK_CHAT_HANDOFFS.md, 이 보고서 |
| 복구용 이동 | 옛 server.ps1·start.bat·config.ps1.example·로컬 미리보기 파일 폴더 → archive/legacy-preview/ |

companies.json, 약관·개인정보처리방침·가이드·robots·sitemap의 내용은 변경하지 않았다. 보관 파일은 삭제하지 않았으며 복구 가능하다. archive·node_modules·dist·test-results·baseline은 Git/배포 대상이 아니다.

## 6. 남은 위험과 배포 승인 사항

- Yahoo 원본 갱신 지연·오류·호출 제한 가능성은 남는다. 공급처나 자동 호출 횟수를 늘리지 않았다.
- 캐시는 Worker 인스턴스별 임시 메모리다. 전체 이용자가 공유하는 1시간 캐시를 보장하지 않는다.
- 오류 때 사용할 이전 값의 최대 보관 연령은 이번에 바꾸지 않았다. 원본 기준 시각과 stale/오류 처리를 유지한다.
- 실제 GitHub CI 실행, main 보호 규칙 및 Cloudflare Build command 설정은 아직 적용·검증하지 않았다. CI 파일이 있다는 것만으로 배포 차단을 보장하지 않는다.
- 새 정적 자산 경로와 src 모듈을 Git 반영에서 빠뜨리지 않아야 한다. DEPLOY.md의 목록으로 확인한다.
- Git/Cloudflare 배포와 운영 데스크톱·모바일 확인은 사용자 별도 승인 후 진행한다.

커밋 제목 초안: **시세 처리 안정화 및 회귀 테스트 구축**
설명 초안: KRX 메타값 및 fallback 검증 보완, Yahoo 조회 제한·병렬 처리·중복 억제, 공통 화면 로직과 오류 복구, 로컬 Worker 통일, 설치 고정·회귀 테스트·문서 정리.

이번 구현은 Sites building 지침의 기존 구조·디자인 보존 및 로컬 검증 원칙을 적용했다. 호스팅 이전이나 새 Sites 등록·배포는 수행하지 않았다.
