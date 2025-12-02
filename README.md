# **SD Webscraper Kabupaten Semarang**

Project ini terdiri dari 2 bagian:

* **Backend (Flask + Selenium)**
* **Frontend (React + Tailwind)**

Frontend berfungsi sebagai UI untuk memilih kecamatan, field data, preview hasil scraping, chart statistik, dan mengunduh data dalam format CSV/XLSX.
Backend menangani scraping data sekolah dasar dari situs Kemendikdasmen dengan optimasi multi-thread untuk performa maksimal.

---

## **Cara Menjalankan Backend**

Masuk ke folder backend:

```bash
cd backend
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Jalankan server:

```bash
python app.py
```

Backend berjalan di:

```
http://localhost:5000
```

---

## **Cara Menjalankan Frontend**

Masuk ke folder frontend:

```bash
cd frontend
```

Install dependencies React:

```bash
npm install
```

Jalankan aplikasi:

```bash
npm run dev
```

Frontend berjalan di:

```
http://localhost:5173
```

---

## **Struktur Project**

```
frontend/
  └── React UI (Tailwind, Recharts)
backend/
  ├── app.py (Flask API)
  ├── scrapers/ (logic scraping)
  └── data/ (JSON daftar kecamatan)
```

---

## **Fitur Utama**

* **Scraping SD & MI per kecamatan Kabupaten Semarang**
* **Multi-threaded scraping (hingga 12 worker)** untuk mempercepat pengambilan detail sekolah
* **Preview 5 data pertama**
* **Sorting otomatis berdasarkan prioritas kolom**
* **Statistik otomatis** (total sekolah, jumlah siswa laki-laki, rata-rata)
* **Chart jumlah siswa laki-laki per sekolah**
* **Export ke CSV & XLSX**
* **Caching hasil scraping** untuk menghindari scrape ulang yang tidak perlu
* **Reset otomatis state FE saat scraping baru dimulai**
* **Auto-clean orphan Chrome/Chromedriver** setelah scraping selesai

---

## **Catatan Penting**

* Backend membutuhkan Chrome/Chromedriver (atau undetected-chromedriver) sudah terinstall.
* Jalankan **backend terlebih dahulu**, kemudian frontend.
* Semakin banyak data & semakin banyak thread, semakin besar penggunaan CPU/memori.
* Disarankan menjalankan pada laptop/PC dengan spesifikasi memadai.

---
