import sys
import os

# Tambahkan direktori 'backend' ke sys.path agar import di main.py (seperti import models, schemas, dll) berjalan dengan benar
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

# Impor app FastAPI utama
from main import app
