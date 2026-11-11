from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StringConstraints

Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Color = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


class ProfileWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    height_cm: Annotated[StrictFloat, Field(ge=100, le=230, multiple_of=0.01)] | None = None
    weight_kg: Annotated[StrictFloat, Field(ge=20, le=300, multiple_of=0.01)] | None = None
    body_shape: Label | None = None
    preferred_fit: Label | None = None
    preferred_style: Label | None = None
    personal_color: Label | None = None
    preferred_colors: list[Color] | None = Field(default=None, max_length=12)


class ProfilePublic(ProfileWrite):
    model_config = ConfigDict(from_attributes=True, extra="forbid", allow_inf_nan=False)
    id: int
    user_id: int
