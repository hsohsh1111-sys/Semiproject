from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, read_access_token, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.auth import AuthOutput, LoginInput, PublicMember, PublicMemberPage, SignupInput, UserOutput

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def user_output(user: User) -> UserOutput:
    return UserOutput(id=user.id, email=user.email, name=user.display_name)


@router.post("/signup", response_model=AuthOutput, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupInput, db: Session = Depends(get_db)) -> AuthOutput:
    email = str(payload.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다.")
    user = User(email=email, display_name=payload.name, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다.") from None
    db.refresh(user)
    return AuthOutput(access_token=create_access_token(user.id), user=user_output(user))


@router.post("/login", response_model=AuthOutput)
def login(payload: LoginInput, db: Session = Depends(get_db)) -> AuthOutput:
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.", headers={"WWW-Authenticate": "Bearer"})
    return AuthOutput(access_token=create_access_token(user.id), user=user_output(user))


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user_id = read_access_token(token)
    user = db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.", headers={"WWW-Authenticate": "Bearer"})
    return user


@router.get("/me", response_model=UserOutput)
def current_user(user: User = Depends(get_current_user)) -> UserOutput:
    return user_output(user)


@router.get("/public-members", response_model=PublicMemberPage)
def public_members(db: Session = Depends(get_db)) -> PublicMemberPage:
    total_count = db.scalar(select(func.count()).select_from(User)) or 0
    users = db.scalars(
        select(User).order_by(User.created_at.desc(), User.id.desc()).limit(100)
    ).all()
    members = [
        PublicMember(
            id=user.id,
            member_label=f"회원 #{user.id:04d}",
            masked_name=mask_name(user.display_name),
            masked_email=mask_email(user.email),
            created_at=user.created_at,
        )
        for user in users
    ]
    return PublicMemberPage(
        total_count=total_count,
        visible_count=len(members),
        members=members,
    )


def mask_email(email: str) -> str:
    local_part, separator, domain = email.partition("@")
    if not separator:
        return "***"
    return f"{local_part[:1]}***@{domain}"


def mask_name(name: str) -> str:
    name = name.strip()
    if not name:
        return "***"
    if len(name) == 1:
        return f"{name}*"
    return f"{name[0]}{'*' * (len(name) - 1)}"


@router.get("/status")
def auth_status(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "message": "인증 및 데이터베이스 연결이 준비되었습니다."}
