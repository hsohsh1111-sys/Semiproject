from datetime import datetime, timezone
from typing import Annotated
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictFloat, field_validator, model_validator


class RecordWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    height_cm: Annotated[StrictFloat, Field(ge=100, le=230, multiple_of=0.01)]
    weight_kg: Annotated[StrictFloat, Field(ge=20, le=300, multiple_of=0.01)]
    skeletal_muscle_kg: Annotated[StrictFloat, Field(gt=0, le=300, multiple_of=0.01)]
    body_fat_pct: Annotated[StrictFloat, Field(ge=0, le=100, multiple_of=0.01)]
    measured_at: AwareDatetime = Field(description="측정 시각 ISO 8601. 시간대 필수, 예: 2026-10-20T09:00:00+09:00")

    @field_validator("measured_at", mode="before")
    @classmethod
    def require_datetime_text(cls, value):
        if not isinstance(value, (str, datetime)):
            raise ValueError("ISO 8601 측정 시각이 필요합니다.")
        return value

    @field_validator("measured_at")
    @classmethod
    def check_date(cls, value):
        value = value.astimezone(timezone.utc)
        if value.year < 1000 or value > datetime.now(timezone.utc):
            raise ValueError("측정 시각은 1000년 이후이며 미래일 수 없습니다.")
        return value

    @model_validator(mode="after")
    def check_muscle(self):
        if self.skeletal_muscle_kg > self.weight_kg:
            raise ValueError("골격근량은 체중보다 클 수 없습니다.")
        return self


class RecordPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    height_cm: float
    weight_kg: float
    skeletal_muscle_kg: float
    body_fat_pct: float
    measured_at: datetime
    created_at: datetime

    @field_validator("measured_at", "created_at")
    @classmethod
    def utc_dates(cls, value):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class ExtractedValues(BaseModel):
    height_cm: float | None = None
    weight_kg: float | None = None
    skeletal_muscle_kg: float | None = None
    body_fat_pct: float | None = None
    measured_at: None = Field(default=None, description="자동 추정하지 않습니다. 사용자가 시간대와 함께 입력하세요.")


class ExtractionPreview(BaseModel):
    method: Literal["pdf_text", "pdf_ocr", "image_ocr"]
    values: ExtractedValues
    requires_confirmation: Literal[True] = True
    warnings: list[str]
