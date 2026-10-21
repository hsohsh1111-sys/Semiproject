from pydantic import BaseModel, Field


class StyleProfileInput(BaseModel):
    style: str = "미니멀"
    favorite_color: str = "#e8c6b7"
    fit_preference: str = "편안하고 여유롭게"
    height_cm: int | None = Field(default=None, ge=100, le=230)
    body_shape: str | None = None
