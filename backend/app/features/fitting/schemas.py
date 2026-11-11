from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StrictFloat


class Measurements(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    height_cm: Annotated[StrictFloat, Field(ge=100, le=230)]
    weight_kg: Annotated[StrictFloat, Field(ge=20, le=300)]
    shoulder_width_cm: Annotated[StrictFloat, Field(ge=25, le=65)]
    waist_circumference_cm: Annotated[StrictFloat, Field(ge=45, le=180)]
    chest_circumference_cm: Annotated[StrictFloat, Field(ge=55, le=180)] = 95
    abdomen_protrusion_cm: Annotated[StrictFloat, Field(ge=0, le=20, description="복부 앞쪽 추가 돌출량. 둘레가 아닌 시각 조절값")] = 0
    pelvis_width_cm: Annotated[StrictFloat, Field(ge=20, le=60)] = 30
    hip_circumference_cm: Annotated[StrictFloat, Field(ge=55, le=180)] = 95
    thigh_circumference_cm: Annotated[StrictFloat, Field(ge=25, le=100)] = 50


class BodyParameters(BaseModel):
    height_m: float
    shoulder_width_m: float
    waist_radius_m: float
    chest_radius_m: float
    abdomen_protrusion_m: float
    pelvis_width_m: float
    hip_radius_m: float
    thigh_radius_m: float


class FittingPreviewRequest(Measurements):
    garment_fit: Literal["slim", "regular", "oversized"] = "regular"
    fixed_garment_parameters: BodyParameters | None = None


class GarmentParameters(BaseModel):
    fit: Literal["slim", "regular", "oversized"]
    fixed_size: bool
    shoulder_half_width_m: float
    chest_radius_m: float
    waist_radius_m: float
    abdomen_front_depth_m: float
    pelvis_half_width_m: float
    hip_radius_m: float
    thigh_radius_m: float
    hem_half_width_m: float
    chest_ease_cm: float
    waist_ease_cm: float
    abdomen_front_clearance_m: float
    hem_clearance_m: float


class Preview(BaseModel):
    measurements: Measurements
    parameters: BodyParameters
    garment_parameters: GarmentParameters
    approximate: Literal[True] = True
    notice: str = "허리 단면은 원으로 근사합니다. 체중으로 부위 치수를 추정하지 않으며 실제 체형·의류 핏을 보장하지 않습니다."


class Defaults(BaseModel):
    height_cm: float | None = None
    weight_kg: float | None = None
    source: Literal["inbody", "profile", "none"]
