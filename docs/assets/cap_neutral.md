# ONFIT 무문 볼캡 및 색상 선택 (2026-11-03)

## 출처 보존

원본은 [기존 볼캡 출처 문서](./cap.md)의 `toigo_maga_hat` (MargaretToigo / MRT, CC0)이다. 기존 `ONFIT_Cap_v1.blend`와 `.glb`, 원본 텍스처 및 출처 문서는 보존한다. 공식 팩: https://static.makehumancommunity.org/assets/assetpacks/hats01.html

## 생성 파일

- `assets/blender/ONFIT_Cap_Neutral_v1.blend`
- `frontend/public/models/ONFIT_Cap_Neutral_v1.glb`
- `assets/blender/textures/ONFIT_Cap_Neutral_Albedo.png`
- `assets/blender/ONFIT_Cap_Neutral_v1.source.json`
- `assets/blender/ONFIT_Cap_Neutral_v1.validation.json`
- 비교 렌더 24장: `assets/blender/previews/cap_neutral_v1/`

## 문구 제거 방식

원본은 메시 1개·재질 1개·인쇄된 기본색 이미지 1장으로 구성된다. 문구는 별도 메시가 아니므로 정점이나 면을 제거하지 않았다. 문구 없는 새 4×4 불투명 흰색 상수 알베도 PNG를 제작하고, PBR 기본색을 검은색 `#16181D`로 설정했다. 기존 인쇄 이미지의 바이트는 새 GLB에서 제거했으며, 원본 GLB에는 그대로 보존했다. 이 작업은 사진의 AI 인페인팅이 아닌 새 무문 재질 제작이다.

POSITION·NORMAL·UV·삼각형 인덱스·노드 변환·Bounding Box가 원본과 정확히 동일하다. 따라서 챙·크기·기본 착용 위치와 원래 뒤쪽 조절 구멍은 유지된다. 로고 제거로 새 구멍이 생기지 않는다. 재질은 불투명, Roughness 0.88, Metallic 0이며 발광 재질을 사용하지 않는다. 원본 인쇄 이미지에 함께 들어 있던 미세한 색상/직물 디테일은 새 단색 재질에 포함되지 않는다.

## React 연결

`NEUTRAL_CAP_GLB`를 기존 headwear 슬롯에 연결했다. `capAppearance.js`가 모자 재질을 복제하고 네 색상을 적용한다.

| 색상 | 값 |
| --- | --- |
| 블랙 (기본) | `#16181D` |
| 네이비 | `#1B2944` |
| 베이지 | `#C8B89D` |
| 차콜 | `#373B43` |

티셔츠의 패턴 보존 셰이더와 별개로 일반 PBR `material.color`를 사용한다. 공유 텍스처나 인체·다른 의류의 원본 재질을 변경하지 않는다. 색상은 별도 React 상태로 관리하며 변경할 때 GLB를 다시 요청하거나 Canvas/OrbitControls를 재마운트하지 않는다. 벗었다 다시 착용해도 선택한 색상을 적용한다. 모자 체형 변형은 추가하지 않았다.

## 검증과 한계

- 관련 테스트 26개 통과: 원본 기하·법선·UV·정렬 보존, 새 PNG 모든 픽셀의 무문·불투명성, 원본 이미지 제거, 네 색상의 정확한 sRGB 값, 재질 격리, 재로딩, 기존 티셔츠 색상·카메라 회귀.
- 프론트엔드 빌드 성공. 기존 큰 번들 경고는 남아 있다.
- Blender 렌더에서 기본 무문 검은색, 베이지 전면, 네이비 측면, 차콜 후면 등 실제 파일을 확인했다. 렌더의 색상 비교는 임시 PBR 색상 인자를 사용하며 원본/출력 GLB를 수정하지 않는다.
- 기본 인체·반팔·바지·패딩·내려진 후드와의 삼각형 교차는 모두 0쌍이다. 내려진 후드 16개 극단 조합도 교차 0쌍이다.
- 기존 모자 자체의 자기 교차 후보 346쌍은 기하를 보존하여 그대로 남는다. 이 작업에서 교차를 수리한 것은 아니다. 퇴화 삼각형은 0이다.
- 브라우저 WebGL 화면에서 직접 색상·회전·줌을 조작한 육안 검증은 미완료다. 자동 테스트와 Blender 렌더 결과를 브라우저 확인으로 표현하지 않는다.

확인 주소: `http://127.0.0.1:5173/#/fitting` → **기본 볼캡 착용** → **볼캡 색상**. 다른 의류를 입힌 상태에서 네 색상과 정면·측면·후면, 자유 회전·줌을 확인한다.
