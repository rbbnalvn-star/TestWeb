"""
Database Configuration
Konfigurasi koneksi ke database SQLite (dev) / PostgreSQL (production).
"""

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os

# --- Database URL ---
# DATABASE_URL tetap mendukung PostgreSQL di production. Untuk SQLite, gunakan
# SQLITE_DATABASE_URL bila perlu menentukan lokasi database secara eksplisit.
SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SQLITE_DATABASE_URL")

if SQLALCHEMY_DATABASE_URL:
    # Neon/Supabase menggunakan prefix 'postgres://' yang perlu disesuaikan ke 'postgresql://' untuk SQLAlchemy 2.0+
    if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)
else:
    if os.environ.get("VERCEL") == "1":
        SQLALCHEMY_DATABASE_URL = "sqlite:////tmp/penjadwalan_rs.db"
    else:
        # Path absolut mencegah database berubah lokasi saat server dijalankan
        # dari folder kerja yang berbeda.
        database_path = Path(__file__).resolve().parent / "penjadwalan_rs.db"
        SQLALCHEMY_DATABASE_URL = f"sqlite:///{database_path.as_posix()}"
        
# SQLite membutuhkan opsi thread khusus karena FastAPI menangani request secara concurrent.
engine_options = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_options)

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
