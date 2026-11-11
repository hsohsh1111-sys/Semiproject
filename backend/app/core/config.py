from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator
from pathlib import Path
from urllib.parse import quote_plus


class Settings(BaseSettings):
    app_env: str = "development"
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    database_url: str = ""
    tidb_host: str = Field(default='', validation_alias='TIDB_HOST')
    tidb_port: int = Field(default=4000, validation_alias='TIDB_PORT', ge=1, le=65535)
    tidb_username: str = Field(default='', validation_alias='TIDB_USERNAME')
    tidb_password: str = Field(default='', validation_alias='TIDB_PASSWORD')
    tidb_database: str = Field(default='', validation_alias='TIDB_DATABASE')
    secret_key: str = "development-only-change-me"
    access_token_expire_minutes: int = Field(default=30, ge=1, le=1440)
    collection_interval_hours: int = 12
    tesseract_cmd: str = ""
    tesseract_data_dir: str = ""

    model_config = SettingsConfigDict(env_file=(
        str(Path(__file__).resolve().parents[3] / '.env'),
        str(Path(__file__).resolve().parents[2] / '.env'),
    ), extra="ignore", case_sensitive=False, populate_by_name=True)

    @model_validator(mode='after')
    def build_tidb_url(self):
        if 'GATEWAY_HOST' in self.database_url:
            self.database_url = ''
        if not self.database_url and all((self.tidb_host,self.tidb_username,self.tidb_password,self.tidb_database)):
            self.database_url = (
                f'mysql+pymysql://{quote_plus(self.tidb_username)}:{quote_plus(self.tidb_password)}'
                f'@{self.tidb_host}:{self.tidb_port}/{self.tidb_database}'
                '?ssl_verify_cert=true&ssl_verify_identity=true'
            )
        return self

    @property
    def auth_configured(self) -> bool:
        return len(self.secret_key.encode("utf-8")) >= 32 and self.secret_key not in {
            "development-only-change-me", "replace-with-a-long-random-value"
        }


settings = Settings()
