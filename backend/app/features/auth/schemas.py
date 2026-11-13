from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, StrictBool, field_validator, model_validator
import re


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=255)
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class LoginInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: str = Field(min_length=1, max_length=255)
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator('email', mode='before')
    @classmethod
    def strip_identifier(cls, value):
        return value.strip() if isinstance(value, str) else value


class SignupInput(Credentials):
    terms_agreed: StrictBool = False
    privacy_agreed: StrictBool = False
    age_14_or_over: StrictBool = False
    email: EmailStr | None = Field(default=None, max_length=255)
    phone_number: str | None = Field(default=None, max_length=20)
    phone_collection_consent: bool = False
    sms_marketing_consent: bool = False
    username: str | None = Field(default=None, min_length=4, max_length=32, pattern=r'^[a-z0-9_.-]+$')
    verification_token: str | None = Field(default=None, max_length=2048)
    name: str = Field(min_length=1, max_length=80)
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator('phone_number', mode='before')
    @classmethod
    def normalize_phone(cls, value):
        if value is None:
            return None
        if not isinstance(value, str) or not re.fullmatch(r'[0-9 -]+', value):
            raise ValueError('휴대폰 번호는 숫자와 하이픈으로 입력해 주세요.')
        digits = value.replace('-', '').replace(' ', '')
        if not re.fullmatch(r'(?:010[0-9]{8}|01[16789][0-9]{7,8})', digits):
            raise ValueError('국내 휴대폰 번호 형식을 확인해 주세요.')
        return digits

    @model_validator(mode='after')
    def contact_requirements(self):
        if self.phone_number:
            if not self.username or not self.phone_collection_consent:
                raise ValueError('아이디와 휴대폰 번호 수집 동의가 필요합니다.')
            if not (self.terms_agreed and self.privacy_agreed and self.age_14_or_over):
                raise ValueError('만 14세 이상 확인과 필수 약관 동의가 필요합니다.')
        elif not self.email:
            raise ValueError('연락용 휴대폰 번호가 필요합니다.')
        if self.sms_marketing_consent and not self.phone_number:
            raise ValueError('이벤트 문자 수신에는 휴대폰 번호가 필요합니다.')
        return self

    @field_validator('username', mode='before')
    @classmethod
    def normalize_username(cls, value):
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str | None = None
    name: str
    created_at: datetime
    is_admin: bool = False

    @field_validator("created_at")
    @classmethod
    def utc_timestamp(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    auth_type: Literal['member', 'admin'] = 'member'


class SignupSessionResponse(TokenResponse):
    user: UserPublic


class ErrorResponse(BaseModel):
    detail: str


class EmailVerificationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: EmailStr = Field(max_length=255)

    @field_validator('email', mode='before')
    @classmethod
    def normalize(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class EmailVerificationConfirm(EmailVerificationRequest):
    challenge_id: str = Field(min_length=20, max_length=100)
    code: str = Field(pattern=r'^\d{6}$', min_length=6, max_length=6)


class AdminCredentials(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=1, max_length=80)
    password: SecretStr = Field(min_length=8, max_length=32)


class AdminPublic(BaseModel):
    id: str
    name: str
    is_admin: Literal[True] = True
