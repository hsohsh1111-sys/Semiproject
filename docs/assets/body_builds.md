# 체형별 실제 형태 변형

## 최신 연결: BodyBuild v10 / Muscle Detail v3 — 사용자 참고 이미지 기반 보정

사용자가 제공한 남성 운동형 마네킹의 정면·측면·후면 이미지를 형태 참고로 사용했다. 이미지에서 정확한 3D 메시를 복원한 결과는 아니다. 기존 의류 정렬과 슬라이더를 재사용하기 위해 기존 A자 팔 자세를 유지한다.

- 이전 Muscle Detail v1의 가로줄 형태를 중단하고 현재 화면에서는 사용하지 않는다. 인체·의류 5종은 `*_BodyBuild_v10.glb`, 표면 디테일은 `ONFIT_Muscle_Detail_v3.png`를 연결한다.
- 근육형만 기존의 혼합 체형에 근육을 더하던 방식에서, MPFB 남성 운동형 타깃을 이용한 몸통 형태로 보정했다. 얼굴·사타구니 변형은 제한한다. 뾰족한 가슴 컵 성분을 제거하고 어깨·등·팔의 겹친 변위는 국소 평활화해 날개 같은 등과 패드 같은 어깨를 완화했다. 기본 가슴/복부 완화와 다른 체형은 유지한다.
- 노멀맵은 전체 몸통을 가로지르는 선을 없애고, 좌우 복근 각각의 경계·중앙선·대흉근 아래 곡선·척추 주변과 견갑골 굴곡을 약 1~3mm의 고해상도 조형에서 베이크했다. 원본 UV는 유지하며 이미지 사진을 의류처럼 투영하지 않는다. 근육형에서만 normalScale=1, roughness=0.78로 적용한다.
- 비교 렌더: `assets/blender/previews/muscle_detail_v3/before.png`, `after.png`, `athletic_front.png`, `athletic_side.png`, `athletic_back.png`. 새 렌더를 확인한 뒤 연결했다. 가로줄이 줄고 복근이 각각의 볼륨으로 구분되는 것은 확인했다. 제공 이미지와 같은 정밀 해부학 조형 수준까지 재현됐다는 의미는 아니다.
- 관련 테스트 26개 통과. 기존 체형·키 비율·카메라·의류 색상·원본 재질 복원과 실제 정상 PNG 데이터를 확인했다. 브라우저 직접 시각 검증과 모든 의류 관통 검사는 미완료다.
- 디스크 공간 부족으로 이전 전체 빌드의 public 자산 복사 단계가 실패했다. 이번 코드 빌드는 `scripts/build_reference_check.mjs`에서 `publicDir:false`로 중복 복사를 제외한다. GLB/PNG 파일 자체는 별도 관련 테스트로 읽어 검증한다. 이 출력은 모델을 포함한 배포 패키지가 아니다. 배포는 실행하지 않는다.

기존 BLEND/GLB/PNG는 보존했다. v8/v9 및 Muscle Detail v2는 중간 검토본이며 현재 화면에 연결하지 않는다. 아래 내용은 이전 버전 제작 기록이다.

## 이전 연결: BodyBuild v7 + 근육형 전용 표면 디테일

인체 및 의류 5종을 `*_BodyBuild_v7.glb`로 연결했다. 인체의 기존 기본/마른 체형과 가슴·복부 완화는 유지한다. 근육형의 deltoid/upperarm/forearm/latissimus/thigh/calf 볼륨을 강화하고, 뾰족한 가슴 컵 성분을 완화해 넓은 가슴 근육 형태로 보정했다. 강한 변형이 접히던 양쪽 겨드랑이만 변위 필드를 평활화했다. 원본 메시 전체 스무딩은 하지 않았다.

- 인체는 동일 정점 구조와 23개 Morph Target을 유지한다. 의류에는 새 근육형 변위를 보간해 파생본을 생성했다. 기존 모든 BLEND/GLB는 보존했다.
- `ONFIT_Muscle_Detail_v1.png`: 기존 인체 UV에 맞춘 2048px tangent-space normal map. 325,610개 정점의 고해상도 평가 메시에서 복근과 가슴 경계를 조형해 Cycles CPU로 베이크했다. 외부 인물 사진이나 근육 사진을 붙인 것이 아니다. 실제 웹 인체의 정점 수를 32만 개로 늘린 것도 아니다.
- 큰 실루엣은 실제 메시 Morph, 미세한 굴곡은 노멀맵 조명 반응으로 표현한다. 노멀맵 자체는 실루엣·실측 치수·충돌 형상을 바꾸지 않는다.
- `bodyAppearance.js`가 인체 재질만 복제한다. 근육형에만 노멀맵과 matte roughness 0.72를 적용하고, 다른 체형은 원래 재질 설정으로 복원한다. 피부색·상의·하의·아우터·모자 색상은 이 처리로 바꾸지 않는다. 텍스처는 Non-Color/flipY=false로 읽으며 실패하면 메시만 유지한다. React StrictMode의 effect setup/cleanup 재실행에도 원본 재질을 복구하고 새 인스턴스를 만든다.
- 근육형 예시 치수는 어깨 50 / 가슴 116 / 허리 74 / 골반 30 / 엉덩이 102 / 허벅지 62cm로 변경했다. 예시이며 실제 인바디 측정이나 의학적 추정 결과가 아니다. 개인이 입력한 키는 덮어쓰지 않는다.
- `assets/blender/previews/muscle_detail_v1/before.png`, `after.png`: 동일 카메라·조명의 적용 전후 비교. 확대 렌더에서 복근 6개 구획과 가슴 경계가 이전보다 뚜렷함을 확인했다. 회색 QA 재질을 사용하므로 실제 브라우저의 흰색 재질·조명과 밝기가 같다는 의미는 아니다.
- 관련 테스트 26개 통과. 실제 PNG의 유효한 비평면 법선 데이터, 근육형 전용 적용·복원, 재질 격리·재마운트, 기존 체형/키/카메라/의류 색상 검증을 포함한다. 실제 브라우저 육안 확인과 모든 체형·의류 조합의 관통 검사는 미완료다.

도구: `bake_muscle_detail.py`, 원본 보존 제작 보고서: `ONFIT_Human_BodyBuild_v7.json`, `ONFIT_Muscle_Detail_v1.json`, `body-build-clothes-v7.json`. 고해상도 조형과 베이크 장면은 `assets/blender/ONFIT_Muscle_Detail_v1.blend`에 저장했다.

## 이전 연결: 인체 v6 / 의류 v5 — 기본 복부 완화·근육형 복근

현재 인체는 `ONFIT_Human_BodyBuild_v6.glb`, 의류 5종은 `*_BodyBuild_v5.glb`다. 의류에는 복근의 울퉁불퉁한 표면을 복사하지 않고 체형 볼륨과 기본 복부 완화만 전달하므로 인체와 버전 번호가 다르다. 이전 BLEND/GLB는 덮어쓰지 않았다.

- 원본의 `stomach-pregnant-incr`가 기본값 0.5여서 사용자 복부 슬라이더 0에서도 배가 나왔다. 원래 키·가중치는 보존하고, 새 `body_abdomen_relief` 기본값 1로 앞쪽 확대 영향의 80%를 상쇄한다. 최대 정점 이동은 약 0.0392m이다. 사용자의 `abdomen_front` 추가 돌출은 별개로 정상 동작한다.
- `body_abdominal_definition`은 근육형에만 1, 다른 체형은 0. 좌우 3쌍의 넓은 Gaussian 볼륨과 중앙·가로 홈을 실제 메시 정점에 조형했다. 전체 스케일이나 이미지 붙이기가 아니다. 기존 인체 21개에 두 키가 더해져 총 23개다.
- 복근의 조형은 예술적 근사이며 인바디·실측 기반이 아니다. v4/v5는 경계가 약한 검토본이다. v6에서는 개별 볼륨의 높이 방향 분포를 좁혀 경계 겹침을 줄였다. 기존 모델을 재생성하거나 정점 순서를 바꾸지 않았다.
- 의류에는 `garment_build_relief` 기본값 1을 추가해 원래의 과한 앞판도 완화했다. 기존 UV·재질·원래 키를 유지하며, 이전과 같이 뒤집힘 없는 범위로 전달 강도를 제한했다. 의류 관통·자기 교차 전체는 미검증이다.
- 관련 Node 테스트 22개 통과: 기본 복부 감소, 추가 돌출의 독립성, 여섯 복근 영역의 실제 정점 변화, 근육형 전용 적용·복구, 색상·카메라 기존 검증. Blender 끝점 검사에서 새 면 뒤집힘 0.
- `previews/body_builds_v6/`: 정면·측면·후면 및 복부 확대/측광 진단 렌더. 측면에서 기본 복부가 줄어든 것은 확인했다. **일반 조명 렌더에서는 복근의 시각적 구분이 아직 약하다.** 정점 변화 검사만으로 선명한 복근의 시각적 품질이 완성됐다고 보지 않는다. 브라우저 육안 검증은 미완료다.

아래 v3/v2 내용은 이전 제작 기록이다.

## 이전 v3 연결 — 가슴 완화 및 근육 윤곽 보강

현재 React는 인체와 의류 5종 모두 `*_BodyBuild_v3.glb`를 사용한다. 기존 v2 및 원본은 보존한다.

- 인체 21개 Morph Target: 기존 18 + 체형 2 + `body_chest_relief` 1. 기존 18개 기본값은 그대로이고 새 가슴 보정의 기본값은 1이다.
- 세 체형 모두 가슴 앞면을 부드러운 국소 변위로 최대 0.012m 줄인다. 어깨 폭·가슴 좌우 폭·키·등·허리는 이 보정으로 변경하지 않는다. cm 입력을 수정하거나 의학적 추정식을 추가하지 않는다.
- 근육형 pectoral 타깃 강도를 0.75→0.35로 낮추고, dorsi 0.8, stomach-tone 0.65, upperarm 0.9, lowerarm 0.6, thigh 0.7, calf 0.55를 적용한다. 이 숫자는 MPFB 시각적 타깃 가중치이며 체성분 수치가 아니다. 가슴 크기를 증가시키는 대신 부위별 표면 변위를 강화한다.
- 의류 새 파생본은 기본 여유를 유지한 상태로 새 체형 변위를 추종한다. v3의 근육형 전달 강도는 반팔 0.9, 긴팔 1.0, 바지 1.0, 아우터 0.8, 후드 집업 0.3이다. 마른 체형 전달 강도는 v2 표와 동일하다. 세부 관통 해소는 미검증이다.
- 관련 테스트 20개 통과. 원래 기본 체형과 비교해 가슴 깊이만 감소하는지, 보정 0에서 원래 정점으로 정확히 복구되는지, 기존 v2 대비 복부·팔·종아리 실제 정점이 달라지는지 검사했다.
- Blender 타깃 검사에서 면 뒤집힘 0. `assets/blender/previews/body_builds_v3/`에 동일 조명·카메라의 9개 비교 렌더를 저장했다. v3 보통 체형 측면과 근육형 정면을 확인했다. 실제 브라우저 육안 검증 및 자기 교차·의류 관통 전체 검증은 미완료다.
- 정밀 복근 분할·근육 섬유·피부 디테일은 기존 메시/타깃의 한계가 있다. 이를 완성했다고 표시하지 않는다. 더 높은 표현 수준에는 별도 정밀 조형과 노멀맵 제작이 필요하다.

아래 내용은 이전 v2 제작 기록이다.

2026-11-05. 기존 너비·둘레 프리셋만으로는 근육량 차이를 표현하지 못해, 설치된 MPFB의 해부학적 체형 타깃을 새 자산에 추가했다. 인바디 수치로 자동 복원한 체형이나 의학적 추정값이 아니다.

## 이전 v2 파일

- 인체: `frontend/public/models/ONFIT_Human_BodyBuild_v2.glb`
- 편집 원본: `assets/blender/ONFIT_Human_BodyBuild_v2.blend`
- 의류: `ONFIT_TShirt_BodyBuild_v2`, `ONFIT_LongSleeve_BodyBuild_v2`, `ONFIT_Pants_BodyBuild_v2`, `ONFIT_Outer_BodyBuild_v2`, `ONFIT_HoodedJacket_BodyBuild_v2` 각각의 GLB(public/models)와 BLEND(assets/blender).
- 기존 BodyMorph v3 인체와 모든 원본 의류는 보존했다. BodyBuild v1 및 일부 v1 의류는 중간 검토본으로 현재 화면에 연결하지 않았다.

## 생성 방법과 출처

MPFB 2.0.18에 설치된 core targets를 사용했다. 실제 기존 Asian male 타깃과의 좌표 비교로 단위 배율 약 0.1 및 정점 대응을 검증했다. 기본 남녀 혼합 체형의 가중치를 유지하고 해당 비율로 새 변위를 합성했다.

- `body_build_lean`: minmuscle/minweight 타깃 기반.
- `body_build_muscular`: maxmuscle/minweight에 pectoral, dorsi, shoulder, upperarm, lowerarm, upperleg, lowerleg의 별도 근육 타깃 합성.
- 기존 18개 Morph Target과 기본 가중치는 유지. 새 타깃 2개는 기본 0, 총 20개.
- 얼굴·발은 변형을 억제하고 기존 부위별 슬라이더와 가산 적용한다. 전신 일괄 확대나 근육 그림 텍스처를 사용하지 않는다.

core base mesh/targets는 CC0. 공식 설명: https://static.makehumancommunity.org/mpfb/faq/can_i_sell_models.html 및 https://www.makehumancommunity.org/about/license.html . MPFB 프로그램 코드의 GPL 라이선스와 그래픽 자산 라이선스는 구분한다. 사용한 압축 target 파일의 해시는 `ONFIT_Human_BodyBuild_v2.json`에 기록했다.

## React 연결

`bodyBuild`는 신체 치수와 별도의 시각적 상태다. 마른 체형은 lean=1, 근육형은 muscular=1, 보통 체형은 둘 다 0. 세부 치수를 바꿔도 선택한 체형의 근육량 특징은 유지한다. 기존 body_engine/API/DB는 변경하지 않는다.

기존 GLB 의류에 `garment_build_lean`, `garment_build_muscular`를 추가했다. 인체 변위를 가까운 표면 정점에서 보간하고 **변위만** 평활화했다. 원래 의류의 정점 순서, UV, 재질 및 기존 Shape Key는 보존했다. 면 뒤집힘을 방지하기 위해 의류별 변위 강도를 제한했다.

| 의류 | 마른 체형 강도 | 근육형 강도 |
|---|---:|---:|
| 반팔 | 0.5 | 0.9 |
| 긴팔 | 1.0 | 1.0 |
| 바지 | 1.0 | 1.0 |
| 아우터 | 0.2 | 0.4 |
| 후드 집업 | 0.2 | 0.2 |

아우터·후드의 추종은 제한적이며, 인체·의류 간 관통 해소를 보장하지 않는다. 원단 시뮬레이션은 아니다. 자세한 결과는 `assets/blender/body-build-clothes-v2.json`.

## 검증 범위

- Blender: 인체 타깃 0.5/1.0에서 좌표 유효·기준 대비 면 뒤집힘 0. 의류별 새 타깃에서도 면 뒤집힘 0. 자기 교차나 인체 관통 전체를 검증한 것은 아니다.
- Three.js: 동일한 치수에서도 근육형 표면이 변하고, 전신 축별 스케일·평행이동으로 설명할 수 없는 국소 변위가 있음을 검증. 보통 체형의 평가 정점은 기존 인체 v3와 정확히 일치한다.
- 관련 자동 테스트 19개 통과: `bodyBuilds.test.js`, `bodyPresets.test.js`, `glbCamera.test.js`, `garmentAppearance.test.js`.
- `assets/blender/previews/body_builds_v2/`: 보통/마른/근육형의 정면·측면·후면 총 9장. 치수 슬라이더는 중립 상태이고 새 체형 타깃만 비교한 렌더다. 근육형·마른 체형 정면 렌더에서 어깨·팔·허벅지 차이를 확인했다.
- 실제 브라우저 육안 검증과 모든 체형 조합에서의 의류 관통 검증은 미완료. 선명한 복근이나 사실적인 근육 섬유까지 표현하는 모델은 아니다.

도구: `frontend/scripts/create_body_builds.py`, `prepare_build_clothes.py`, `render_body_builds.py`. 기존 출력이 있으면 덮어쓰기를 거부한다. 최종 연결 버전은 v2.
