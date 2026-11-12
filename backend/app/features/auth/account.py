from typing import Literal
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy import MetaData, Table, delete, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.security import verify_password
from app.db.models.user import User


class WithdrawalInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    password: SecretStr = Field(min_length=1, max_length=128)
    confirmation: Literal['회원탈퇴']


def account_details(user):
    return {'id':user.id,'username':user.username,'name':user.name,'email':user.email,
            'phone_number':user.phone_number,'created_at':user.created_at,
            'sms_marketing_consent':user.sms_marketing_consent}


def withdraw(db: Session, user: User, payload: WithdrawalInput):
    if not verify_password(payload.password.get_secret_value(), user.password_hash):
        raise HTTPException(401, '비밀번호를 확인해 주세요.')
    try:
        connection=db.connection()
        names=set(inspect(connection).get_table_names())
        metadata=MetaData()
        def table(name):
            return Table(name,metadata,autoload_with=connection,resolve_fks=False)
        if {'outfits','outfit_items'} <= names:
            outfits=table('outfits'); items=table('outfit_items')
            db.execute(delete(items).where(items.c.outfit_id.in_(select(outfits.c.id).where(outfits.c.user_id==user.id))))
        for name in ['seasonal_favorites','wardrobe_items','inbody_records','user_profiles','outfits']:
            if name in names:
                owned=metadata.tables.get(name)
                if owned is None:
                    owned=table(name)
                db.execute(delete(owned).where(owned.c.user_id==user.id))
        db.delete(user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, '연결된 정보 때문에 탈퇴를 완료하지 못했습니다. 계정은 유지됩니다. 관리자에게 문의해 주세요.') from None
    except Exception:
        db.rollback()
        raise
