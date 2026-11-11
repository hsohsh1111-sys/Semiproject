# ONFIT 후드 집업 자산 출처

- 자산명: `elvs_hooded_sweat_jacket1` (내부 이름 `ladieshoodiedown1`)
- 제작자: **Elvaerwyn**
- 원본: https://www.makehumancommunity.org/node/1450
- 공식 팩: https://www.makehumancommunity.org/assets/assetpacks/shirts02.html
- 다운로드: https://files2.makehumancommunity.org/asset_packs/shirts02/shirts02_ccby.zip
- 라이선스: **CC BY**. 실제 MHCLO 헤더는 `# license CC_by`이다. 팩 목록도 CC-BY로 표기한다. 버전 번호가 명시되지 않았으므로 특정 버전으로 재표기하지 않는다. CC0 자산으로 취급하지 않는다.
- 이용 시 제작자·원본 URL·라이선스 표기와 수정 사실을 유지한다. 모델을 별도 배포할 때도 `public/models/ONFIT_HoodedJacket_LICENSE.txt`를 함께 제공한다.
- 확보·변환일: 2026-11-03
- 팩 SHA256: `d711ca9f73212de855257ac08422e1e0ccb802e5231315c2a360d0fcfea5033e`

## ONFIT 수정 사항

MPFB의 실제 MHCLO 의류를 기존 Human 기본 체형에 맞춰 적용했다. 후드·긴 소매·몸통을 그대로 사용하며 풀오버 후드티로 재명명하지 않았다. 신체·청바지 접촉 부위만 최대 22mm 국소 보정했다. UV·색상 텍스처·노멀 텍스처를 보존하고 원단용 Roughness 0.8, Metallic 0, 노멀 강도 0.6을 적용했다. 기존 자산은 변경하지 않았다.

출력: `assets/blender/ONFIT_HoodedJacket_v1.blend`, `frontend/public/models/ONFIT_HoodedJacket_v1.glb`.
Morph Target은 없으며 체형 변화에 따라 의류가 변형되지 않는다. 기존 패딩과의 교차가 커 동시 착용을 제한한다.

## BodyMorph 파생 버전 (2026-11-03)

- 새 파일: `assets/blender/ONFIT_HoodedJacket_BodyMorph_v1.blend`, `frontend/public/models/ONFIT_HoodedJacket_BodyMorph_v1.glb`.
- 원본은 그대로 보존한다. React의 기존 후드 집업 선택은 새 BodyMorph 버전을 사용한다.
- 추가한 실제 Shape Key: `garment_shoulder_width`, `garment_chest_volume`, `garment_waist_width`, `garment_abdomen_front`, `garment_pelvis_width`. 기본값은 모두 0이다.
- 기존 신체 Morph Target의 이동 벡터를 48개 주변 정점의 공간 가중 평균으로 전달한다. 신체 치수 계산식을 새로 만들지 않는다. 복부는 몸통에 제한된 부드러운 전방 변형을 사용한다. 후드 상단 보호 영역은 모든 Shape Key에서 이동량 0이다.
- 전 범위에서 면이 뒤집히지 않는 보수적 자산 강도 0.6을 사용한다. 슬라이더는 기존 공통 매핑을 사용하며, 어깨·가슴·허리·골반 -1..1, 복부 0..0.8이다. 정확한 cm 재현이나 천 물리 시뮬레이션을 의미하지 않는다.
- 최대 Shape Key 정점 이동량: 어깨 약 9.0mm, 가슴 8.1mm, 허리 5.7mm, 복부 54mm, 골반 13.4mm. 복부 슬라이더 최대에서 실제 정점 이동은 최대 약 43.2mm이다.
- 기본 POSITION·삼각형 인덱스·UV·재질·텍스처 버퍼를 보존하며 지퍼를 닫거나 정점 연결을 바꾸지 않았다. 새 법선 Morph Target만 함께 추가했다.
- 체형 45개 조합 검사에서 면 뒤집힘은 0이다. 기본 교차(신체 598쌍/바지 36쌍/자기 311쌍)는 남아 있다. 전체 검사에서 신체 최대 915쌍, 바지 최대 381쌍, 자기 교차 총수 최대 316쌍이며 기본과 다른 자기 교차 쌍은 최대 19개다. 교차를 해결 완료한 모델이 아니며 특히 극단 조합의 후드 접힘·목·어깨·밑단은 추가 수동 보정이 필요하다.
- top 슬롯을 대체하므로 반팔/긴팔과 중복 착용하지 않는다. 패딩과의 동시 착용 제한도 유지한다. 청바지와는 동시 표시하되 위 교차 한계를 안내한다.
- 비교 렌더 32장: `assets/blender/previews/hooded_jacket_bodymorph_v1/`. 검사 JSON: `frontend/public/models/ONFIT_HoodedJacket_BodyMorph_v1.json`.
- 관련 테스트 35개 통과. 자동 테스트는 실제 Three.js Morph 정점 변화·음수 가중치·독립 조절·복원·카메라 상태 수학·원본 보존을 확인하며 브라우저 육안 검증을 대체하지 않는다. 브라우저 자동화는 현재 URL 확인 실패로 중단되어 육안 검증은 미완료다.

## 검증 범위

Blender GLB 재로딩과 기본 체형 정면·측면·후면 비교 렌더를 수행했다. 결과는 `assets/blender/hood_final.validation.json`, 이미지는 `assets/blender/previews/hood_final/`에 있다. `long_`으로 시작하는 이미지 파일명은 기존 비교 렌더 스크립트를 재사용한 결과이며 실제 대상은 후드 집업이다.

초기/보정 후 삼각형 교차 쌍: 신체 **873→598**, 청바지 **202→36**. 접힘·UV 이음부를 제외한 비인접 자기 교차 추정은 **285→311**로 증가했으며 완전히 해결되지 않았다. 이 수치는 실제 관통 깊이나 시각적 심각도와 동일하지 않다. 후드 접힘과 목·어깨·밑단은 추가 수동 검토가 필요하다. 패딩과는 **4433**쌍이 교차하여 지원하지 않는다. 퇴화 삼각형은 0이다. 브라우저 육안 검증은 미완료다.
