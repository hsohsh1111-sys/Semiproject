"""Administrator and masked demo statistics using the canonical User."""
from datetime import date
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session, undefer
from app.db.models.user import User
from app.features.auth.dependencies import auth_db, require_admin

router = APIRouter()

class DemoMember(BaseModel):
    member_label: str
    masked_name: str
    masked_username: str | None
    masked_email: str | None
    masked_phone: str | None
    created_at: date

class DemoMembersResponse(BaseModel):
    total_count: int
    visible_count: int
    members: list[DemoMember]

def _mask_prefix(value: str | None, visible: int) -> str | None:
    if not value:
        return None
    shown = min(visible, len(value) - 1)
    return value[:shown] + '*' * (len(value) - shown)

def _mask_email(value: str | None) -> str | None:
    if not value:
        return None
    local, separator, domain = value.partition('@')
    return f'{_mask_prefix(local, 3)}@{domain}' if separator else _mask_prefix(value, 3)

def _mask_phone(value: str | None) -> str | None:
    if not value:
        return None
    digits = ''.join(char for char in value if char.isdigit())
    return f'{digits[:3]}-****-****' if len(digits) >= 3 else '***-****-****'

@router.get('/demo-members', response_model=DemoMembersResponse, summary='비식별 가입 현황 데모')
def demo_members(response: Response, db: Session = Depends(auth_db)):
    response.headers['Cache-Control'] = 'no-store'
    rows = db.execute(select(User.name, User.username, User.email, User.phone_number, User.created_at)
        .order_by(User.created_at.desc(), User.id.desc()).limit(100)).all()
    return DemoMembersResponse(
        total_count=db.scalar(select(func.count()).select_from(User)) or 0,
        visible_count=len(rows),
        members=[DemoMember(member_label=f'회원 {index:03d}',
                            masked_name=_mask_prefix(name, 1) or '*',
                            masked_username=_mask_prefix(username, 4),
                            masked_email=_mask_email(email),
                            masked_phone=_mask_phone(phone),
                            created_at=created_at.date())
                 for index, (name, username, email, phone, created_at) in enumerate(rows, 1)],
    )

@router.get('/public-members', dependencies=[Depends(require_admin)], summary='관리자 전용 가입 현황')
def public_members(db: Session = Depends(auth_db)):
    users = db.scalars(select(User).options(undefer(User.phone_number), undefer(User.sms_marketing_consent))
        .order_by(User.created_at.desc(), User.id.desc()).limit(100)).all()
    return {'total_count': db.scalar(select(func.count()).select_from(User)) or 0,
        'visible_count': len(users), 'members': [
            {'id': user.id, 'member_label': f'회원 #{user.id:04d}',
             'masked_name': (user.name[:1] + '*' * max(1,len(user.name)-1)),
             'masked_email': user.email[:1] + '***@' + user.email.partition('@')[2] if user.email else None,
             'masked_phone': user.phone_number[:3] + '-****-' + user.phone_number[-4:] if user.phone_number else None,
             'sms_marketing_consent': user.sms_marketing_consent,
             'created_at': user.created_at} for user in users]}
