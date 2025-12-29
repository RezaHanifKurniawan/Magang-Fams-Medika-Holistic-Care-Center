// =============================
// BASE URL (local dev)
// =============================
export const BASE_URL = "http://127.0.0.1:8000";


// =============================
// GET LIST KECAMATAN
// =============================
export async function fetchKecamatan() {
  try {
    const res = await fetch(`${BASE_URL}/kecamatan`);
    if (!res.ok) throw new Error("Gagal mengambil kecamatan");
    return await res.json();
  } catch (err) {
    console.error("fetchKecamatan error:", err);
    return [];
  }
}

// =============================
// SCRAPER DATA
// =============================
export async function startScrape(payload) {
  const res = await fetch(`${BASE_URL}/scrape_sd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.json();
    throw new Error(msg.error || "Gagal scraping");
  }

  return await res.json();
}



// =============================
// PREVIEW SCRAPE
// =============================
export async function previewScrape() {
  const res = await fetch(`${BASE_URL}/preview`);
  return await res.json();
}


// =============================
// DOWNLOAD SCRAPE
// =============================
export async function downloadScrape() {
  const res = await fetch(`${BASE_URL}/download`);
  return await res.json();
}
