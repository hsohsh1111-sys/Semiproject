from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import BigInteger, ForeignKey, Integer, JSON, Numeric, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserProfile(Base):
    """Team primary key and style columns; API id is an alias of user_id."""
    __tablename__ = "user_profiles"

    user_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), ForeignKey("users.id"), primary_key=True
    )

    @property
    def id(self) -> int:
        """Compatibility response identifier; no independent database id column."""
        return self.user_id
    legacy_height_cm: Mapped[int | None] = mapped_column("height_cm", SmallInteger)
    height_cm_precise: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))

    @property
    def height_cm(self) -> Decimal | None:
        # A legacy client may update the integer column without the extension.
        precise = self.height_cm_precise
        legacy = self.legacy_height_cm
        if precise is not None and legacy is not None:
            if int(precise.quantize(Decimal("1"), rounding=ROUND_HALF_UP)) == legacy:
                return precise
        return Decimal(legacy) if legacy is not None else None

    @height_cm.setter
    def height_cm(self, value: Decimal | float | None) -> None:
        precise = Decimal(str(value)) if value is not None else None
        self.height_cm_precise = precise
        self.legacy_height_cm = (
            int(precise.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            if precise is not None else None
        )

    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    body_shape: Mapped[str | None] = mapped_column(String(80))
    preferred_fit: Mapped[str | None] = mapped_column("fit_preference", String(80))
    preferred_style: Mapped[str | None] = mapped_column("style_preference", String(80))
    personal_color: Mapped[str | None] = mapped_column(String(80))
    preferred_colors: Mapped[list[str] | None] = mapped_column(JSON(none_as_null=True))
