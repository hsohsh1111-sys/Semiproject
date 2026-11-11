# 실제 TiDB 접속 결과와 호환성 조치안 — 2026-11-06

## 확인 결과

사용자가 비밀번호를 수정한 뒤 인증·접속에 성공했다. 실제 DB의 테이블·컬럼·users/user_profiles PK/FK 메타데이터를 읽었다. 회원 행·비밀번호 해시·인바디 수치는 읽지 않았고 DDL·데이터 변경은 실행하지 않았다. 접속정보는 출력하거나 문서에 저장하지 않았다.

전체 메타데이터 차이: [db-schema-live-20261106.json](./db-schema-live-20261106.json).

실제 DB는 9개 테이블이다. 확정 ERD 11개 중 `favorites`, `inbody_records`, `sellers`가 없고, ERD 밖의 `wardrobe_items`가 있다. 다른 테이블에도 이름 차이가 있어 DB 연결 성공을 전체 기능 호환으로 보지 않는다.

## 송성근 담당 API에 직접 영향을 주는 차이

| 항목 | 실제 DB | 현재 확정 ORM/API | 영향 |
| --- | --- | --- | --- |
| 회원 이름 | `users.display_name` VARCHAR(80), NOT NULL | `users.name` | DB 접속이 돼도 현재 회원 SQL과 맞지 않음 |
| 프로필 PK | `user_profiles.user_id` PK | 독립 `id` PK + user_id UNIQUE | 단순 이름 변경만으로 해결 불가 |
| 프로필 항목 | style_preference, fit_preference, favorite_color | preferred_style, preferred_fit, preferred_colors | 필드/저장 형식 변환 합의 필요 |
| 추가 프로필 항목 | weight_kg, personal_color 없음 | 해당 컬럼 사용 | 프로필 읽기/저장 SQL 호환되지 않음 |
| 인바디 | inbody_records 없음 | 기록 API가 해당 테이블 사용 | 실제 저장·조회 불가 |

password_hash는 실제 users 테이블에 존재하며 NOT NULL이다. 회원 이름 컬럼 차이를 해결하기 위해 임의로 비밀번호를 재설정하거나 계정을 다시 만들 필요는 없다.

## 조치 순서 — 아직 적용하지 않음

1. **DB 담당자와 운영 중인 서비스 확인:** 팀원의 이전 백엔드는 display_name을 사용한다. 공유 DB를 바로 name으로 바꾸면 그 서비스에 영향을 줄 수 있다. 실제 운영/테스트 DB인지, 어떤 서버가 같이 쓰는지 확인한다.
2. **회원 스키마 방향 확정:** 확정 ERD의 name을 최종 기준으로 하되 기존 배포 코드와 함께 전환할지, 별도 통합용 테스트 DB를 사용할지 합의한다. 단순히 name 컬럼만 추가하면 기존 display_name의 NOT NULL 조건 때문에 신규 가입이 실패할 수 있어 검토 없이 실행하지 않는다.
3. **프로필 데이터 매핑:** 독립 id PK, user_id UNIQUE/FK, 체중·퍼스널컬러·선호 색상 저장을 정한다. favorite_color 문자열을 preferred_colors JSON으로 전환할 때 기존 값 보존·NULL 처리와 역호환이 필요하다. 기존 PK를 무작정 삭제하지 않는다.
4. **인바디 테이블:** 확정 컬럼과 FK를 기준으로 신규 테이블 DDL/Alembic 변경안을 검토한다. 신체 수치 자료형·시간대·삭제 정책은 팀 합의 후 적용한다.
5. **다른 담당 테이블:** favorites/sellers/products/offers/price histories/outfits/crawl logs의 차이는 해당 담당자와 함께 검토한다. wardrobe_items를 임의 삭제하거나 favorites로 이름만 바꾸지 않는다.
6. **승인된 환경에서 적용·검증:** 백업/되돌리기 계획과 함께 적용한 뒤 백엔드를 재시작하고 테스트 계정으로 회원→프로필→인바디→피팅을 확인한다. 지금은 실제 계정 생성·행 저장 테스트를 하지 않았다.

이번 단계는 읽기 전용 접속·차이 확인까지다. DB와 ORM을 임의로 변경하지 않았고 실제 서버에 새 환경변수를 적용하기 위한 재시작도 하지 않았다. 인바디 기반 체형 고도화는 종료한 범위를 유지한다. 커밋·푸시·배포는 하지 않았다.
