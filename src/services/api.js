// src/services/api.js
// Set true untuk mock lokal; ubah ke false kalau backend sudah ready
const USE_MOCK = true;
const BASE_URL = "http://localhost:8000";

// Mock data generator (sudah ada kolom siswa)
function genMockRows({ limit = 200, kabkota = "Kab. Semarang", provinsi = "Jawa Tengah", kecamatan = "" }) {
  const kecList = kecamatan ? [kecamatan] : ["Banyubiru", "Ambarawa", "Bawen", "Ungaran Barat", "Ungaran Timur", "Bringin", "Bergas", "Bancak"];
  return Array.from({ length: Math.min(500, limit) }, (_, i) => {
    const kc = kecList[i % kecList.length];
    const total = 80 + (i % 121);
    const laki = Math.round(total * (0.48 + (i % 7) / 100));
    const perempuan = Math.max(0, total - laki);
    return {
      npsn: String(120000 + i),
      nama: `SD Negeri ${i + 1} ${kc}`,
      alamat: `Jl. Contoh No.${i + 1}`,
      kabkota,
      kecamatan: kc,
      provinsi,
      latitude: -7.15 - (i % 50) * 0.002,
      longitude: 110.42 + (i % 50) * 0.002,
      jumlah_siswa: total,
      siswa_laki: laki,
      siswa_perempuan: perempuan,
    };
  });
}

export async function previewScrape(payload) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    return genMockRows(payload);
  }
  const res = await fetch(`${BASE_URL}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
}

export async function downloadScrape(payload) {
  if (USE_MOCK) {
    const rows = genMockRows(payload);
    // gunakan fields terpilih (array of string) bila tersedia
    const fields = Array.isArray(payload.fields) && payload.fields.length
      ? payload.fields
      : Object.keys(rows[0] || {});

    const csv = [
      fields.join(","),
      ...rows.map((r) => fields.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // mock: jika user pilih XLSX, tetap CSV agar simpel
    a.download = `sd-kab-semarang.${payload.format === "xlsx" ? "csv" : payload.format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const res = await fetch(`${BASE_URL}/api/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sd-kab-semarang.${payload.format || "xlsx"}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
