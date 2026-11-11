# ONFIT 볼캡 출처 및 검증 (2026-11-03)

- 자산: `toigo_maga_hat` (내부 이름 `MAGA-Hat`)
- 제작자: 공식 팩 목록은 **MargaretToigo**, 실제 MHCLO 헤더는 **MRT**로 표기한다.
- 원본 팩/라이선스: https://static.makehumancommunity.org/assets/assetpacks/hats01.html — **CC0**. 실제 MHCLO 헤더의 `# license CC0`도 확인했다.
- 다운로드: https://files2.makehumancommunity.org/asset_packs/hats01/hats01_cc0.zip
- ZIP SHA256: `97b70d7bd90e74ee87a49faeb7c4a1b2762b311902974db575851daaae05b50e`
- MPFB 2.0.18의 ZIP 검사·설치 함수로 설치했다. 실행 파일/스크립트가 없는 데이터 팩인지 검사했고 기존 자산을 덮어쓰지 않았다.

## 파생 파일 및 처리

- `assets/blender/ONFIT_Cap_v1.blend`
- `frontend/public/models/ONFIT_Cap_v1.glb`
- `assets/blender/ONFIT_Cap_v1.source.json`
- `assets/blender/ONFIT_Cap_v1.validation.json`
- 비교 렌더 12장: `assets/blender/previews/cap_v1/`

MPFB로 기존 Human v3 기본 체형에 피팅하고 모자 메시만 선택하여 GLB로 내보냈다. 인체·머리카락·Helper를 GLB에 포함하지 않았다. UV·재질·원본 텍스처를 유지했다. 빨간색과 “MAKE AMERICA GREAT AGAIN” 문구도 원본 그대로 남아 있다. 색상 변경·로고 대체·머리 크기 및 체형 Morph Target은 구현하지 않았다.

React의 기존 `GarmentGlb` 로더를 headwear 슬롯에 재사용한다. 인체·의류와 같은 좌표계 및 공통 배치 그룹을 사용하며, 모자에는 체형 Morph 가중치를 전달하지 않는다. 착용·벗기와 다른 의류 전환은 Canvas/카메라를 재생성하지 않는다.

## 확인한 결과와 한계

- GLB 재로딩: 모자 메시 1개, 정점 3,167개, 삼각형 6,004개, UV 1개, Morph Target 0개.
- 머리 영역에 배치됐고 전방 챙이 실제 머리 앞면보다 돌출된다. 모델 자체를 원점으로 재중앙화하지 않았다.
- 기본 체형에서 인체·반팔·바지·패딩·내려진 후드와의 삼각형 교차 0쌍. 머리 근처 정점의 최근접 표면 법선 기반 최소 간격은 약 2.34mm이다. 이 간격은 완전한 천 충돌 계산이 아니다.
- 현재 후드 집업의 내려진 후드는 16개 상체 극단 조합에서도 모자와의 교차 0쌍. 이를 후드를 올린 상태나 다른 후드 모델의 호환성으로 일반화하지 않는다. 후드 집업+패딩의 기존 동시 착용 제한은 유지한다.
- 현재 모자 GLB 자체의 비인접 자기 교차 후보 **346쌍**이 검출됐다. 육안으로 심각한 파손을 확인하지는 않았지만 내부 면/봉제선의 모든 교차를 수동 판정하거나 수리하지 않았다. 퇴화 삼각형은 0이다.
- Blender 전면·측면·후면 및 머리 확대 렌더를 확인했다. 브라우저 WebGL 화면의 육안 검증은 미완료다.
- 관련 자동 테스트 **25개 통과**. 실제 GLTFLoader/정점·UV·재질 구조, 독립 착용, 정적 모자 유지, 재로딩, 기존 카메라 수학 및 후드 변형 회귀를 검사했다. Node 테스트에서는 이미지 디코딩을 대체하므로 브라우저 텍스처 표시를 검증한 것으로 보지 않는다.

브라우저 확인: `http://127.0.0.1:5173/#/fitting` → **모자 · 기본 볼캡 → 기본 볼캡 착용**. 바지·상의/아우터 또는 내려진 후드 조합에서 챙·후면·카메라 유지 상태를 확인한다.
