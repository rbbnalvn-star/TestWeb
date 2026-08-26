"""
Pydantic Schemas
Aturan validasi data masuk (Request) dan keluar (Response) dari API.
Ini memastikan data yang dikirim/diterima selalu dalam format yang benar.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime

# =============================================
# AUTH SCHEMAS
# =============================================
class LoginRequest(BaseModel):
    """Schema untuk login."""
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    """Schema untuk response login (JWT token)."""
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    """Schema untuk response data user."""
    id: int
    username: str
    role: str
    display_name: str

    class Config:
        from_attributes = True


# =============================================
# DOCTOR SCHEMAS
# =============================================
class DoctorBase(BaseModel):
    id: str
    name: str
    quota_rules: dict  # contoh: {"1": 7, "2": 5, ...}


class DoctorResponse(DoctorBase):
    """Schema untuk response data dokter."""
    class Config:
        from_attributes = True


# =============================================
# PATIENT SCHEMAS
# =============================================
class PatientCreate(BaseModel):
    """Schema untuk membuat jadwal pasien baru."""
    name: str = Field(..., min_length=1, description="Nama pasien")
    rm_number: str = Field(..., min_length=8, max_length=8, pattern=r"^\d{8}$",
                           description="No. Rekam Medis (8 digit angka)")
    phone: str = Field(..., min_length=1, pattern=r"^\d+$",
                       description="No. Handphone (hanya angka)")
    doctor_id: str = Field(..., description="ID dokter DPJP")
    unit: str = Field(..., pattern=r"^(ranap|rajal)$",
                      description="Unit: 'ranap' atau 'rajal'")
    schedule_date: date = Field(..., description="Tanggal kontrol (YYYY-MM-DD)")
    notes: Optional[str] = Field(default="", description="Catatan tambahan")


class PatientUpdate(BaseModel):
    """Schema untuk mengedit data pasien."""
    name: Optional[str] = None
    rm_number: Optional[str] = Field(default=None, min_length=8, max_length=8, pattern=r"^\d{8}$")
    phone: Optional[str] = Field(default=None, pattern=r"^\d+$")
    doctor_id: Optional[str] = None
    unit: Optional[str] = Field(default=None, pattern=r"^(ranap|rajal)$")
    schedule_date: Optional[date] = None
    notes: Optional[str] = None


class PatientResponse(BaseModel):
    """Schema untuk response data pasien."""
    id: int
    name: str
    rm_number: str
    phone: str
    doctor_id: str
    unit: str
    schedule_date: date
    notes: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# =============================================
# QUOTA OVERRIDE SCHEMAS
# =============================================
class OverrideCreate(BaseModel):
    """Schema untuk membuat override buka/tutup/kuota."""
    doctor_id: str = Field(..., description="ID dokter DPJP")
    override_date: date = Field(..., description="Tanggal override (YYYY-MM-DD)")
    status: str = Field(..., pattern=r"^(buka|tutup)$",
                        description="Status: 'buka' atau 'tutup'")
    custom_quota: Optional[int] = Field(default=None, ge=0,
                                        description="Kuota khusus (opsional)")


class OverrideResponse(BaseModel):
    """Schema untuk response data override."""
    id: int
    doctor_id: str
    override_date: date
    status: str
    custom_quota: Optional[int]

    class Config:
        from_attributes = True


# =============================================
# HOLIDAY SCHEMAS
# =============================================
class HolidayCreate(BaseModel):
    """Schema untuk menambah hari libur."""
    date: date
    description: Optional[str] = None


class HolidayResponse(BaseModel):
    """Schema untuk response hari libur."""
    id: int
    date: date
    description: Optional[str]

    class Config:
        from_attributes = True


# =============================================
# QUOTA INFO SCHEMA (Non-DB, computed)
# =============================================
class QuotaInfo(BaseModel):
    """Schema untuk informasi kuota pada tanggal tertentu."""
    date: date
    doctor_id: str
    doctor_name: str
    unit: str
    status: str             # 'buka', 'tutup', 'override_buka', 'override_tutup'
    max_quota: int
    booked: int
    available: int
