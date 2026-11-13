from pydantic import BaseModel, ConfigDict, Field


class SeasonalFavoriteInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(max_length=512)
    title: str = Field(max_length=255)
    vendor: str | None = Field(default=None, max_length=255)
    image_url: str = Field(alias="imageUrl", max_length=2048)
    price: float | None = Field(default=None, ge=0)
    currency_code: str | None = Field(default=None, alias="currencyCode", min_length=3, max_length=3)
    product_url: str | None = Field(default=None, alias="productUrl", max_length=2048)
    item_type: str = Field(alias="type", max_length=80)
    look_title: str = Field(alias="lookTitle", max_length=255)
    season: str = Field(max_length=40)
    style: str = Field(max_length=80)
    age: str = Field(max_length=40)
    gender: str = Field(max_length=20)


class SeasonalFavoriteOutput(SeasonalFavoriteInput):
    created_at: str = Field(alias="createdAt")
