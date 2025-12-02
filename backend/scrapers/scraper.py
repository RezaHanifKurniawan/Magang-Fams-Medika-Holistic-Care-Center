import os
import json
import time
import psutil
from bs4 import BeautifulSoup
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

# Selenium imports
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait, Select
    from selenium.webdriver.support import expected_conditions as EC
    STANDARD_SELENIUM_AVAILABLE = True
except Exception:
    STANDARD_SELENIUM_AVAILABLE = False

import undetected_chromedriver as uc
import logging
uc.logger.setLevel(logging.ERROR)


# =================== CONFIG ===================
MAX_WORKERS = 12
HEADLESS = True
TIMEOUT_PAGE = 12
# ===============================================


BASE_DIR = os.path.dirname(__file__)
DATA_FILE = os.path.join(BASE_DIR, "data", "kecamatan_kab_semarang.json")


# =====================================================
#  UC Driver (for LISTING only)
# =====================================================
def setup_uc_driver(headless=True):
    opts = uc.ChromeOptions()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1600,900")
    opts.add_argument("--blink-settings=imagesEnabled=false")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--log-level=3")

    try:
        driver = uc.Chrome(options=opts)
    except:
        driver = setup_standard_driver(headless=headless)

    driver.set_page_load_timeout(TIMEOUT_PAGE)
    return driver


# =====================================================
#  Standard Selenium (DETAIL)
# =====================================================
def setup_standard_driver(headless=True):
    try:
        opts = ChromeOptions()
        if headless:
            opts.add_argument("--headless=new")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--window-size=1600,900")
        opts.add_argument("--blink-settings=imagesEnabled=false")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--log-level=3")

        opts.add_experimental_option("excludeSwitches", ["enable-automation"])
        opts.add_experimental_option("useAutomationExtension", False)

        driver = webdriver.Chrome(options=opts)
        driver.set_page_load_timeout(TIMEOUT_PAGE)
        return driver
    except:
        return setup_uc_driver(headless=headless)


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
# ORPHAN CLEANER (RUN AFTER SCRAPE DONE)
# =====================================================
def cleanup_orphan_chrome():
    """
    SAFEST METHOD:
    Kill ONLY orphaned chrome/chromedriver/uc
    whose parent process is gone.
    """
    targets = ("chrome.exe", "chromedriver.exe", "undetected_chromedriver.exe")

    for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'ppid']):
        name = proc.info["name"]
        if not name:
            continue
        if name.lower() not in targets:
            continue

        parent_pid = proc.info["ppid"]

        try:
            psutil.Process(parent_pid)
            # parent still exists → not orphan
            continue
        except psutil.NoSuchProcess:
            # parent is gone → orphan, safe to kill
            try:
                print(f"[CLEAN] Killing orphan {name} (PID {proc.pid})")
                proc.kill()
            except:
                pass

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
        r = session.get(url, timeout=10)
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
def fetch_detail_worker(link_base_tuple):
    link, base = link_base_tuple
    session = create_fast_session()

    uuid = extract_uuid_from_referensi(link, session)
    if not uuid:
        return base

    url = f"https://sekolah.data.kemendikdasmen.go.id/profil-sekolah/{uuid}"

    driver = setup_standard_driver(headless=HEADLESS)
    
    # fungsi normalisasi
    def clean_dash(v):
        if not v:
            return "-"
        v = v.strip()
        if v in ["—", "–", "-", "", None, "0"]:
            return "-"
        return v

    detail = {
        "Alamat": "-",
        "Kepala Sekolah": "-",
        "Telepon": "-",
        "Email": "-",
        "Website": "-",
        "Yayasan": "-",
        "Jumlah Siswa Laki-laki": "-",
        "Jumlah Siswa Perempuan": "-",
    }

    try:
        driver.get(url)
        time.sleep(1)

        # Alamat
        try:
            WebDriverWait(driver, 12).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, "h1 + p"))
            )
            addr = driver.find_element(By.CSS_SELECTOR, "h1 + p").text
            detail["Alamat"] = clean_dash(addr)
        except:
            detail["Alamat"] = "-"

        # Kepala sekolah, email, telepon, yayasan
        try:
            blocks = driver.find_elements(By.CSS_SELECTOR, "div.grid div.flex")
            for blk in blocks:
                try:
                    label = blk.find_element(By.CSS_SELECTOR, ".text-slate-500").text.lower().strip()
                except:
                    continue

                # Kepala Sekolah
                if "kepala" in label:
                    try:
                        val = blk.find_element(By.CSS_SELECTOR, ".font-semibold").text
                        detail["Kepala Sekolah"] = clean_dash(val)
                    except:
                        pass

                # Telepon
                elif "telepon" in label:
                    try:
                        val = blk.find_element(By.TAG_NAME, "a").text
                        detail["Telepon"] = clean_dash(val)
                    except:
                        pass

                # Email
                elif "email" in label:
                    try:
                        val = blk.find_element(By.TAG_NAME, "a").text
                        detail["Email"] = clean_dash(val)
                    except:
                        pass

                # Website (ambil href ALWAYS)
                elif "website" in label:
                    try:
                        href = blk.find_element(By.TAG_NAME, "a").get_attribute("href")
                        if not href or not href.startswith("http"):
                            href = "-"
                        detail["Website"] = clean_dash(href)
                    except:
                        detail["Website"] = "-"

                # Yayasan
                elif "yayasan" in label:
                    try:
                        val = blk.find_element(By.CSS_SELECTOR, ".font-semibold").text
                        detail["Yayasan"] = clean_dash(val)
                    except:
                        pass
        except:
            pass

        # Statistik jumlah siswa
        try:
            time.sleep(1)
            blocks = driver.find_elements(By.CSS_SELECTOR, "section div.grid div.flex")
            for b in blocks:
                try:
                    lbl = b.find_element(By.CSS_SELECTOR, "div.text-slate-600").text.lower().strip()
                    raw_val = b.find_element(By.CSS_SELECTOR, "div.text-2xl").text.strip()
                    val = clean_dash(raw_val)
                except:
                    continue

                if "laki" in lbl:
                    detail["Jumlah Siswa Laki-laki"] = val

                if "perempuan" in lbl:
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
            futures = [ex.submit(fetch_detail_worker, u) for u in urls]
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
        
    # ========== CLEANUP ORPHANS AFTER ALL SCRAPE ==========
    cleanup_orphan_chrome()

    return sekolah_list
