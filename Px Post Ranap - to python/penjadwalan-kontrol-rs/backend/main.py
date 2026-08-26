"""
FastAPI Main Application
Inti aplikasi backend: endpoint API, logika bisnis kuota, dan seed data awal.
"""

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

import models
import schemas
from database import engine, get_db, Base
from auth import hash_password, verify_password, create_access_token, get_current_user, require_admin

# --- Buat semua tabel di database ---
Base.metadata.create_all(bind=engine)

# --- Inisialisasi Aplikasi FastAPI ---
app = FastAPI(
    title="Sistem Penjadwalan Kontrol RS",
    description="Backend API untuk mengelola jadwal kontrol pasien pasca rawat inap & rawat jalan.",
    version="1.0.0"
)

# --- CORS (agar front-end bisa mengakses API ini) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Di production, ganti dengan domain spesifik
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================
# SEED DATA (Data Awal)
# =============================================
@app.on_event("startup")
def seed_initial_data():
    """Isi data awal dokter dan hari libur jika database masih kosong."""
    db = next(get_db())
    try:
        # Seed Dokter
        if db.query(models.Doctor).count() == 0:
            doctors = [
                models.Doctor(
                    id="panji",
                    name="dr. Panji Gugag B. S.PD",
                    quota_rules={"1": 7, "2": 5, "3": 7, "4": 7, "5": 0, "6": 0, "0": 0}
                ),
                models.Doctor(
                    id="setyo",
                    name="dr. Setyo Anestyo S.S",
                    quota_rules={"1": 10, "2": 10, "3": 10, "4": 10, "5": 10, "6": 0, "0": 0}
                ),
                models.Doctor(
                    id="indah",
                    name="dr. Indah Lestari Sp.A",
                    quota_rules={"1": 8, "2": 8, "3": 8, "4": 8, "5": 8, "6": 0, "0": 0}
                ),
            ]
            db.add_all(doctors)
            db.commit()

        # Seed Hari Libur
        if db.query(models.Holiday).count() == 0:
            holidays = [
                models.Holiday(date=date(2026, 8, 17), description="Hari Kemerdekaan RI"),
                models.Holiday(date=date(2026, 8, 19), description="Hari Libur Simulasi"),
            ]
            db.add_all(holidays)
            db.commit()

        # Seed Users (Akun Default)
        if db.query(models.User).count() == 0:
            users = [
                models.User(
                    username="perawat",
                    password_hash=hash_password("perawat123"),
                    role="perawat_ranap",
                    display_name="Perawat Rawat Inap"
                ),
                models.User(
                    username="admin_rajal",
                    password_hash=hash_password("admin123"),
                    role="admin_rajal",
                    display_name="Admin Rawat Jalan"
                ),
            ]
            db.add_all(users)
            db.commit()
    finally:
        db.close()


# =============================================
# API ENDPOINTS: Autentikasi
# =============================================
@app.post("/api/auth/login", response_model=schemas.LoginResponse, tags=["Autentikasi"])
def login(request: schemas.LoginRequest, db: Session = Depends(get_db)):
    """Login dan dapatkan JWT token."""
    user = db.query(models.User).filter(models.User.username == request.username).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    
    token = create_access_token({"sub": user.username, "role": user.role})
    return schemas.LoginResponse(
        access_token=token,
        user=schemas.UserResponse.model_validate(user)
    )


@app.get("/api/auth/me", response_model=schemas.UserResponse, tags=["Autentikasi"])
def get_me(current_user: models.User = Depends(get_current_user)):
    """Mendapatkan data user yang sedang login."""
    return current_user


# =============================================
# HELPER: Hitung Kuota
# =============================================
def calculate_quota(
    target_date: date,
    doctor_id: str,
    unit: str,
    db: Session,
    exclude_patient_id: Optional[int] = None
) -> schemas.QuotaInfo:
    """
    Menghitung kuota yang tersedia untuk dokter tertentu di tanggal tertentu.
    Logika ini sama persis dengan getQuota() di front-end (app.js).
    """
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail=f"Dokter '{doctor_id}' tidak ditemukan")

    day_of_week = str(target_date.isoweekday() % 7)  # 0=Minggu, 1=Senin, ...
    default_quota = doctor.quota_rules.get(day_of_week, 0)

    # Cek hari libur
    is_holiday = db.query(models.Holiday).filter(models.Holiday.date == target_date).first()

    # Cek override admin
    override = db.query(models.QuotaOverride).filter(
        models.QuotaOverride.doctor_id == doctor_id,
        models.QuotaOverride.override_date == target_date
    ).first()

    # Tentukan status dan kuota maksimal
    status = "buka"
    max_quota = default_quota

    if override:
        status = f"override_{override.status}"
        if override.status == "tutup":
            max_quota = 0
        elif override.custom_quota is not None:
            max_quota = override.custom_quota
    elif is_holiday or default_quota == 0:
        status = "tutup"
        max_quota = 0

    # Hitung jumlah pasien terdaftar
    patient_query = db.query(models.Patient).filter(
        models.Patient.doctor_id == doctor_id,
        models.Patient.schedule_date == target_date,
        models.Patient.unit == unit
    )
    if exclude_patient_id:
        patient_query = patient_query.filter(models.Patient.id != exclude_patient_id)

    booked = patient_query.count()
    available = max(0, max_quota - booked)

    return schemas.QuotaInfo(
        date=target_date,
        doctor_id=doctor_id,
        doctor_name=doctor.name,
        unit=unit,
        status=status,
        max_quota=max_quota,
        booked=booked,
        available=available
    )


# =============================================
# API ENDPOINTS: Dokter
# =============================================
@app.get("/api/doctors", response_model=List[schemas.DoctorResponse], tags=["Dokter"])
def get_doctors(db: Session = Depends(get_db)):
    """Mengambil daftar semua dokter DPJP."""
    return db.query(models.Doctor).all()


# =============================================
# API ENDPOINTS: Pasien
# =============================================
@app.get("/api/patients", response_model=List[schemas.PatientResponse], tags=["Pasien"])
def get_patients(
    unit: Optional[str] = Query(None, description="Filter unit: 'ranap' atau 'rajal'"),
    doctor_id: Optional[str] = Query(None, description="Filter dokter"),
    schedule_date: Optional[date] = Query(None, description="Filter tanggal"),
    db: Session = Depends(get_db)
):
    """Mengambil daftar jadwal pasien dengan filter opsional."""
    query = db.query(models.Patient)
    if unit:
        query = query.filter(models.Patient.unit == unit)
    if doctor_id:
        query = query.filter(models.Patient.doctor_id == doctor_id)
    if schedule_date:
        query = query.filter(models.Patient.schedule_date == schedule_date)
    return query.order_by(models.Patient.schedule_date.asc()).all()


@app.post("/api/patients", response_model=schemas.PatientResponse, tags=["Pasien"])
def create_patient(patient: schemas.PatientCreate, db: Session = Depends(get_db)):
    """
    Membuat jadwal kontrol baru untuk pasien.
    Termasuk validasi kuota agar tidak melebihi batas.
    """
    if patient.schedule_date < date.today():
        raise HTTPException(status_code=400, detail="Tidak dapat menjadwalkan kontrol di tanggal yang sudah lewat.")

    # Validasi kuota
    quota = calculate_quota(patient.schedule_date, patient.doctor_id, patient.unit, db)
    if quota.status in ("tutup", "override_tutup"):
        raise HTTPException(
            status_code=400,
            detail=f"Tanggal {patient.schedule_date} adalah hari libur/tutup untuk {quota.doctor_name}."
        )
    if quota.available <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"Kuota {patient.unit.upper()} untuk {quota.doctor_name} pada {patient.schedule_date} sudah penuh ({quota.booked}/{quota.max_quota})."
        )

    # Simpan ke database
    db_patient = models.Patient(
        name=patient.name,
        rm_number=patient.rm_number,
        phone=patient.phone,
        doctor_id=patient.doctor_id,
        unit=patient.unit,
        schedule_date=patient.schedule_date,
        notes=patient.notes or ""
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient


@app.put("/api/patients/{patient_id}", response_model=schemas.PatientResponse, tags=["Pasien"])
def update_patient(patient_id: int, patient: schemas.PatientUpdate, db: Session = Depends(get_db)):
    """Mengedit data jadwal pasien yang sudah ada."""
    db_patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not db_patient:
        raise HTTPException(status_code=404, detail="Data pasien tidak ditemukan")

    update_data = patient.model_dump(exclude_unset=True)

    # Jika tanggal atau dokter atau unit berubah, validasi ulang kuota
    new_date = update_data.get("schedule_date", db_patient.schedule_date)
    new_doctor = update_data.get("doctor_id", db_patient.doctor_id)
    new_unit = update_data.get("unit", db_patient.unit)

    if new_date != db_patient.schedule_date or new_doctor != db_patient.doctor_id or new_unit != db_patient.unit:
        if new_date < date.today():
            raise HTTPException(status_code=400, detail="Tidak dapat menjadwalkan kontrol di tanggal yang sudah lewat.")

        quota = calculate_quota(new_date, new_doctor, new_unit, db, exclude_patient_id=patient_id)
        if quota.status in ("tutup", "override_tutup"):
            raise HTTPException(status_code=400, detail=f"Tanggal {new_date} adalah hari libur/tutup.")
        if quota.available <= 0:
            raise HTTPException(status_code=400, detail=f"Kuota sudah penuh pada tanggal {new_date}.")

    for key, value in update_data.items():
        setattr(db_patient, key, value)

    db.commit()
    db.refresh(db_patient)
    return db_patient


@app.delete("/api/patients/{patient_id}", tags=["Pasien"])
def delete_patient(patient_id: int, db: Session = Depends(get_db)):
    """Menghapus/membatalkan jadwal pasien."""
    db_patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not db_patient:
        raise HTTPException(status_code=404, detail="Data pasien tidak ditemukan")
    db.delete(db_patient)
    db.commit()
    return {"message": "Jadwal berhasil dibatalkan", "id": patient_id}


# =============================================
# API ENDPOINTS: Kuota & Override
# =============================================
@app.get("/api/quota", response_model=schemas.QuotaInfo, tags=["Kuota"])
def get_quota_info(
    target_date: date = Query(..., description="Tanggal yang ingin dicek"),
    doctor_id: str = Query(..., description="ID dokter"),
    unit: str = Query("ranap", description="Unit: 'ranap' atau 'rajal'"),
    db: Session = Depends(get_db)
):
    """Mengecek informasi kuota untuk tanggal dan dokter tertentu."""
    return calculate_quota(target_date, doctor_id, unit, db)


@app.get("/api/overrides", response_model=List[schemas.OverrideResponse], tags=["Override Admin"])
def get_overrides(
    doctor_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Mengambil daftar override yang sudah disimpan admin."""
    query = db.query(models.QuotaOverride)
    if doctor_id:
        query = query.filter(models.QuotaOverride.doctor_id == doctor_id)
    return query.all()


@app.post("/api/overrides", response_model=schemas.OverrideResponse, tags=["Override Admin"])
def create_or_update_override(override: schemas.OverrideCreate, db: Session = Depends(get_db)):
    """
    Membuat atau memperbarui override untuk tanggal + dokter tertentu.
    Jika sudah ada override untuk kombinasi tanggal+dokter, data akan di-update.
    """
    # Validasi: Jika mau set tutup, cek apakah ada pasien terdaftar
    if override.status == "tutup":
        existing_patients = db.query(models.Patient).filter(
            models.Patient.doctor_id == override.doctor_id,
            models.Patient.schedule_date == override.override_date
        ).count()
        if existing_patients > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Tidak dapat set 'Tutup'. Sudah ada {existing_patients} pasien terdaftar pada tanggal tersebut."
            )

    # Cari override yang sudah ada
    existing = db.query(models.QuotaOverride).filter(
        models.QuotaOverride.doctor_id == override.doctor_id,
        models.QuotaOverride.override_date == override.override_date
    ).first()

    if existing:
        existing.status = override.status
        existing.custom_quota = override.custom_quota
        db.commit()
        db.refresh(existing)
        return existing
    else:
        db_override = models.QuotaOverride(
            doctor_id=override.doctor_id,
            override_date=override.override_date,
            status=override.status,
            custom_quota=override.custom_quota
        )
        db.add(db_override)
        db.commit()
        db.refresh(db_override)
        return db_override


# =============================================
# API ENDPOINTS: Hari Libur
# =============================================
@app.get("/api/holidays", response_model=List[schemas.HolidayResponse], tags=["Hari Libur"])
def get_holidays(db: Session = Depends(get_db)):
    """Mengambil daftar hari libur nasional."""
    return db.query(models.Holiday).order_by(models.Holiday.date.asc()).all()


@app.post("/api/holidays", response_model=schemas.HolidayResponse, tags=["Hari Libur"])
def add_holiday(holiday: schemas.HolidayCreate, db: Session = Depends(get_db)):
    """Menambahkan hari libur nasional baru."""
    existing = db.query(models.Holiday).filter(models.Holiday.date == holiday.date).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tanggal ini sudah terdaftar sebagai hari libur.")
    db_holiday = models.Holiday(date=holiday.date, description=holiday.description)
    db.add(db_holiday)
    db.commit()
    db.refresh(db_holiday)
    return db_holiday
