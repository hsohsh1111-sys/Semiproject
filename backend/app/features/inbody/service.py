from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.inbody_record import InbodyRecord
from app.features.inbody.schemas import RecordWrite


def create_record(db: Session, user_id: int, payload: RecordWrite):
    values = payload.model_dump()
    values["measured_at"] = payload.measured_at.replace(tzinfo=None)  # validated UTC
    record = InbodyRecord(user_id=user_id, **values)
    db.add(record)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(record)
    return record


def list_records(db: Session, user_id: int, limit: int, offset: int):
    return db.scalars(select(InbodyRecord).where(InbodyRecord.user_id == user_id)
                      .order_by(InbodyRecord.measured_at.desc(), InbodyRecord.id.desc())
                      .limit(limit).offset(offset)).all()


def get_record(db: Session, user_id: int, record_id: int):
    record = db.scalar(select(InbodyRecord).where(
        InbodyRecord.id == record_id, InbodyRecord.user_id == user_id))
    if record is None:
        raise HTTPException(status_code=404, detail="인바디 기록을 찾을 수 없습니다.")
    return record
