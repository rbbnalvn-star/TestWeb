"""
Database Models (ORM)
Rancangan tabel database menggunakan SQLAlchemy ORM.
Kode Python ini secara otomatis membuat tabel-tabel di database.
"""

from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class User(Base):
    """
    Tabel User (Autentikasi)
    Menyimpan akun login untuk perawat dan admin.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)          # 'perawat_ranap' atau 'admin_rajal'
    display_name = Column(String, nullable=False)  # Nama tampilan, contoh: 'Perawat Ranap'


class Doctor(Base):
    """
    Tabel Dokter (Master Data)
    Menyimpan data dokter DPJP beserta aturan kuota hariannya.
    """
    __tablename__ = "doctors"

    id = Column(String, primary_key=True, index=True)          # contoh: 'panji'
    name = Column(String, nullable=False)                       # contoh: 'dr. Panji Gugag B. S.PD'
    quota_rules = Column(JSON, nullable=False)                  # contoh: {1: 7, 2: 5, ...} (0=Minggu, 6=Sabtu)

    # Relasi ke tabel lain
    patients = relationship("Patient", back_populates="doctor")
    overrides = relationship("QuotaOverride", back_populates="doctor")


class Patient(Base):
    """
    Tabel Pasien & Jadwal Kontrol
    Menyimpan setiap pendaftaran jadwal kontrol pasien.
    """
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)                       # Nama Pasien
    rm_number = Column(String(8), nullable=False)               # No. Rekam Medis (8 digit)
    phone = Column(String, nullable=False)                      # No. Handphone
    doctor_id = Column(String, ForeignKey("doctors.id"), nullable=False)
    unit = Column(String, nullable=False, default="ranap")      # 'ranap' atau 'rajal'
    schedule_date = Column(Date, nullable=False)                # Tanggal kontrol
    notes = Column(String, nullable=True, default="")           # Catatan tambahan (opsional)
    created_at = Column(DateTime, server_default=func.now())    # Waktu data diinput

    # Relasi
    doctor = relationship("Doctor", back_populates="patients")


class QuotaOverride(Base):
    """
    Tabel Override Kuota & Status (Admin Only)
    Menyimpan aturan khusus dari admin: paksa buka/tutup tanggal tertentu,
    atau set kuota khusus untuk dokter tertentu di tanggal tertentu.
    """
    __tablename__ = "quota_overrides"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    doctor_id = Column(String, ForeignKey("doctors.id"), nullable=False)
    override_date = Column(Date, nullable=False)                # Tanggal spesifik
    status = Column(String, nullable=False, default="buka")     # 'buka' atau 'tutup'
    custom_quota = Column(Integer, nullable=True)               # Kuota khusus (opsional)

    # Relasi
    doctor = relationship("Doctor", back_populates="overrides")


class Holiday(Base):
    """
    Tabel Hari Libur Nasional
    Menyimpan daftar tanggal libur nasional.
    """
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date = Column(Date, nullable=False, unique=True)
    description = Column(String, nullable=True)                 # contoh: 'Hari Kemerdekaan RI'
