# 개발 검증·Git 반영·Cloudflare 배포 절차

최종 갱신: 2026-09-07. GitHub는 `sportsdive1/adr-gap-monitor`, 운영은 `https://adrgap.com`이다.

## 1. 로컬 구현과 검증

기준 소스·기록은 Drive 폴더다. Node 24.x·pnpm 11.19.0, 잠금 파일의 버전을 사용한다. 설치·파일 역할은 `README.md`를 따른다.

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify
```

`verify`는 단위/API 경로 테스트, 배포 없는 Wrangler 빌드, 데스크톱·모바일 브라우저 검사를 순서대로 실행한다. 브라우저 시세는 모의 데이터다. 실제 시세 최신성 검증과 혼동하지 않는다.

검증 실패 시 먼저 수정하고 재실행한다. 테스트를 생략하거나 잠금 버전을 바꾸어 통과한 것으로 처리하지 않는다.

## 2. 변경 결과 보고와 별도 승인

코드 변경 승인과 운영 배포 승인은 구분한다. 결과 보고에는 다음을 포함한다.

- 목표·변경 파일·사용자 영향·유지한 정책
- 테스트 명령/결과·확인 화면·남은 한계
- 한국어 커밋 제목/설명 초안
- 운영 확인 항목·위험·되돌릴 기준 커밋

결과 확인과 명시적인 Git/배포 승인 전에는 커밋·push·배포를 실행하지 않는다.

## 3. 승인 후 Git 반영

작업용 Git 복제본과 Drive의 반영 대상 파일을 대조한다. 폴더 전체 복사나 `git add .` 대신 파일 목록을 확인한다.

반영 대상:
- `worker.js`, `src/`, `index.html`, `assets/`, `companies.json`, 기존 공개 HTML/XML/TXT, `wrangler.jsonc`
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.gitignore`
- `tests/`, `scripts/`, `.github/workflows/verify.yml`, `README.md`, `DEPLOY.md`, 필요한 개발 보고서

제외 대상: `config.ps1`, 비밀값·토큰, `.env*`, `.dev.vars*`, `node_modules/`, `.wrangler/`, `.pnpm-store/`, `dist/`, `archive/`, `test-results/`, `reports/baseline.html`. 업무 인수인계 문서는 Drive 기준으로 관리한다.

Git 복제본에서 `git status --short`, `git diff --check`, `git diff --stat`과 실제 차이를 확인하고 동일한 `pnpm verify`를 실행한다. 승인된 파일만 커밋한다.

이번 변경 커밋 제목 초안: `시세 처리 안정화 및 회귀 테스트 구축`.

## 4. Cloudflare 빌드·운영 반영 확인

기본 배포 경로는 GitHub main → Cloudflare Workers Build → adrgap.com이다. 자동 배포가 설정되어 있으면 main 반영이 배포를 시작할 수 있다. 승인된 Git 반영 후 별도의 로컬 Wrangler 배포를 중복 실행하지 않는다.

다음은 권장 설정이며, **이번 로컬 작업에서 Cloudflare 설정이나 브랜치 보호를 변경하지 않았다.**
- 설치: 잠금 파일에 맞는 `pnpm install --frozen-lockfile`
- Build command: `pnpm test`
- Deploy command: `pnpm exec wrangler deploy`
- PR의 `verify` 검사 통과를 main 반영 조건으로 지정

CI 파일만 추가했다고 배포가 자동 차단되는 것은 아니다. 브랜치 보호 및 Cloudflare Build command 설정은 별도 승인 후 확인·적용해야 한다.

배포 후 기록할 항목:
1. Git 커밋 SHA와 Cloudflare Build 성공 결과·배포 버전 ID.
2. 홈·가이드·약관·개인정보처리방침·robots·sitemap 및 `/assets/` 응답 확인.
3. 실제 브라우저 초기 요청에는 force 없음, 버튼에는 `/api/market?force=1` 확인.
4. 환율·한국 시세의 기존 `기준` 시각, 한국 정규장/미국 정규장·시간외 라벨 확인.
5. Yahoo가 원본을 갱신하지 않았을 때 시각 유지가 정상임을 확인. 억지로 더 최신 시각을 만들지 않는다.
6. 데스크톱과 모바일 390px 화면, 펼치기/접기, 오류 복구, 가로 넘침 확인.
7. 분석 company_id 전환 날짜 기록. 기존 ID 매핑은 README 참고.

HTTP 200이나 HTML 문자열 확인만으로 Cloudflare Build와 모든 화면 검증을 완료했다고 보고하지 않는다.

## 5. 되돌리기와 기록

이번 로컬 개선 전 확인된 main 커밋은 `98279b57e21d7dbd34a111504bb93ddf5eda4a1e`다. 배포 전 원격 최신 상태를 다시 확인한다.

문제 발생 시 증상과 영향부터 보고하고 되돌릴 대상 버전을 확인한다. 승인 후 Cloudflare의 이전 검증 버전 복원 또는 변경 커밋의 revert를 사용한다. main 강제 덮어쓰기·이력 삭제는 하지 않는다. 복구 후에도 운영 화면/API를 다시 검증한다.

`PROJECT_HANDOVER.md`와 개발 보고서에 배포 결과·미확인 항목·남은 작업을 함께 갱신한다. 광고·유료화·재판매는 별도 승인과 데이터 이용 조건 검토가 필요하며 이번 작업에 포함하지 않는다.
