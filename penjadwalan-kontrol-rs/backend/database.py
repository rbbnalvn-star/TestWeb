"""
Database Configuration
Konfigurasi koneksi ke database SQLite (dev) / PostgreSQL (production).
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os

# --- Database URL ---
# Untuk pengembangan lokal, gunakan SQLite.
# Saat deploy ke server RS, ubah baris ini menjadi:
# SQLALCHEMY_DATABASE_URL = "postgresql://user:password@localhost/db_penjadwalan_rs"
if os.environ.get("VERCEL") == "1":
    SQLALCHEMY_DATABASE_URL = "sqlite:////tmp/penjadwalan_rs.db"
else:
    SQLALCHEMY_DATABASE_URL = "sqlite:///./penjadwalan_rs.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}  # Hanya untuk SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """
    Dependency untuk mendapatkan sesi database.
    Digunakan di setiap endpoint FastAPI.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
