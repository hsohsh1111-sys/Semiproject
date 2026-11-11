from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InbodyRecord(Base):
    """Confirmed ERD names; storage types await shared TiDB DDL review."""
    __tablename__ = "inbody_records"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    height_cm: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    skeletal_muscle_kg: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    body_fat_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), nullable=False
    )
