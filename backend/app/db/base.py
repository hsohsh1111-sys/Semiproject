from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Single metadata registry shared by all ONFIT models."""
