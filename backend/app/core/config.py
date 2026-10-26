from urllib.parse import quote_plus

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    frontend_origins: str = "http://localhost:5173"
    database_url: str = ""
    host: str = Field(default="", validation_alias="TIDB_HOST")
    port: int = Field(default=4000, validation_alias="TIDB_PORT")
    username: str = Field(default="", validation_alias="TIDB_USERNAME")
    password: str = Field(default="", validation_alias="TIDB_PASSWORD")
    database: str = Field(default="", validation_alias="TIDB_DATABASE")
    secret_key: str = "development-only-change-me"
    collection_interval_hours: int = 12

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore", case_sensitive=False)

    @model_validator(mode="after")
    def build_tidb_url(self):
        if self.database_url and "GATEWAY_HOST" in self.database_url:
            self.database_url = ""
        if not self.database_url and self.host and self.username and self.password and self.database:
            user = quote_plus(self.username)
            password = quote_plus(self.password)
            self.database_url = (
                f"mysql+pymysql://{user}:{password}@{self.host}:{self.port}/{self.database}"
                "?ssl_verify_cert=true&ssl_verify_identity=true"
            )
        return self


settings = Settings()
