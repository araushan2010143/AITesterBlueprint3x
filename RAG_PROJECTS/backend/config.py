from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    groq_api_key: str = ""
    nomic_api_key: str = ""

    data_dir: str = "../data/data"
    chroma_dir: str = "../chroma"
    collection_name: str = "vwo_prd"

    chunk_size: int = 800
    chunk_overlap: int = 150
    top_k: int = 4

    groq_model: str = "llama-3.3-70b-versatile"
    embedding_model: str = "nomic-embed-text-v1.5"

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir).resolve()

    @property
    def chroma_path(self) -> Path:
        return Path(self.chroma_dir).resolve()


settings = Settings()
