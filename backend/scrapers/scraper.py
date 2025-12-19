import os
import json
import time
import psutil
from bs4 import BeautifulSoup
import requests
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

# ===================== GLOBAL PID TRACKER =====================
CHROME_PIDS = set()

# Selenium imports
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait, Select
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.service import Service
    from webdriver_manager.chrome import ChromeDriverManager
except Exception:
    pass

import undetected_chromedriver as uc
import logging
uc.logger.setLevel(logging.ERROR)


# =================== CONFIG ===================
MAX_WORKERS = 8
HEADLESS = True
TIMEOUT_PAGE = 12
BASE_DIR = os.path.dirname(__file__)
DATA_FILE = os.path.join(BASE_DIR, "data", "kecamatan_kab_semarang.json")
# ===============================================


# =====================================================
#  UC Driver (LISTING)
# =====================================================
def setup_uc_driver(headless=True):
    opts = uc.ChromeOptions()
    if headless:
        opts.add_argument("--headless=new")

    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1600,900")
    opts.add_argument("--log-level=3")

    # 🔥 WAJIB di VPS / WSL
    CHROME_BINARY = "/usr/bin/google-chrome"
    opts.binary_location = CHROME_BINARY
    
    driver = uc.Chrome(options=opts, version_main=0)
    driver.set_page_load_timeout(TIMEOUT_PAGE)

    try:
        CHROME_PIDS.add(driver.service.process.pid)
    except Exception:
        pass
    return driver



# =====================================================
#  Standard Selenium (DETAIL)
# =====================================================
def setup_standard_driver(headless=True):
    opts = ChromeOptions()
    if headless:
        opts.add_argument("--headless=new")

    opts.binary_location = "/usr/bin/google-chrome"
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1600,900")

    service = Service(ChromeDriverManager().install())

    driver = webdriver.Chrome(
        service=service,
        options=opts
    )
    driver.set_page_load_timeout(30)
    return driver

# =====================================================
#  Requests fast session
# =====================================================
def create_fast_session():
    s = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=50, pool_maxsize=50, max_retries=2)
    s.mount("http://", adapter)
    s.mount("https://", adapter)
    s.headers.update({"User-Agent": "Mozilla/5.0"})
    return s

# =====================================================
#  SAFE CLEANUP (LINUX & WINDOWS SAFE)
# =====================================================
def cleanup_safe_chrome():
    """
    Kill ONLY Chrome processes created by THIS script.
    """
    for pid in list(CHROME_PIDS):
        try:
            p = psutil.Process(pid)
            if p.is_running():
                p.terminate()
        except psutil.NoSuchProcess:
            pass
        except Exception:
            pass
        finally:
            CHROME_PIDS.discard(pid)

# =====================================================
#  LOAD KECAMATAN FOR FE
# =====================================================
def load_kecamatan_list():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    wilayah = next(iter(data))
    return list(data[wilayah]["kecamatan"].keys())


# =====================================================
#  READ KODE KECAMATAN
# =====================================================
def get_kode_kecamatan(nama):
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    wilayah = next(iter(data))
    return data[wilayah]["kecamatan"].get(nama)


# =====================================================
# Extract UUID from referensi.data
# =====================================================
def extract_uuid_from_referensi(url, session):
    try:
        r = session.get(url, timeout=12)
        soup = BeautifulSoup(r.text, "html.parser")
        a = soup.find("a", href=lambda x: x and "profil-sekolah" in x)
        if a:
            return a["href"].rstrip("/").split("/")[-1]
    except:
        return None
    return None


# =====================================================
# Worker DETAIL
# =====================================================
def fetch_detail_worker(link_base_tuple, fields):
    link, base = link_base_tuple
    session = create_fast_session()

    uuid = extract_uuid_from_referensi(link, session)
    if not uuid:
        return base

    url = f"https://sekolah.data.kemendikdasmen.go.id/profil-sekolah/{uuid}"
    driver = setup_standard_driver(headless=HEADLESS)
    
    # fungsi normalisasi data kosong (jadi "-")
    def clean_dash(v):
        if not v:
            return "-"
        v = v.strip()
        if v in ["-", "—", "–", "0", "", None, "N/A", "n/a"]:
            return "-"
        return v

    # ================================
    # VALIDATOR WEBSITE
    # Mengembalikan "-" jika:
    # - kosong atau hanya simbol
    # - tidak memiliki domain + TLD
    # - tidak memenuhi pola URL minimal
    # Catatan:
    # - subdomain (www) opsional
    # - otomatis menambahkan https:// jika tidak ada
    # ================================
    def normalize_url(v):
        v = clean_dash(v)
        if v == "-":
            return "-"
        
        v = v.strip()

        # Tambahkan protokol bila perlu
        if not (v.startswith("http://") or v.startswith("https://")):
            v = "https://" + v

        # Minimal: name.domain (tld ≥ 2 huruf)
        pattern = r"^https?://([A-Za-z0-9-]+\.)+[A-Za-z]{2,}(/.*)?$"

        if not re.match(pattern, v):
            return "-"

        return v

    # ================================
    # VALIDATOR EMAIL
    # Mengembalikan "-" jika:
    # - kosong atau simbol
    # - tidak memiliki format user@domain.tld
    # Domain bebas (.sch.id, .go.id, .com, dll)
    # ================================
    def normalize_email(v):
        v = clean_dash(v)
        if v == "-":
            return "-"
        
        v = v.strip()

        pattern = r"^[\w\.-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$"

        if not re.match(pattern, v):
            return "-"

        return v

    # ================================
    # VALIDATOR TELEPON
    # Mengembalikan "-" jika:
    # - kosong atau simbol
    # - terlalu pendek (< 6 digit)
    # - tidak mengandung angka yang cukup
    # Catatan:
    # - hanya angka dan "+" yang dipertahankan
    # ================================
    def normalize_phone(v):
        v = clean_dash(v)
        if v == "-":
            return "-"
        
        v = v.strip()

        # Ambil hanya angka dan tanda tambah
        cleaned = re.sub(r"[^\d+]", "", v)
        cleaned = re.sub(r"\++", "+", cleaned)

        # Jika hanya "+" atau kosong → invalid
        if cleaned == "+" or cleaned == "":
            return "-"

        # Minimal panjang nomor telepon
        if len(cleaned.replace("+", "")) < 6:
            return "-"

        return cleaned
    
    # 🔑 MAP LABEL HTML -> NAMA FIELD FE
    FIELD_MAP = {
        "kepala": "Kepala Sekolah",
        "telepon": "Telepon",
        "email": "Email",
        "website": "Website",
        "yayasan": "Yayasan",
    }

    detail = {}

    try:
        driver.get(url)
        time.sleep(1)

        # Alamat
        if "Alamat" in fields:
            try:
                WebDriverWait(driver, 12).until(
                    EC.visibility_of_element_located((By.CSS_SELECTOR, "h1 + p"))
                )
                detail["Alamat"] = clean_dash(
                    driver.find_element(By.CSS_SELECTOR, "h1 + p").text
                )
            except:
                detail["Alamat"] = "-"

        # Blok info (kepsek, telp, email, website, yayasan)
        try:
            blocks = driver.find_elements(By.CSS_SELECTOR, "div.grid div.flex")
            for blk in blocks:
                try:
                    label = blk.find_element(By.CSS_SELECTOR, ".text-slate-500").text.lower()
                except:
                    continue

                for key, field_name in FIELD_MAP.items():
                    if key in label and field_name in fields:
                        try:
                            if field_name == "Website":
                                href = blk.find_element(By.TAG_NAME, "a").get_attribute("href")
                                detail[field_name] = normalize_url(href)
                            elif field_name == "Telepon":
                                val = blk.find_element(By.TAG_NAME, "a").text
                                detail[field_name] = normalize_phone(val)
                            elif field_name == "Email":
                                val = blk.find_element(By.TAG_NAME, "a").text
                                detail[field_name] = normalize_email(val)
                            else:
                                val = blk.find_element(By.CSS_SELECTOR, ".font-semibold").text
                                detail[field_name] = clean_dash(val)
                        except:
                            detail[field_name] = "-"
        except:
            pass

        # Statistik siswa
        try:
            blocks = driver.find_elements(By.CSS_SELECTOR, "section div.grid div.flex")
            for b in blocks:
                try:
                    lbl = b.find_element(By.CSS_SELECTOR, "div.text-slate-600").text.lower()
                    raw_val = b.find_element(By.CSS_SELECTOR, "div.text-2xl").text
                    val = clean_dash(raw_val)
                except:
                    continue

                if "Jumlah Siswa Laki-laki" in fields and "laki" in lbl:
                    detail["Jumlah Siswa Laki-laki"] = val
                if "Jumlah Siswa Perempuan" in fields and "perempuan" in lbl:
                    detail["Jumlah Siswa Perempuan"] = val
        except:
            pass

    finally:
        try:
            driver.quit()
        except:
            pass

    return {**base, **detail}


# =====================================================
# SCRAPER UTAMA — RETURN EXACT JSON FOR FE
# =====================================================
def scrape_sd_kecamatan(nama_kecamatan, fields):
    kode = get_kode_kecamatan(nama_kecamatan)
    if not kode:
        return []

    list_driver = setup_uc_driver(headless=HEADLESS)

    sekolah_list = []
    urls = []

    need_detail = any(f in fields for f in [
        "Alamat", "Kepala Sekolah", "Telepon", "Email",
        "Website", "Yayasan",
        "Jumlah Siswa Laki-laki", "Jumlah Siswa Perempuan"
    ])

    # LIST SD & MI
    for jenjang, value in [("SD", "5"), ("MI", "9")]:
        url = f"https://referensi.data.kemendikdasmen.go.id/pendidikan/dikdas/{kode}/3/all/{value}/all"
        list_driver.get(url)

        WebDriverWait(list_driver, 12).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "table#table1 tbody tr"))
        )

        # set 100 rows
        try:
            Select(list_driver.find_element(By.NAME, "table1_length")).select_by_value("100")
            time.sleep(1)
        except:
            pass

        rows = list_driver.find_elements(By.CSS_SELECTOR, "table#table1 tbody tr")

        for r in rows:
            base = {}
            if "Nama Sekolah" in fields:
                base["Nama Sekolah"] = r.find_element(By.CSS_SELECTOR, "td:nth-child(3)").text.strip()
            if "NPSN" in fields:
                base["NPSN"] = r.find_element(By.CSS_SELECTOR, "td:nth-child(2)").text.strip()
            if "Status" in fields:
                base["Status"] = r.find_element(By.CSS_SELECTOR, "td:nth-child(6)").text.strip()
            if "Kelurahan" in fields:
                base["Kelurahan"] = r.find_element(By.CSS_SELECTOR, "td:nth-child(5)").text.strip()

            link = r.find_element(By.CSS_SELECTOR, "a").get_attribute("href")

            if need_detail:
                urls.append((link, base))
            else:
                sekolah_list.append(base)

    try:
        list_driver.quit()
    except:
        pass

    # DETAIL MODE
    if need_detail and urls:
        results = []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futures = [ex.submit(fetch_detail_worker, u, fields)for u in urls]
            for fut in as_completed(futures):
                try:
                    row = fut.result()
                except:
                    row = {}
                results.append(row)
        sekolah_list.extend(results)

    # SORT (optional)
    if fields:
        key = fields[0]
        sekolah_list.sort(key=lambda x: str(x.get(key, "")).lower())
        
    # ========== SAFE CLEANUP ==========
    cleanup_safe_chrome()

    return sekolah_list
