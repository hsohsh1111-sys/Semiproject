from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, JSON, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    """Team database column names; public API attributes stay compatible."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True, deferred=True)
    sms_marketing_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text('0'), deferred=True)
    sms_marketing_consented_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True, deferred=True)
    signup_consent: Mapped[dict | None] = mapped_column(JSON, nullable=True, deferred=True)
    # Deferred so existing member reads keep working before the additive migration.
    username: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True, deferred=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column("display_name", String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), nullable=False
    )
