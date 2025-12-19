from flask import Flask, request, jsonify
from flask_cors import CORS
from scrapers import scrape_sd_kecamatan, load_kecamatan_list

app = Flask(__name__)
CORS(app)

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
            "POST /preview": "Preview scraped data (limited rows)",
            "POST /download": "Download full scraped data"
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
# PREVIEW (scrap 1x)
# ===============================
@app.route("/preview", methods=["POST"])
def preview():
    data = request.get_json()
    kec = data.get("kecamatan", "").strip()
    fields = data.get("fields", [])

    if not kec:
        return jsonify({"error": "Kecamatan wajib diisi"}), 400
    if not fields:
        return jsonify({"error": "Minimal 1 field wajib dipilih"}), 400

    rows = scrape_sd_kecamatan(kec, fields)

    return jsonify({
        "rows": rows[:2000]  # safety
    })


# ===============================
# DOWNLOAD (full rows)
# ===============================
@app.route("/download", methods=["POST"])
def download():
    data = request.get_json()
    kec = data.get("kecamatan", "").strip()
    fields = data.get("fields", [])

    if not kec:
        return jsonify({"error": "Kecamatan wajib diisi"}), 400
    if not fields:
        return jsonify({"error": "Minimal 1 field wajib dipilih"}), 400

    rows = scrape_sd_kecamatan(kec, fields)

    return jsonify({"rows": rows})
