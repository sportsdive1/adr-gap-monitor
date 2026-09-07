# ADR 괴리율 모니터 개발 안내

기준 소스·기록은 이 Drive 폴더다. 작업 전 `PROJECT_HANDOVER.md`와 `DEVELOPMENT_CHAT_HANDOFF.md`를 전체 읽는다. 로컬 검증과 GitHub/운영 반영은 별도 단계다.

## 실행과 검증

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
- 승인된 화면 개선 이후에는 이전 화면과 픽셀 동일성을 요구하지 않는다. `reports/baseline.html`은 안정성 작업 이전 화면의 로컬 보관본이며 Git에 포함하지 않는다. 현재 검사는 요약 기준, 관심·펼침 복원, 실패 표시, 키보드·터치 버튼, 320px 및 200% 글자 확대 시 가로 넘침을 확인한다.
- Drive 링크 제약을 피하기 위해 `pnpm-workspace.yaml`과 `.npmrc`에 hoisted 설치를 설정했다. 그래도 실행이 불가능한 환경에서는 승인된 고정 로컬 작업 복제본을 사용하고 Drive와 반영 파일 목록을 대조한다. 설치 도구 버전을 임의로 올리지 않는다.

## 파일 역할

| 경로 | 역할 |
|---|---|
| `worker.js` | 운영 HTTP/API 경로 및 정적 파일 제공 |
| `src/yahoo.js` | Yahoo 응답 파싱·가격/시각 검증·8초 제한 |
| `src/market-service.js` | 기존 TTL 캐시·강제 조회·중복 억제·병렬 조회 |
| `index.html` | 화면 구조·SEO·GTM 삽입 |
| `assets/app.js` | 공통 HTML 템플릿 기반 기업 카드·요약·갱신·오류 복구·관심 정렬·이벤트 |
| `assets/model.js` | 공통 계산·표시 형식·요약·브라우저 설정 직렬화 및 검증 |
| `assets/styles.css` | 기존 분홍 계열을 유지한 반응형 비교 화면·읽기/터치/키보드 스타일 |
| `companies.json` | 기업·티커·ADR 비율·검증 출처 |
| `tests/`, `scripts/` | 회귀 테스트와 Node용 Worker 테스트 로더 |
| `.github/workflows/verify.yml` | 승인 후 Git 반영 시 실행할 검사 구성. 배포 기능 없음 |
| `archive/legacy-preview/` | 운영과 달랐던 과거 미리보기의 복구용 보관본 |

테스트 서버는 자동 테스트 전용이며 `/api/` 미모의 요청을 거절한다. 일상 미리보기는 반드시 `pnpm dev`를 사용한다.

## 유지하는 정책

- Yahoo Finance 단일 공급처, 한국 정규장 메타값 우선/1분봉 fallback, 미국 ADR 시간외 포함 정책 유지.
- 일반 시세 캐시 60초, 환율 캐시 1시간, 자동 갱신 1시간 유지.
- 버튼 수동 요청만 `force=1`. 초기 화면 API는 메인→전체 두 요청이며 전체 응답의 기업 정보를 재사용한다. 강제 요청은 전체 시세 응답 한 번을 모든 카드에 공유한다.
- 동시에 겹치는 강제 조회는 같은 진행 중 Yahoo 요청을 공유한다. 진행 중 일반 조회를 강제 조회가 재사용하지는 않는다. 캐시/화면에 늦게 도착한 이전 요청이 더 최신 결과를 덮지 않게 보호한다.
- 조회 실패 시 이전 값은 `stale`로 구분한다. 환율 실패는 기존 오류 영역으로 알리고, 잘못된 값이나 이전 값 사용을 정상 새로고침 완료로 기록하지 않는다. 원본 값·시각이 그대로인 정상 응답은 오류가 아니다.
- 캐시는 실행 인스턴스별 임시 상태다. 전역 공유 캐시나 영구 보관을 약속하지 않는다. 자동 재시도·추가 폴링은 없다.
- 미국 라벨과 기기 현지 시각 표시 정책은 바꾸지 않았다. 원본 지연, 시간대 정책, 기업행동/비율 최신성은 별도 운영 점검 대상이다.

## 브라우저 화면 설정과 비교 요약

- 모든 카드의 접힌 요약은 `(미국 ADR 가격 / 국내 가격의 ADR 1주 기준 달러 환산가 - 1) × 100`을 사용한다. 두 방향 상세 괴리율의 분모는 서로 다르므로 요약은 항상 ADR 기준으로 통일한다.
- 반올림한 0.00%는 `거의 같음`, 잘못된 값은 `비교 불가`, 이전 값 사용은 `이전 시세 · 확인 필요`로 구분한다. 요약에서도 국내와 ADR의 원본 기준 시각·시장 라벨을 각각 보여 준다.
- 별 버튼은 관심 기업을 위에 고정한다. 관심 그룹 내부와 나머지 그룹은 기업 설정 순서를 유지하며, 괴리율 순위·투자 신호는 만들지 않는다.
- `localStorage['adrgap.preferences.v1']`에는 `version`, 관심 기업 ID 목록 `pinned`, 기업별 펼침 여부 `expanded`만 저장한다. 시세·환율은 저장하지 않는다.
- 초기값은 SK하이닉스만 펼침이다. 다음 방문부터 같은 브라우저·출처(origin)의 설정을 복원한다. 다른 브라우저·기기·localhost/운영 도메인 사이에 공유되지 않는다.
- JSON 파손, 지원하지 않는 버전, 저장소 접근/쓰기 실패는 기본값 또는 현재 메모리 상태로 처리한다. 시세 조회를 막지 않는다. 사이트 데이터 삭제 시 설정이 초기화된다.
- 관심·펼침 조작과 설정 복원은 추가 시세 요청을 만들지 않는다. 관심 이벤트는 새로 수집하지 않으며 자동 상태 복원도 기존 `company_toggle` 이벤트를 발생시키지 않는다.
- 상세 보고서: `reports/2026-09-07-ux.md`. 현재 로컬 검증 완료이며 안정성 개선과 함께 Git 반영·배포 승인을 기다린다.

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
