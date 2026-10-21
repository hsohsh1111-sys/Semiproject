from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    frontend_origins: str = "http://localhost:5173"
    database_url: str = ""
    secret_key: str = "development-only-change-me"
    collection_interval_hours: int = 12

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)


settings = Settings()
