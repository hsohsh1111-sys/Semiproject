# 여성형 복부 앞판 보정·치마 추가 — 2026-11-06

## 현재 적용

- 반팔: `frontend/public/models/ONFIT_TShirt_Female_v6.glb`
- 긴팔: `frontend/public/models/ONFIT_LongSleeve_Female_v6.glb`
- 치마: `frontend/public/models/ONFIT_Skirt_Female_v3.glb`
- 인체 v2·기존 바지/아우터/후드 v5·모자는 유지했다. 기존 BLEND·GLB 원본은 덮어쓰지 않았다.
- 이번 치마 중간본 v1/v2의 GLB·제작 JSON은 로컬 `assets/blender/female_skirt_drafts/`에 보관해 배포 폴더에서는 제외했다.

### 복부 원인과 수정

기존 남성용 상의의 기본 앞판 여유가 여성형으로 변위를 전달한 뒤에도 남았다. 인체의 복부 슬라이더를 낮추는 대신 옷의 기본 복부 앞판만 보정했다. 여성형의 실제 앞쪽 표면을 광선으로 찾고 약 20mm의 여유를 목표로 과한 앞판 깊이를 부드럽게 줄였다. 상하·좌우 falloff와 UV 경계 일치를 유지하고 가슴·소매·뒤판은 최대한 보존했다. 원래 복부 Morph의 상대 변위는 유지한다.

제작 좌표의 최대 안쪽 보정은 반팔 약 29.5mm, 긴팔 약 15.6mm다. 실물 옷 치수나 착용감 정확도를 뜻하지 않는다. `prepare_female_clothes.py`의 v6 반팔·긴팔 분기와 `female-clothes-TShirt,LongSleeve-v6.json`에 기록돼 있다.

### 치마 출처와 제작

설치된 MPFB `female_elegantsuit01`에는 블라우스와 실제 무릎길이 치마가 분리된 메시로 들어 있다. 원본 MHCLO 헤더의 2020년 CC0 공개 선언을 확인했다. 원본 표기 저작권자는 Data Collection AB, Joel Palmius, Jonas Hauquier다.

공식 자산 출처: https://www.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html

`create_female_skirt.py`에서 MPFB의 실제 의류 적용 기능으로 여성형에 입힌 뒤 치마 부분만 분리했다. 원래 UV·재질·텍스처·뒤트임을 유지했다. 새 도형을 조합해 치마를 만들지 않았다. 원래 허리선이 앞판 밖으로 비쳐 상단만 국소 보정했으며 치마 총장과 아래쪽 형태를 유지했다.

실제 Morph Target 6개: `garment_waist_width`, `garment_pelvis_width`, `garment_hip_volume`, `garment_abdomen_front`, `garment_build_lean`, `garment_build_muscular`. MPFB 여성형 신체 변위를 전달한 근사치이며 원단 물리는 아니다. 제작 JSON과 `ONFIT_Skirt_Female_LICENSE.txt`를 함께 보존한다.

## 화면 동작

`FittingPage.jsx`에 `bottomKind`를 추가했다. 여성형일 때 하의에서 바지/치마 중 하나를 입거나 벗는다. 같은 bottom 슬롯이므로 둘이 동시에 표시되지 않는다. 기본 모델로 돌아가면 바지로 전환한다. 기존 하의 사용자 지정 색상과 의류·색상 초기화, 카메라 상태를 재사용한다.

## 검증과 한계

- 관련 테스트 29개 통과. 새 `femaleSkirt.test.js`는 상의 복부 정점 감소·가슴/소매 보존 범위, 치마의 실제 모델·라이선스·타깃·양방향 및 복합 변형·복원·모델별 선택을 검사한다.
- Vite 메모리 코드 빌드 성공. 로컬 서버에서 새 GLB 3개 모두 HTTP 200과 GLB 헤더 확인.
- 기본 체형의 반팔/긴팔/치마와 인체 교차는 각각 0쌍. 기본 반팔/치마와 긴팔/치마 교차도 0쌍이다.
- 치마의 마른 체형 54쌍, 근육형 12쌍, 허리 최소·엉덩이 최대 28쌍의 인체 교차 후보가 남았다. 6개 검사 상태의 치마 자기 교차 후보는 0쌍이다. 삼각형 쌍 수는 관통 깊이나 시각적 결함 수가 아니다.
- 비교 렌더 `assets/blender/previews/female_clothes_v6_skirt3/`: 반팔/긴팔 측면과 치마 착용 정면·측면·후면을 확인했다. 브라우저의 실제 클릭·색상·자유 회전 육안 검증은 미실시다.
- 독립 GLB 재로딩 검사: `assets/blender/female-clothes-validation-v6-skirt3.json`. 기존 후드 목둘레·일부 극단 체형 문제는 이번에 해결하지 않았다.
- Python 엔진·API·DB는 변경하지 않았다. 커밋·푸시하지 않았다.
