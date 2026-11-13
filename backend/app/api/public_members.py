"""Administrator-only member statistics using the canonical User."""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.orm import Session, undefer
from app.db.models.user import User
from app.features.auth.dependencies import auth_db, require_admin

router = APIRouter()

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
