"""Team admin-demo adapter using the canonical User, without duplicate tables."""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db.models.user import User
from app.features.auth.dependencies import auth_db, auth_ready

router = APIRouter()

@router.get('/public-members', dependencies=[Depends(auth_ready)])
def public_members(db: Session = Depends(auth_db)):
    users = db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc()).limit(100)).all()
    return {'total_count': db.scalar(select(func.count()).select_from(User)) or 0,
        'visible_count': len(users), 'members': [
            {'id': user.id, 'member_label': f'회원 #{user.id:04d}',
             'masked_name': (user.name[:1] + '*' * max(1,len(user.name)-1)),
             'masked_email': user.email[:1] + '***@' + user.email.partition('@')[2],
             'created_at': user.created_at} for user in users]}
