"""Non-clinical selection of existing visual examples, not body reconstruction."""
from typing import Annotated, Literal
from math import log, tanh

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, model_validator
from app.features.fitting.schemas import Measurements


class ContinuousBuild(BaseModel):
    kind: Literal['inbody'] = 'inbody'
    build_lean: Annotated[float, Field(ge=0, le=1)]
    build_muscular: Annotated[float, Field(ge=0, le=1)]
    abdominal_definition: Annotated[float, Field(ge=0, le=0.25)]


class BodyPreviewInput(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    height_cm: Annotated[StrictFloat, Field(ge=100, le=230, multiple_of=0.01)]
    weight_kg: Annotated[StrictFloat, Field(ge=20, le=300, multiple_of=0.01)]
    skeletal_muscle_kg: Annotated[StrictFloat, Field(gt=0, le=300, multiple_of=0.01)]
    body_fat_pct: Annotated[StrictFloat, Field(ge=0, le=100, multiple_of=0.01)]

    @model_validator(mode='after')
    def check_mass(self):
        if self.skeletal_muscle_kg > self.weight_kg:
            raise ValueError('골격근량은 체중보다 클 수 없습니다.')
        return self


class BodyPreview(BaseModel):
    preset: Literal['slim', 'average', 'muscular']
    measurements: BodyPreviewInput
    rule_version: Literal['continuous-visual-v2'] = 'continuous-visual-v2'
    personalized_measurements: Measurements
    composition: ContinuousBuild
    approximate: Literal[True] = True
    requires_confirmation: Literal[True] = True
    reasons: list[str]
    limitations: list[str]


def suggest_body(payload: BodyPreviewInput) -> BodyPreview:
    # Product heuristics for illustrative assets only. These are NOT InBody
    # reference ranges, sex/age standards, diagnoses or size recommendations.
    bmi = payload.weight_kg / (payload.height_cm / 100) ** 2
    muscle_share = payload.skeletal_muscle_kg / payload.weight_kg
    if muscle_share >= 0.45 and payload.body_fat_pct <= 20:
        preset = 'muscular'
        reason = '시각화 규칙: 골격근량/체중 45% 이상, 체지방률 20% 이하 → 근육형 예시'
    elif bmi < 20 and payload.body_fat_pct < 30:
        preset = 'slim'
        reason = '시각화 규칙: 키·체중 지수 20 미만, 체지방률 30% 미만 → 마른 체형 예시'
    else:
        preset = 'average'
        reason = '다른 시각화 규칙에 해당하지 않아 보통 체형 예시를 제안합니다.'
    # Artist-defined reference; UI visual controls, NOT calibrated anthropometry.
    height_ratio = payload.height_cm / 175
    size = tanh(2 * log(payload.weight_kg / (70 * height_ratio ** 2)))
    muscle = tanh(1.5 * (payload.skeletal_muscle_kg / (30 * height_ratio ** 2) - 1))
    fat = tanh((payload.body_fat_pct - 20) / 20)
    visual = Measurements(
        height_cm=payload.height_cm, weight_kg=payload.weight_kg,
        shoulder_width_cm=42 + 6 * muscle + 2 * size,
        chest_circumference_cm=95 + 12 * muscle + 10 * size + 6 * fat,
        waist_circumference_cm=max(45, 80 + 18 * size + 16 * fat - 3 * muscle),
        abdomen_protrusion_cm=max(0, 4 * fat + 3 * size - 0.5 * max(0, muscle)),
        pelvis_width_cm=30 + 1.5 * size + fat,
        hip_circumference_cm=95 + 12 * size + 10 * fat + 3 * muscle,
        thigh_circumference_cm=50 + 8 * muscle + 8 * size + 4 * fat,
    )
    lean = 0.7 * max(0, -size) * (1 - 0.5 * max(0, fat))
    muscular = 0.8 * max(0, muscle) * (1 - 0.7 * max(0, fat))
    scale = max(1, lean + muscular)
    composition = ContinuousBuild(build_lean=lean / scale, build_muscular=muscular / scale,
                                  abdominal_definition=0.25 * max(0, muscle) * max(0, -fat))
    limitations = [
        '인바디 수치를 바탕으로 생성한 추정 체형으로, 실제 체형과 다를 수 있습니다. 세부 치수를 조절해 보정해 주세요.',
        '부위별 수치는 시각 조절용 계산값이며 실제 어깨·가슴·허리·골반을 측정한 결과가 아닙니다.',
        '계산 계수는 시각화용 개발 규칙으로 인체 실측 데이터에 보정되지 않았습니다.',
        '성별·나이별 기준을 적용하지 않으며 실제 복근·지방 분포·착용 형태를 복원하지 않습니다.',
    ]
    if payload.body_fat_pct >= 30:
        limitations.append('기존 GLB의 지방 분포 표현에는 한계가 있어 높은 체지방 체형을 정확히 재현하지 못합니다.')
    return BodyPreview(preset=preset, measurements=payload, personalized_measurements=visual,
                       composition=composition,
                       reasons=['확인한 인바디 수치를 연속적인 부위·근육 변형값으로 계산했습니다. 기존 세 체형 중 하나를 적용하지 않습니다.'],
                       limitations=limitations)
