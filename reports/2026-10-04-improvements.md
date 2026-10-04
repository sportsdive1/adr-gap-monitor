# 2026-10-04 운영 보완 결과

## 상태

- 사용자 승인: 운영 점검 결과에 이어 “일단 개선해보자 그럼”.
- 로컬 구현·검증 완료. GitHub main 반영·Cloudflare 배포·외부 게시는 하지 않았다.
- 운영 상태를 확인한 직전 점검은 `reports/2026-10-04-operations-review.md`를 참고한다. 아래 오류 화면은 모의 데이터이며 운영 장애를 나타내지 않는다.

## 변경 내용과 사용자 영향

### 환율 카드 오류 표시

- 정상 응답: 기존 환율 숫자와 `기준: 원본 시각` 표기를 그대로 사용한다.
- 환율 없음, 0 등 잘못된 값, 잘못된 원본 시각: 이전 숫자를 남기지 않고 `환율: —`와 `환율을 불러오지 못했습니다.`를 표시한다.
- 유효한 stale 환율: 숫자와 원본 시각을 유지하되 기준 시각 옆에 `최신 환율 오류 / 이전 환율`을 표시한다.
- 전체 요청 실패: 마지막 유효 환율이 있다면 숫자·원본 시각을 유지하고 `갱신 실패 · 이전 환율`을 표시한다. 유효한 환율이 없으면 미수신 상태로 표시한다.
- 정상 복구: 오류 표시를 지우고 새 응답의 숫자·원본 시각을 반영한다.
- 새 시각 필드·경고 박스·레이아웃은 추가하지 않았다. 기존 환율 기준 문구의 오류 상태만 보완했다. 가격·환율의 공급처, 계산, 기준 시각 선택, 캐시·수동 force·자동 갱신 정책은 변경하지 않았다.

### 파비콘·링크 공유

- 네 페이지에 같은 96×96 PNG 파비콘을 연결했다. `/favicon.ico`도 제공한다.
- 홈·가이드에 실제 1200×630 PNG와 Open Graph/Twitter 이미지 메타데이터를 추가했다.
- 공유 이미지는 기존 화이트·블루 색상과 ADRGAP 글자 스타일을 사용하며 실시간 숫자·수익 주장·매매 신호를 담지 않는다.
- 화면 앞의 로고는 다시 추가하지 않았다. 기존 모바일·PC 기업 카드와 14px 간격은 그대로다.
- SVG 소스에서 기존 Playwright로 PNG/ICO를 생성한다. 신규 패키지는 없다. 필요할 때 `node scripts/build-brand-assets.mjs`로 재생성한다. 일반 빌드는 생성된 PNG/ICO를 사용한다.
- 가이드 본문과 정책 본문을 바꾸지 않았으므로 본문 수정일과 sitemap 날짜를 임의로 갱신하지 않았다.

### 로컬 미리보기 보완

- 기본 Wrangler 실행이 운영 route의 도메인을 요청 원점으로 사용해, 기존 HTTPS canonical 처리와 만나 로컬 리디렉션을 반복하는 것을 재현했다.
- 개발 전용 `dev.host: localhost`를 명시했다. 기본 `pnpm dev --port 8794`로 재실행한 뒤 홈·새 이미지의 200 응답과 리디렉션 없음까지 확인했다. 개발 서버는 검증 후 종료했다.
- 운영 routes·도메인·HTTPS·canonical 코드는 변경하지 않았다. [Cloudflare 개발 명령 문서](https://developers.cloudflare.com/workers/wrangler/commands/workers/)의 host 옵션을 기준으로 확인했다.

## ADR 비율 확인

확인일은 2026-10-04다. 아래 비율은 ORD:DR이며, 코드의 `commonPerAdr`는 ORD ÷ DR이다. 9개 모두 기존 숫자와 일치해 계산값·ratioLabel은 변경하지 않았다.

| 티커 | 자료의 ORD:DR | ADR 1주당 보통주 | 확인 자료 |
|---|---:|---:|---|
| SKHY | 1:10 | 0.1주 | [SK hynix 공식 IR](https://www.skhynix.com/ir/UI-FR-IR03/) |
| KB | 1:1 | 1주 | [Deutsche Bank DR Directory](https://adr.db.com/drwebrebrand/dr-universe/dr_details.html?identifier=7229) |
| SHG | 1:1 | 1주 | [Citi 프로그램](https://depositaryreceipts.citi.com/adr/guides/estfee.aspx?cusip=824596100&pageId=15&subpageID=114) |
| PKX | 1:4 | 0.25주 | [Citi 프로그램](https://depositaryreceipts.citi.com/adr/guides/estfee.aspx?cusip=693483109&pageId=15&subpageID=114) |
| WF | 3:1 | 3주 | [Citi 프로그램](https://depositaryreceipts.citi.com/adr/guides/pgm_dispaDivd.aspx?Type=D&cusip=981064108&pageId=15&subpageID=113) |
| KEP | 1:2 | 0.5주 | [Citi 프로그램](https://depositaryreceipts.citi.com/adr/guides/pgm_d.aspx?cusip=500631106&pageId=15&subpageid=106) |
| SKM | 5:9 | 5/9주 | [Citi 프로그램](https://depositaryreceipts.citi.com/adr/guides/pgm_d.aspx?cusip=78440P306&pageId=16&subpageID=104&typeDisplay=A) |
| KT | 1:2 | 0.5주 | [Citi 프로그램](https://depositaryreceipts.citi.com/adr/guides/pgm_dispaDivd.aspx?Type=D&cusip=48268K101&pageId=15&subpageID=113) |
| LPL | 1:2 | 0.5주 | [Citi 프로그램](https://depositaryreceipts.citi.com/adr/guides/estfee.aspx?cusip=50186V102&pageId=15&subpageID=114) |

8개는 발행사 IR·예탁은행의 프로그램 자료를 직접 확인했다. KB는 Deutsche Bank의 은행 디렉터리에서 Active·NYSE·JPM 예탁·1:1을 교차 확인했다. 이 디렉터리의 데이터 제공자는 FactSet/Interactive Data이며 JPM의 계약 원문 재확인과 같은 수준은 아니다. KB의 기존 SEC 계약 원문 출처는 보존하고, 나머지 8개의 출처를 위 현재 프로그램 자료로 갱신했다. 모든 `ratioVerifiedAt`을 이번 열람일로 기록했다.

확인일 갱신은 페이지의 비율 일치를 확인했다는 뜻이다. 모든 기업행동·상장 상태 변경의 부재를 보증하거나 자료 제공자의 갱신 지연 가능성을 없애지는 않는다. 월별 점검과 기업행동 발생 시 재확인은 계속 필요하다. 외부 가격 공급처를 새로 추가한 것은 아니다.

## 변경 파일

- 화면 오류: `assets/app.js`, `index.html`(스크립트 버전 `20261004-fx`).
- 공유·파비콘 연결: `index.html`, `what-is-adr-gap.html`, `terms.html`, `privacy.html`.
- 이미지 원본·생성물: `assets/favicon.svg`, `assets/favicon.png`, `assets/favicon.ico`, `assets/social-preview.svg`, `assets/social-preview.png`, `scripts/build-brand-assets.mjs`.
- Worker 파일 제공·로컬 실행: `worker.js`, `wrangler.jsonc`, `scripts/register-loader.mjs`.
- 검증: `tests/browser.mjs`, `tests/router.test.js`, `tests/seo.test.js`.
- 비율 확인 기록: `companies.json`.
- 인수인계: `PROJECT_HANDOVER.md`, `DEVELOPMENT_CHAT_HANDOFF.md`, 이 보고서.
- `assets/styles.css`, `assets/model.js`, `src/yahoo.js`, `src/market-service.js`, 패키지·lockfile은 변경하지 않았다.

## 검증 결과

- `pnpm verify` 통과: 단위/API 42개, Wrangler 배포 없는 빌드, 데스크톱 1440px·모바일 390px 브라우저 검사.
- 환율 정상→없음/잘못된 값/잘못된 시각→복구, stale→복구, 전체 요청 실패→복구, 최초 요청 실패를 확인했다. 실패 때 새로고침 시각이 정상 성공처럼 갱신되지 않는 기존 원칙도 유지했다.
- 초기 일반 API 2회, 수동 `/api/market?force=1` 1회 유지. 캐시 TTL과 동일 Yahoo 원본 시각 유지, 미국 시간외 정책, 오래된 자동 응답 덮어쓰기 방지도 기존 검사 통과.
- 9개 기업의 가격·요약·상세·비율·관심/펼침 기억, 부분 시세 실패, 14px 카드 간격, 320px·200% 글자 확대, 가로 넘침 없음, 브라우저 오류 없음 확인.
- 홈·가이드·정책·정적 이미지 요청에는 Yahoo 호출이 없다. PNG/ICO 서명과 PNG 크기, 올바른 Content-Type을 검사했다.
- 실제 로컬 Cloudflare 런타임: 홈 200, PNG 파비콘 200/2,093 bytes, ICO 200/2,115 bytes, 공유 PNG 200/42,615 bytes, 모두 리디렉션 없음.
- 공유 이미지의 글자·여백·잘림과 오류/복구 화면을 육안 확인했다. 브라우저 결과는 `test-results/browser-results.json`이다.

## 확인 화면

모의 데이터 화면이다. 정상 운영 시세 검증 자료로 사용하지 않는다.

- [모바일 이전 환율](../test-results/fx-staleFx-mobile.png)
- [모바일 환율 없음](../test-results/fx-missingFx-mobile.png)
- [모바일 정상 복구](../test-results/fx-recovered-mobile.png)
- [데스크톱 환율 없음](../test-results/fx-missingFx-desktop.png)
- [공유 이미지](../assets/social-preview.png)

## 운영·유입 후속 실행안

### 계정에서 먼저 확인할 것

1. Search Console의 홈과 `/what-is-adr-gap/` URL 검사에서 실제 색인 상태·Google 선택 canonical·최근 크롤링·사이트맵 발견을 기록한다. 실시간 테스트 성공을 색인 완료로 간주하지 않는다. 미색인 이유를 본 뒤 필요한 경우에만 색인 요청을 한다.
2. GA4에서 `manual_refresh`, `company_toggle`, `select_content`의 최종 수집과 보고서/맞춤 측정기준을 확인한다. 코드의 dataLayer 이벤트 발생만으로 GA4 최종 수집을 확인했다고 말하지 않는다.
3. 최근 28일 기준은 활성 사용자 18·새 사용자 14·검색 클릭 2·노출 10이다. 이전 GA4 43명의 정의가 불명확해 같은 지표로 단순 비교하지 않는다. 작은 검색 표본의 CTR로 제목/설명의 성패를 확정하지 않는다.

이 항목은 계정 접근 문제로 아직 미완료다. [Google URL 검사 문서](https://support.google.com/webmasters/answer/9012289?hl=en)를 참고한다.

### 2주 유입 실험 초안 (외부 게시 전 채널 선택 필요)

- 투자·ADR 관련 채널 두 곳에서 게시 규칙·홍보 허용 여부를 확인하고, 각 한 번씩 가이드 중심으로 소개한다. 자동 게시·반복 도배·수익 강조는 하지 않는다.
- 게시 문안 초안: “국내 본주와 미국 ADR을 비교할 때 ADR 비율과 환율을 어떻게 반영하는지, 계산 예시와 기준 시각의 한계를 정리했습니다. 참고용 지연 시세 비교 도구이며 매매 신호나 투자 권유는 아닙니다.”
- 채널 A 예시: https://adrgap.com/what-is-adr-gap/?utm_source=community_a&utm_medium=referral&utm_campaign=202610_adr_guide
- 채널 B 예시: https://adrgap.com/what-is-adr-gap/?utm_source=community_b&utm_medium=referral&utm_campaign=202610_adr_guide
- 실제 채널명으로 source만 바꾸고 내부 홈↔가이드 링크에는 UTM을 붙이지 않는다. 날짜·게시 위치·사용한 URL을 운영 기록에 남긴다.
- 게시 시작 14일 후 채널별 세션/참여 세션, 가이드→홈 `select_content`, 수동 새로고침·기업 상세 열람, Search Console 페이지별 노출/클릭을 본다. 표본이 작으면 관찰을 연장하며 새 기업 페이지·유료 광고를 바로 추가하지 않는다.
- 위 게시와 14일 후 재점검은 아직 수행·예약하지 않았다. 외부 채널 선택·게시와 자동화는 별도 지시가 필요하다.

## 위험·배포 후 확인

- 새 UI 로직 자체의 Yahoo 호출 증가·캐시 우회 증가는 없다. 공유 이미지는 해당 이미지가 요청될 때만 전송되며 Worker 번들에는 포함된다.
- Google 파비콘과 각 공유 서비스 미리보기는 크롤링·캐시 정책에 따라 늦게 바뀌거나 노출되지 않을 수 있다. 트래픽 증가를 보장하는 조치는 아니다. [Google 파비콘 지침](https://developers.google.com/search/docs/appearance/favicon-in-search?hl=en).
- 새 의존성·Supabase·Vercel·로그인·DB·자동 폴링은 추가하지 않았다. 계정 내부 색인 상태·최종 이벤트 수집·Yahoo 이용 조건의 추가 권한은 확인 완료로 주장하지 않는다.
- 배포 승인 후 GitHub main → Cloudflare 자동 Build 성공 → 실제 소스 버전·이미지 200·홈/가이드/정책 메타데이터 → 데스크톱/모바일 정상 시세·수동 force·원본 시각·카드 간격을 확인한다. 실패 상태는 운영 Yahoo를 고의로 실패시키지 말고 별도 모의 검증으로 확인한다.
- 이전 임시 Git checkout은 이번 점검에서 유효한 checkout으로 확인되지 않았다. 다음 Git 반영 때 저장소의 최신 main을 확인한 새 checkout 또는 적합한 기존 checkout을 사용한다. Drive 생성물·비밀 파일은 반영하지 않는다.

## 한국어 커밋 초안

- 제목: `환율 오류 표시와 공유 메타데이터 보완`
- 설명: `환율 미수신·이전 값·조회 실패 상태와 복구 처리 개선; 파비콘·공유 PNG 및 Worker 경로 추가; ADR 비율 출처 확인 기록 갱신; 개발 전용 호스트 명시; 조회·캐시·정상 화면 정책 유지 및 42개 단위/API·PC/모바일 검증 통과`

