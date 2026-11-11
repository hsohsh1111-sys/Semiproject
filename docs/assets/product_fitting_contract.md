# 상품 → 3D 피팅 연동 계약

2026-11-05 · 안종범(상품) / 송성근(피팅) 협의용. DB/API 스키마 변경 요청이나 구현 완료 명세가 아니다.

## 현재 확인한 계약

`GET /api/products/` → JSON 배열. 항목은 `id:string`, `name:string`, `category:string`, `price:integer`, `image:string`, `tag:string`이다. 현재 구현은 `sample_products()` 반환이며 실상품 연결이 아니다. 목록 봉투 `{items:[]}`는 현재 미지원이다. 실패를 Mock으로 자동 대체하지 않는다.

DB SQL의 products는 id/brand/product_name/model_number/category/color, product_offers는 product_id/seller_name/product_url/option_label/current_price_krw/last_checked_at을 가진다. API의 name은 DB product_name과 다르며 현재 DB 조회 코드와 연결되지 않았다. offers API도 빈 배열과 sample-data-pending을 반환한다. 피팅 변환기는 DB 직접 접근·스키마 수정을 하지 않는다.

## 피팅 필수 필드

| API 필드 | 타입 | 처리 |
|---|---|---|
| id | string (안전한 정수도 문자열로 변환) | 원문 ID 보존, source+ID로 로컬 key 구성 |
| name | string | 없으면 안내명 표시, 실행 차단 |
| category | string | 아래의 정확한 분류만 지원 |
| image | URL string | 대표 이미지. 없거나 안전하지 않으면 실행 차단 |

분류는 `short_sleeve`, `long_sleeve`, `pants`, `outer`, `hooded_jacket`, `cap` → 기존 GLB 및 top/bottom/outer/headwear 슬롯에 연결한다. TOP/KNIT/색상이 섞인 문자열은 정확한 재단을 알 수 없어 미지원이다. 상품 담당자와 분류 코드를 합의해야 한다.

## 선택 필드 제안 (현재 API에는 없음)

| 제안 필드 | 타입/단위 | 누락 처리 |
|---|---|---|
| front_image, back_image | URL string | 앞면 없으면 대표 이미지 비교용 사용, 뒷면 없음 표시 |
| color_hex | #RRGGBB | 중립 회색 근사, 색상명에서 임의 변환 안 함 |
| brand | string | 미확인 |
| seller_name, product_url | string / HTTPS URL | 판매처 미확인, 구매 링크 숨김 |
| size_table | 아래 객체 | 치수 추측 안 함, 수동 입력 UI 유지 |

대표 이미지가 실제 앞면인지 API만으로 확정하지 않는다. 디자인 영역은 기존 사용자의 선택·권한 확인 후에만 적용한다. 자동 로고 검출/재현 또는 이미지 사용 권한을 API 수신만으로 주장하지 않는다. 전면 사진만으로 후면을 생성하지 않는다.

외부 URL은 자격증명 없는 HTTPS만 허용. 이미지에 한해 `/textures/...` 형태의 프로젝트 경로를 허용한다. http/file/data/javascript 및 // 외부 경로는 거부한다. CORS로 픽셀 추출이 불가능하면 기존 디자인 편집 오류 안내를 사용하고 사용자가 권한 있는 로컬 파일로 입력한다. img onError는 다른 상품 이미지로 대체하지 않는다.

## 사이즈표 객체 제안

```json
{
  "rows": [{"name":"M","shoulder":44,"chestFlat":52,"length":68,"sleeve":21}],
  "referenceName":"M",
  "source":{"type":"sample"}
}
```

위 숫자는 **명시적 Mock**, 실제 상품 수치가 아니다. 단위는 모두 cm. 어깨너비/가슴 단면/총장은 필수, 소매는 선택 null. 판매처 표는 source를 `{type:"seller",url:"https://판매처-실제-주소",confirmed:true}`로 제공하되 원문을 사람이 확인한 경우만 confirmed를 사용한다. 이 플래그는 자동 대조/이용권한 검증 증거가 아니다. API 공급자가 원문 측정법과 출처를 별도로 전달해야 한다.

기존 validateSizeTable/selectProductSize를 재사용한다. 형식 오류는 안내 후 미적용. 현재 치수 보정은 반팔만 지원하며 다른 의류에는 사이즈표가 와도 변형 완료로 표시하지 않는다. 가슴 단면×2와 몸둘레 비교 및 3D 기준점 보정은 실물 착용 정확도·추천을 보장하지 않는다.

## 연결·출처 및 남은 합의

`productCatalog.js`가 기존 API 응답을 피팅 데이터로 변환한다. API 버튼은 현재 서버가 샘플이므로 source=sample로 호출하며, 실제 데이터라고 표시하지 않는다. 테스트 버튼은 source=mock/integration_mock이고 사진은 기존 사용자 참조 사진이다. API 실패 시 성공/실상품으로 표시하지 않는다. 실제 전환 전 API 경로·실데이터 출처·카테고리·선택 필드명·이미지 이용 조건·사이즈표 측정법을 합의하고 호출부 provenance를 변경해야 한다. unverified는 수신했다는 뜻이며 판매처 검증 완료가 아니다.

상품 선택만으로 착용을 바꾸지 않고 기존 실행 버튼이 템플릿을 적용한다. 상품 변경은 기존 상품 디자인/사이즈를 새 상품에 승계하지 않는다. ID/key는 사이즈표·적용 결과와 함께 유지한다. Canvas/카메라/GLB/체형 계산 엔진은 변경하지 않는다.

실상품 API 연결·브라우저 착용·판매처 치수 검증은 아직 미완료. Mock 단위 테스트는 응답 배열, ID, 슬롯 전환, 누락/오류, 사이즈표 재사용을 확인하며 육안 검증을 대체하지 않는다.

관련 자동 테스트 18개 통과: frontend에서 `node --test src/components/fitting/productCatalog.test.js src/components/fitting/productFitting.test.js src/components/fitting/glbCamera.test.js`. 기존 실제 GLB의 UV·Morph 정점 변화 및 카메라 수학 테스트를 포함한다. 라이브 API를 호출한 통합 테스트가 아니다.
