from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class SignupInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("이름을 입력해 주세요.")
        return value


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOutput(BaseModel):
    id: int
    email: str
    name: str


class AuthOutput(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOutput


class PublicMember(BaseModel):
    id: int
    member_label: str
    masked_name: str
    masked_email: str
    created_at: datetime


class PublicMemberPage(BaseModel):
    total_count: int
    visible_count: int
    members: list[PublicMember]
