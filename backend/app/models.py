from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.db.models.user import User


class SeasonalFavorite(Base):
    __tablename__ = "seasonal_favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "favorite_key", name="uq_seasonal_favorite_user_key"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    favorite_key: Mapped[str] = mapped_column(String(512))
    title: Mapped[str] = mapped_column(String(255))
    vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    image_url: Mapped[str] = mapped_column(String(2048))
    price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency_code: Mapped[str | None] = mapped_column(String(3), nullable=True)
    product_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    item_type: Mapped[str] = mapped_column(String(80))
    look_title: Mapped[str] = mapped_column(String(255))
    season: Mapped[str] = mapped_column(String(40))
    style: Mapped[str] = mapped_column(String(80))
    age: Mapped[str] = mapped_column(String(40))
    gender: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())
