import os
import json
import time
import psutil
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

# ===================== GLOBAL PID TRACKER =====================
CHROME_PIDS = set()

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

import undetected_chromedriver as uc
import logging
uc.logger.setLevel(logging.ERROR)

# =================== CONFIG ===================
MAX_WORKERS = 5
HEADLESS = True
TIMEOUT_PAGE = 20
BASE_DIR = os.path.dirname(__file__)
DATA_FILE = os.path.join(BASE_DIR, "data", "kecamatan_kab_semarang.json")
# =============================================


# =====================================================
# UC Driver (LISTING)
# =====================================================
def setup_uc_driver(headless=HEADLESS):
    opts = uc.ChromeOptions()
    if headless:
        opts.add_argument("--headless=new")

    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1600,900")
    opts.add_argument("--log-level=3")

    opts.binary_location = "/usr/bin/google-chrome"

    driver = uc.Chrome(options=opts, version_main=143)
    driver.set_page_load_timeout(TIMEOUT_PAGE)

    try:
        CHROME_PIDS.add(driver.service.process.pid)
    except:
        pass
    return driver


# =====================================================
# Standard Selenium (DETAIL)
# =====================================================
def setup_standard_driver(headless=HEADLESS):
    opts = ChromeOptions()
    if headless:
        opts.add_argument("--headless=new")

    opts.binary_location = "/usr/bin/google-chrome"
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1600,900")

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
    driver.set_page_load_timeout(30)
    return driver


# =====================================================
# AUTO OPEN + REFRESH
# =====================================================
def open_with_refresh(driver, url, wait_selector, max_retry=5):
    for _ in range(max_retry):
        try:
            driver.get(url)
            WebDriverWait(driver, TIMEOUT_PAGE).until(
                EC.presence_of_element_located(wait_selector)
            )
            return True
        except:
            try:
                driver.refresh()
            except:
                pass
            time.sleep(3)
    return False


# =====================================================
# SAFE CLEANUP
# =====================================================
def cleanup_safe_chrome():
    for pid in list(CHROME_PIDS):
        try:
            p = psutil.Process(pid)
            if p.is_running():
                p.terminate()
        except:
            pass
        CHROME_PIDS.discard(pid)


# =====================================================
# LOAD KECAMATAN
# =====================================================
def load_kecamatan_list():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    wilayah = next(iter(data))
    return list(data[wilayah]["kecamatan"].keys())


def get_kode_kecamatan(nama):
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    wilayah = next(iter(data))
    return data[wilayah]["kecamatan"].get(nama)


# =====================================================
# DETAIL WORKER (FINAL)
# =====================================================
def fetch_detail_worker(npsn_base_tuple, fields):
    npsn, base = npsn_base_tuple

    try:
        driver = setup_standard_driver(headless=HEADLESS)
    except:
        return base

    def clean(v):
        v = v.strip()
        return "-" if v in ["", "-", "—", "–", "0", "N/A", "n/a"] else v

    def normalize_email(v):
        return v if re.match(r"^[\w\.-]+@([\w-]+\.)+[A-Za-z]{2,}$", v) else "-"

    def normalize_phone(v):
        v = re.sub(r"[^\d+]", "", v)
        return v if len(v.replace("+", "")) >= 6 else "-"

    def normalize_url(v):
        return v if re.match(r"^https?://.+\..+", v) else "-"

    try:
        search_url = f"https://sekolah.data.kemendikdasmen.go.id/sekolah?keyword={npsn}"

        ok = open_with_refresh(
            driver,
            search_url,
            (By.TAG_NAME, "app-school-cards-grid")
        )
        if not ok:
            return base

        WebDriverWait(driver, 20).until(
            EC.element_to_be_clickable((
                By.XPATH,
                "/html/body/app-root/app-layout/app-school/div/section/div/app-school-cards-grid/div/div[2]/article/div[2]/div[4]/button[2]"
            ))
        ).click()

        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.TAG_NAME, "app-school-profile"))
        )

        detail = {}

        # ===== Identitas Sekolah =====
        if "Alamat" in fields:
            try:
                detail["Alamat"] = clean(driver.find_element(
                    By.XPATH,
                    "/html/body/app-root/app-layout/app-school-profile/div/section/div/app-school-profile-top-row/div/div[1]/div[1]/p"
                ).text)
            except:
                detail["Alamat"] = "-"

        if "Kepala Sekolah" in fields:
            try:
                detail["Kepala Sekolah"] = clean(driver.find_element(
                    By.XPATH,
                    "/html/body/app-root/app-layout/app-school-profile/div/section/div/app-school-profile-top-row/div/div[2]/div/div/div[5]/div/div[2]"
                ).text)
            except:
                detail["Kepala Sekolah"] = "-"

        if "Telepon" in fields:
            try:
                detail["Telepon"] = normalize_phone(driver.find_element(
                    By.XPATH,
                    "/html/body/app-root/app-layout/app-school-profile/div/section/div/app-school-profile-top-row/div/div[2]/div/div/div[7]/div/a"
                ).text)
            except:
                detail["Telepon"] = "-"

        if "Email" in fields:
            try:
                detail["Email"] = normalize_email(driver.find_element(
                    By.XPATH,
                    "/html/body/app-root/app-layout/app-school-profile/div/section/div/app-school-profile-top-row/div/div[2]/div/div/div[8]/div/a"
                ).text)
            except:
                detail["Email"] = "-"

        if "Website" in fields:
            try:
                detail["Website"] = normalize_url(driver.find_element(
                    By.XPATH,
                    "/html/body/app-root/app-layout/app-school-profile/div/section/div/app-school-profile-top-row/div/div[2]/div/div/div[9]/div/a"
                ).get_attribute("href"))
            except:
                detail["Website"] = "-"

        if "Yayasan" in fields:
            try:
                detail["Yayasan"] = clean(driver.find_element(
                    By.XPATH,
                    "/html/body/app-root/app-layout/app-school-profile/div/section/div/app-school-profile-top-row/div/div[2]/div/div/div[10]/div/a"
                ).text)
            except:
                detail["Yayasan"] = "-"

        # ===== Jumlah Siswa =====
        if "Jumlah Siswa Laki-laki" in fields:
            try:
                detail["Jumlah Siswa Laki-laki"] = clean(driver.find_element(
                    By.XPATH,
                    "/html/body/app-root/app-layout/app-school-profile/div/section/div/app-school-profile-second-row/div/section[1]/div/div/div[2]/div/div[2]/div"
                ).text)
            except:
                detail["Jumlah Siswa Laki-laki"] = "-"

        if "Jumlah Siswa Perempuan" in fields:
            try:
                detail["Jumlah Siswa Perempuan"] = clean(driver.find_element(
                    By.XPATH,
                    "/html/body/app-root/app-layout/app-school-profile/div/section/div/app-school-profile-second-row/div/section[1]/div/div/div[3]/div/div[2]/div"
                ).text)
            except:
                detail["Jumlah Siswa Perempuan"] = "-"

        return {**base, **detail}

    except:
        return base

    finally:
        try:
            driver.quit()
        except:
            pass


# =====================================================
# MAIN SCRAPER
# =====================================================
def scrape_sd_kecamatan(nama_kecamatan, fields):
    kode = get_kode_kecamatan(nama_kecamatan)
    if not kode:
        return []

    driver = setup_uc_driver(headless=HEADLESS)
    sekolah_list = []
    urls = []

    need_detail = any(f in fields for f in [
        "Alamat", "Kepala Sekolah", "Telepon",
        "Email", "Website", "Yayasan",
        "Jumlah Siswa Laki-laki", "Jumlah Siswa Perempuan"
    ])

    try:
        url = f"https://dapo.kemendikdasmen.go.id/sp/3/{kode}"

        ok = open_with_refresh(driver, url, (By.ID, "dataTables"))
        if not ok:
            return []

        rows = driver.find_elements(By.CSS_SELECTOR, "#dataTables tbody tr")

        for r in rows:
            base = {
                "Nama Sekolah": r.find_element(By.CSS_SELECTOR, "td:nth-child(2)").text.strip(),
                "NPSN": r.find_element(By.CSS_SELECTOR, "td:nth-child(3)").text.strip(),
                "Status": r.find_element(By.CSS_SELECTOR, "td:nth-child(5)").text.strip(),
            }

            if need_detail:
                urls.append((base["NPSN"], base))
            else:
                sekolah_list.append(base)

    finally:
        try:
            driver.quit()
        except:
            pass

    if need_detail and urls:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futures = [ex.submit(fetch_detail_worker, u, fields) for u in urls]
            for fut in as_completed(futures):
                sekolah_list.append(fut.result())

    cleanup_safe_chrome()
    return sekolah_list