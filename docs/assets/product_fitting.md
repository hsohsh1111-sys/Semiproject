# 상품 기반 3D 템플릿 연결 1단계 (2026-11-03)

## 실제 상품 연결 상태

**판매처 원문과 상품 ID·이미지·권리 조건을 대조 완료한 실제 상품은 아직 0건이다.** 현재 `services/api.js`의 목록과 백엔드 상품 API는 샘플이다. 제공된 `/textures/nike-shirt-reference.png`는 기존 사용자 사진으로, 판매처 상품 ID·원본 구매 링크·재배포 권리는 확인되지 않았다. 이를 실제 판매 상품이나 수집 완료 데이터로 표시하지 않는다. 실제 상품 URL을 요청했으며 임의의 다른 상품 이미지로 대체하지 않았다.

로컬 비교 항목은 별도 참조 키만 사용하며 `productId`, `seller`, `purchaseUrl`은 null이다. 기존 목록은 읽기 전용으로 재사용하고 '[샘플]'로 표시한다. TOP/KNIT 등 모호한 샘플 분류를 임의로 반팔·긴팔로 변환하지 않아 3D 실행을 막는다.

## 구현 범위

- 기존 `FittingPage.jsx`에 상품 선택·정보 입력·앞/뒷면 원본 이미지·현재 3D 연결 정보·구매 링크를 추가했다.
- 상품 정보는 상품 ID·상품명·판매처·구매 URL·앞면 필수, 뒷면·색상·사이즈·실측표 선택이다. 이미지 사용 조건 확인 체크가 필요하다. 브라우저 메모리에서만 유지하며 DB/API를 변경하지 않는다.
- 직접 입력 데이터도 '사용자 입력·미검증'으로 표시한다. ID와 판매처 원문 일치는 자동 검증하지 않는다. 구매 링크·외부 이미지 주소는 HTTPS만 허용하고 자격증명이 포함된 링크, javascript/data/file URL을 거부한다.
- 실제 앞면 이미지 로딩 후에만 실행 버튼을 활성화한다. 실패하면 실패 안내를 표시하고 다른 상품 사진이나 가짜 결과로 대체하지 않는다. 사진은 비교 패널에만 표시하며 임의의 이미지 추론·다운로드를 수행하지 않는다.
- 한 번에 선택 상품 하나를 해당 슬롯에 연결한다. 다른 의류는 기존 템플릿으로 남는다. 상품을 고른 것과 현재 3D 적용 상태를 구분한다. 해당 의류의 수동 종류/색상 변경·벗기·모델 전환은 상품 연결을 해제한다.
- 기존 체형 슬라이더·공통 Morph 가중치·카메라·회전 구조를 재사용한다. 상품 색상 변경에 반복 API 요청이나 GLB 다운로드는 필요하지 않다.

## 템플릿·UV 확인

| 분류 | 재사용 GLB | UV 정점 수 | Morph Target |
| --- | --- | ---: | ---: |
| 반팔 | ONFIT_TShirt_BodyMorph_v5 | 16,014 | 6 |
| 긴팔 | ONFIT_LongSleeve_BodyMorph_v1 | 8,705 | 5 |
| 바지 | ONFIT_Pants_BodyMorph_v2 | 5,641 | 4 |
| 아우터 | ONFIT_Outer_BodyMorph_v1 | 8,948 | 5 |
| 후드 집업 | ONFIT_HoodedJacket_BodyMorph_v1 | 13,280 | 5 |
| 모자 | ONFIT_Cap_Neutral_v1 | 3,167 | 0 |

모두 실제 메시 1개와 UV가 있다. 그러나 각 UV는 해당 MPFB 텍스처용이며 상품 앞/뒷면 사진의 좌표와 일치하지 않는다. 현재 상품 사진의 로고·패턴을 정확히 복원하는 UV 재배치·마스크·데칼 보정은 구현하지 않았다. 기존 비교용 코드 티셔츠의 사진 로고 역시 MPFB UV와 동일하지 않아 전용 GLB 매핑으로 재사용하지 않는다.

따라서 1단계는 **제공된 HEX 색상값만 단색 근사 적용**한다. 색상 미확인은 '중립 회색 템플릿'으로 표시한다. 상품 비교 모드에서는 복제 재질에서 MPFB 고유 이미지/노멀/표면 맵을 제외하여 원래 MakeHuman 로고가 선택 상품의 로고처럼 보이지 않게 한다. 기하 정점·UV·법선·Morph Target 및 원본 GLB 파일은 변경하지 않는다. 상품과 템플릿의 패턴·원단·재단·핏이 같다는 의미가 아니다. 실측표도 비교용 원문으로만 표시하며 사이즈 계산에 사용하지 않는다.

후드 집업은 top 슬롯을 대체한다. 기존 후드+패딩 미지원 조합은 계속 제한한다. 모자·상의·하의·아우터 슬롯 구조는 그대로 유지한다.

## 관련 파일

- `frontend/src/components/fitting/ProductFittingPanel.jsx`: 선택·입력·원본 비교·오류 UI
- `frontend/src/components/fitting/productFitting.js`: 메타데이터 검증·분류·템플릿 계약
- `frontend/src/components/fitting/productAppearance.js`: 원본과 격리된 단색 재질
- 기존 `FittingPage.jsx`, `MannequinCanvas.jsx`, `GlbMannequinModel.jsx`, `garmentAppearance.js`: 연결
- `frontend/src/components/fitting/productFitting.test.js`: 관련 검증

## 검증 및 남은 작업

관련 테스트 **23개 통과**, 프론트엔드 빌드 성공. 테스트는 ID·메타데이터 보존, 미검증/샘플 구분, 링크/권리 입력 누락 검증, 여섯 템플릿 선택·실제 Morph 정점 변화·복원, UV 보존, 단색 재질 격리, GLB 오류 및 카메라 수학을 확인했다. 이미지 `<img>` onError와 폼 조작·실제 WebGL 화면은 브라우저에서 직접 검증하지 않았다. 빌드에는 기존 번들 크기 경고가 있다.

실제 상품 URL 및 권한이 확인되면 해당 원문의 ID·판매처·앞/뒷면·치수표를 대조한 로컬 데이터로 교체해야 한다. 상업 이용/외부 배포 시 이미지 이용 조건도 그 판매처 기준으로 확인해야 한다. 현재 사용자 제공 참조 사진의 권리를 임의로 허가된 것으로 해석하지 않는다.

실행: `http://127.0.0.1:5173/#/fitting` → 왼쪽 **상품 사진과 3D 템플릿 비교** → 상품 선택 또는 **실제 상품 정보로 로컬 테스트 추가** → 이미지 로딩 후 **선택 상품으로 3D 피팅 실행**. 원본 이미지와 오른쪽 단색 템플릿의 차이를 확인한다.

테스트: frontend 폴더에서 `node --test src/components/fitting/productFitting.test.js src/components/fitting/garmentAppearance.test.js src/components/fitting/neutralCap.test.js src/components/fitting/glbCamera.test.js`.
