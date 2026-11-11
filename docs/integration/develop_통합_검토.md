# develop 통합 작업본

## 기준

- 대상: `hsohsh1111-sys/Semiproject`, `develop`의 `ba1d63d`.
- 기능 원본: `tjdrms8353-spec/semiProject`, `306229525`의 `Semiproject-front/`.
- 로컬 작업 브랜치: `integration/song-fitting-20261106`.
- 원본 클론과 develop은 변경하지 않았으며 원격 푸시·최종 병합은 하지 않았다.

## 통합 방식과 공통 파일 영향

팀 저장소의 최상위 backend/frontend/ai-fashion 구조를 유지했다. 중첩 Semiproject-front 폴더를 만들지 않았다. 가격 관련 최신 파일 9개 중 HomePage, PriceTimingPage, SeasonalOutfitPage, WardrobePage, seasonalFavorites, styles.css는 원본과 동일하다. App·Header·공통 API 주소만 피팅 화면·통합 세션 연결을 위해 변경했다.

- DB: 팀 `database/schema.sql` 보존. 기존 DB에 새 DDL을 실행하지 않았다. 프로필·인바디 추가 도구는 명시적으로 실행할 때만 작동한다. 과거 검토 SQL의 rename/rekey 제안은 실행하면 안 된다.
- 인증: 기존 Argon2 비밀번호 방식 유지. 회원명은 display_name에 연결. JWT는 새로운 검증 조건을 사용하므로 기존 로그인 토큰은 재사용하지 말고 다시 로그인한다. API 응답은 회원가입=회원, 로그인=토큰, me=회원으로 분리되며 AuthModal도 함께 연결했다.
- 사용자 목록: 기존 public-members 경로를 유지하되 통합 User 모델을 사용해 중복 테이블 정의를 피했다.
- 설정: .env 미복사, .env.example만 빈 예제. DB 자동 생성·ALTER를 하던 앱 시작 코드는 제거했다. 명시적인 마이그레이션으로 관리한다.
- 의존성: 팀·피팅 requirements의 패키지 및 버전 제약을 합쳤다. 설치된 기존 가상환경을 사용한 테스트와 깨끗한 Linux 의존성 설치 검증은 구분한다.
- 피팅: 인체·의류 GLB, 색상·카메라·여성 모델·치마·프로필 서비스와 관련 테스트 반영. 원본 자산 삭제 없음.
- 실행: Start-ONFIT.ps1은 저장소 루트에서 backend/frontend/ai-fashion을 실행하도록 변경했다. render.yaml과 EC2 예제의 경로도 이 구조에 맞췄다.
- 기존 README·DB 스키마·다른 팀원 전용 파일은 보존했다. 기존 추적 파일 삭제 0개.

## 검증

백엔드 인증·프로필·인바디·피팅·팀 통합·스키마 관련 테스트 100개 통과(SQLite). 프론트 인증·프로필·카메라·체형·여성 의류·치마·키 비율 테스트 37개 통과. `npm.cmd run check:site`로 메인 및 AI 패션 두 코드 빌드 성공(public 복사 없이 메모리에서 검증). 새 작업본에서 실제 DB 쓰기·브라우저 검증·배포는 수행하지 않았다.

초기 프론트 검사는 의존성 미설치로 실패했으며 패키지 준비 후 37개 테스트와 빌드를 다시 실행해 통과했다. USB 파일시스템에서 junction을 지원하지 않아 의존성 공유 연결은 사용하지 않았다. 기존 가상환경·기존 실행 서버는 수정하지 않았다.

팀원 실제 클론 `E:\송성근(심화)\team-repos\Semiproject`에 동일한 작업 브랜치로 반영했다. 아직 커밋되지 않은 변경이므로 GitHub Desktop에서 무심코 Discard하거나 다른 브랜치로 이동하지 않는다. 원격 develop 반영은 검토 후 별도 진행한다.

## 실행 준비

실제 환경은 `backend/.env`에 별도로 구성한다. 비밀번호나 API 키를 Git에 넣지 않는다. frontend와 ai-fashion은 각 폴더에서 `npm.cmd ci`, backend는 별도 가상환경에 requirements 설치가 필요하다. 기존 Windows 가상환경을 다른 OS로 복사하지 않는다.

이 폴더의 과거 문서에 나오는 Semiproject-front 경로는 기능 원본 저장소 기준이다. 이 작업본에서는 해당 접두사를 제거해 읽는다. 원본의 배포·DB 검증 이력을 이번 작업본의 실환경 검증으로 간주하지 않는다.
