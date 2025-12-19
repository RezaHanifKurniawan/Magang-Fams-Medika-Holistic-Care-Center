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
// PREVIEW SCRAPE
// =============================
// Body:
//   {
//     kecamatan: "...",
//     fields: [ "Nama Sekolah", "NPSN", ... ]
//   }
export async function previewScrape(payload) {
  try {
    const res = await fetch(`${BASE_URL}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const msg = await res.json();
      throw new Error(msg.error || "Gagal preview");
    }

    return await res.json(); // { rows: [...] }
  } catch (err) {
    console.error("previewScrape error:", err);
    throw err;
  }
}


// =============================
// DOWNLOAD SCRAPE (FULL ROWS)
// =============================
export async function downloadScrape(payload) {
  try {
    const res = await fetch(`${BASE_URL}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const msg = await res.json();
      throw new Error(msg.error || "Gagal download");
    }

    return await res.json(); // { rows: [...] }
  } catch (err) {
    console.error("downloadScrape error:", err);
    throw err;
  }
}
