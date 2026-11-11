from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=255)
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class SignupInput(Credentials):
    name: str = Field(min_length=1, max_length=80)
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def utc_timestamp(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class ErrorResponse(BaseModel):
    detail: str
