@echo off
title RS Kontrol - Server Startup
echo Memulai Server Penjadwalan Kontrol RS...
echo ========================================

:: Menjalankan Backend (Uvicorn) di window/proses baru yang terpisah
echo [1/2] Menjalankan Backend API (Port 8001)...
start "Backend RS Kontrol" cmd /c "cd backend && python -m uvicorn main:app --reload --port 8001"

:: Menunggu sejenak agar backend siap
timeout /t 3 /nobreak > NUL

:: Menjalankan Frontend (HTTP Server) di window yang sama
echo [2/2] Menjalankan Frontend Web (Port 8000)...
echo.
echo Aplikasi sudah berjalan!
echo Silakan buka browser dan akses: http://localhost:8000
echo.
echo (Biarkan jendela hitam ini tetap terbuka selama aplikasi digunakan. Tekan Ctrl+C untuk mematikan frontend)
echo ========================================
python -m http.server 8000
