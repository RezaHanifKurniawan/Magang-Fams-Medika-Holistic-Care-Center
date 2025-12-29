from flask import Flask, request, jsonify
from flask_cors import CORS
from scrapers import scrape_sd_kecamatan, load_kecamatan_list

app = Flask(__name__)
CORS(app)

SCRAPE_CACHE = {
    "rows": None,
    "kecamatan": None,
    "fields": None
}

# ===============================
# ROOT ENDPOINT
# ===============================
@app.route("/", methods=["GET"])
def root():
    return {
        "status": "Backend SD Scraper is running",
        "endpoints": {
            "GET /kecamatan": "Get list of kecamatan",
            "POST /scrape_sd": "Scrape SD/MI data by kecamatan",
            "GET /preview": "Preview scraped data (limited rows)",
            "GET /download": "Download full scraped data"
        }
    }, 200

# ===============================
# LIST KECAMATAN FOR AUTOCOMPLETE
# ===============================
@app.route("/kecamatan", methods=["GET"])
def kecamatan():
    try:
        return jsonify(load_kecamatan_list())
    except:
        return jsonify([])

# ===============================
# SCRAPING MODUL
# ===============================
@app.route("/scrape_sd", methods=["POST"])
def scrape_sd():
    data = request.get_json()
    kec = data.get("kecamatan", "").strip()
    fields = data.get("fields", [])

    if not kec:
        return jsonify({"error": "Kecamatan wajib diisi"}), 400
    if not fields:
        return jsonify({"error": "Minimal 1 field wajib dipilih"}), 400

    rows = scrape_sd_kecamatan(kec, fields)

    # SIMPAN HASIL SCRAPING
    SCRAPE_CACHE["rows"] = rows
    SCRAPE_CACHE["kecamatan"] = kec
    SCRAPE_CACHE["fields"] = fields

    return jsonify({
        "status": "success",
        "total_rows": len(rows)
    })


# ===============================
# PREVIEW
# ===============================
@app.route("/preview", methods=["GET"])
def preview():
    if not SCRAPE_CACHE["rows"]:
        return jsonify({"rows": []})

    return jsonify({
        "rows": SCRAPE_CACHE["rows"]
    })


# ===============================
# DOWNLOAD
# ===============================
@app.route("/download", methods=["GET"])
def download():
    if not SCRAPE_CACHE["rows"]:
        return jsonify({"rows": []})

    return jsonify({
        "rows": SCRAPE_CACHE["rows"]
    })

