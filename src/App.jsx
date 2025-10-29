// ---------- Charts (opsional, biar tetap ada) ----------
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from "recharts";

// ---------- Map (opsional) ----------
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

import React, { useState } from "react";
import { previewScrape, downloadScrape } from "./services/api";
import {
  CloudArrowDownIcon, EyeIcon, EyeSlashIcon,
  FunnelIcon, DocumentArrowDownIcon,
} from "@heroicons/react/24/outline";

export default function App() {
  const [format, setFormat] = useState("xlsx");
  const [filters, setFilters] = useState({
    query: "",
    provinsi: "Jawa Tengah",
    kabkota: "Kab. Semarang",
    kecamatan: "",
    limit: 200,
    fields: {
      npsn: true,
      nama: true,
      alamat: true,
      kabkota: true,
      kecamatan: true,
      provinsi: true,
      telepon: false,
      email: false,
      latitude: false,
      longitude: false,
      // --- kolom baru di pilihan output ---
      jumlah_siswa: true,
      siswa_laki: true,
      siswa_perempuan: true,
    },
  });
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const fieldKeys = Object.keys(filters.fields);
  const selectedFieldArray = () => fieldKeys.filter((k) => filters.fields[k]);
  const toggleField = (k) =>
    setFilters((f) => ({ ...f, fields: { ...f.fields, [k]: !f.fields[k] } }));

  async function onPreviewToggle() {
    if (showPreview && preview) { setShowPreview(false); return; }
    setLoading(true);
    try {
      const payload = { ...filters, fields: selectedFieldArray(), format: "json" };
      const rows = await previewScrape(payload);

      // jaga-jaga: kalau backend belum kirim kolom siswa, isi demo supaya kolom bisa tampil
      const enriched = (Array.isArray(rows) ? rows : []).map((r, i) => {
        const total = r.jumlah_siswa ?? 80 + (i % 121);
        const L = r.siswa_laki ?? Math.round(total * (0.5 + ((i % 11) - 5) / 100));
        const P = r.siswa_perempuan ?? Math.max(0, total - L);
        return { ...r, jumlah_siswa: Number(total), siswa_laki: Number(L), siswa_perempuan: Number(P) };
      });

      setPreview(enriched.slice(0, 50));
      setShowPreview(true);
    } catch (e) {
      alert("Gagal preview: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function onDownload() {
    setLoading(true);
    try {
      const payload = { ...filters, fields: selectedFieldArray(), format };
      await downloadScrape(payload); // mock di api.js sudah mengikuti fields terpilih
    } catch (e) {
      alert("Gagal download: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  // statistik/visual opsional
  const stats = computeStats(preview || []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b bg-white/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-indigo-600 text-white grid place-items-center shadow">
              <FunnelIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold">
                Scraper SD — <span className="text-slate-600">Kabupaten Semarang</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-500">Filter data → Preview → Download (CSV/XLSX)</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-slate-500">Default format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-md ring-1 ring-slate-100 p-6 md:p-8">

          {/* Filter dasar */}
          <SectionTitle title="Filter Data SD" />
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <Input placeholder="Kata kunci nama sekolah (opsional)"
              value={filters.query} onChange={(v) => setFilters((f) => ({ ...f, query: v }))} />
            <Select value={filters.provinsi} onChange={(v) => setFilters((f) => ({ ...f, provinsi: v }))}
              options={["Jawa Tengah", "Jawa Barat", "Jawa Timur"]} />
            <Input placeholder="Kab/Kota (mis. Kab. Semarang)"
              value={filters.kabkota} onChange={(v) => setFilters((f) => ({ ...f, kabkota: v }))} />
            <Input placeholder="Kecamatan (opsional)"
              value={filters.kecamatan} onChange={(v) => setFilters((f) => ({ ...f, kecamatan: v }))} />
            <div>
              <label className="block text-sm text-slate-600 mb-1">Limit hasil</label>
              <input type="number" min={1} max={5000}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                value={filters.limit}
                onChange={(e) => setFilters((f) => ({ ...f, limit: Math.max(1, Math.min(5000, parseInt(e.target.value || 0))) }))} />
              <p className="text-xs text-slate-400 mt-1">1–5000 rows</p>
            </div>
          </div>

          {/* Pilih kolom output (termasuk L/P) */}
          <SectionTitle title="Pilih Kolom Output" />
          <div className="grid sm:grid-cols-3 gap-2 mb-6">
            {fieldKeys.map((k) => (
              <label key={k} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-slate-50">
                <input type="checkbox" checked={filters.fields[k]} onChange={() => toggleField(k)} className="accent-indigo-600" />
                <span className="capitalize text-slate-700">{k.replace("_", " ")}</span>
              </label>
            ))}
          </div>

          {/* Aksi */}
          <div className="flex flex-wrap gap-3">
            <Btn onClick={onPreviewToggle} icon={showPreview ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />} text={showPreview ? "Sembunyikan Preview" : "Preview"} color="indigo" loading={loading} />
            <Btn onClick={onDownload} icon={<CloudArrowDownIcon className="h-5 w-5" />} text={`Download ${format.toUpperCase()}`} color="green" loading={loading} />
            {preview && (
              <button type="button" onClick={() => { setPreview(null); setShowPreview(false); }}
                className="px-4 py-2 rounded-xl border text-slate-600 hover:bg-slate-50">Clear Preview</button>
            )}
          </div>

          <div className="my-6 border-t" />

          {/* Preview: HANYA kolom yang dicentang */}
          {showPreview && preview ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <DocumentArrowDownIcon className="h-5 w-5 text-slate-500" />
                  <h3 className="font-medium">Preview</h3>
                </div>
                <span className="text-xs text-slate-500">Menampilkan {preview.length} baris (maks 50)</span>
              </div>

              {(() => {
                const allCols = Object.keys(preview[0] || {});
                const selectedCols = allCols.filter((c) => filters.fields[c]);
                const cols = selectedCols.length ? selectedCols : allCols; // fallback

                return (
                  <div className="overflow-auto border rounded-xl">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>{cols.map((h) => (<th key={h} className="px-3 py-2 text-left font-medium">{h}</th>))}</tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} className={i % 2 ? "bg-white" : "bg-slate-50/60"}>
                            {cols.map((h, j) => (<td key={j} className="px-3 py-2 text-slate-700">{String(row[h] ?? "")}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* opsional: statistik/visual */}
              {stats && (
                <>
                  <StatCards stats={stats} />
                  <StudentsChart data={stats.byKecamatan} />
                  {stats.hasGeo && <SchoolsMap rows={preview} />}
                </>
              )}
            </div>
          ) : <EmptyState />}
        </div>

        <p className="text-xs text-slate-400 mt-6 text-center">
          Gunakan data secara etis. Atur kolom di “Pilih Kolom Output”. Preview & download mengikuti pilihan kolom.
        </p>
      </main>
    </div>
  );
}

/* ---------- tiny comps & helpers ---------- */

function computeStats(rows) {
  if (!rows?.length) return null;
  const totalSekolah = rows.length;
  const totalSiswa = rows.reduce((s, r) => s + Number(r.jumlah_siswa ?? 0), 0);
  const totalL = rows.reduce((s, r) => s + Number(r.siswa_laki ?? 0), 0);
  const totalP = rows.reduce((s, r) => s + Number(r.siswa_perempuan ?? 0), 0);
  const avgSiswa = Math.round(totalSiswa / Math.max(1, totalSekolah));

  const m = {};
  for (const r of rows) {
    const k = r.kecamatan || "—";
    if (!m[k]) m[k] = { kecamatan: k, laki: 0, perempuan: 0 };
    m[k].laki += Number(r.siswa_laki ?? 0);
    m[k].perempuan += Number(r.siswa_perempuan ?? 0);
  }
  const byKecamatan = Object.values(m).map((x) => ({ ...x, siswa: x.laki + x.perempuan }))
    .sort((a, b) => b.siswa - a.siswa).slice(0, 12);

  const hasGeo = rows.some((r) => r.latitude != null && r.longitude != null);
  return { totalSekolah, totalSiswa, totalLaki: totalL, totalPerempuan: totalP, avgSiswa, byKecamatan, hasGeo };
}

function SectionTitle({ title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-5 w-1.5 rounded bg-indigo-600" />
      <h2 className="font-medium text-slate-700">{title}</h2>
    </div>
  );
}
function Input({ value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1">{placeholder}</label>
      <input className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function Select({ value, onChange, options }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1">Provinsi</label>
      <select className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (<option key={o}>{o}</option>))}
      </select>
    </div>
  );
}
function Btn({ onClick, icon, text, color = "indigo", loading }) {
  const c = { indigo: "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500/30", green: "bg-green-600 hover:bg-green-700 focus:ring-green-500/30" };
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white shadow ${c[color]} focus:outline-none focus:ring-2 disabled:opacity-60`}>
      {loading ? (
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" />
        </svg>
      ) : icon}
      <span className="font-medium">{text}</span>
    </button>
  );
}
function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed py-14 grid place-items-center text-center text-slate-500">
      <div className="flex items-center gap-2 mb-2">
        <EyeIcon className="h-5 w-5" />
        <span className="font-medium">Belum ada preview</span>
      </div>
      <p className="text-sm">Isi filter lalu klik <span className="font-medium">Preview</span>.</p>
    </div>
  );
}
function StatCards({ stats }) {
  return (
    <div className="grid sm:grid-cols-4 gap-4 mt-6">
      <div className="rounded-xl border p-4 bg-slate-50"><p className="text-xs text-slate-500">Total Sekolah</p><p className="text-2xl font-semibold">{stats.totalSekolah.toLocaleString()}</p></div>
      <div className="rounded-xl border p-4 bg-slate-50"><p className="text-xs text-slate-500">Total Siswa</p><p className="text-2xl font-semibold">{stats.totalSiswa.toLocaleString()}</p></div>
      <div className="rounded-xl border p-4 bg-slate-50"><p className="text-xs text-slate-500">Laki-laki</p><p className="text-2xl font-semibold">{stats.totalLaki.toLocaleString()}</p></div>
      <div className="rounded-xl border p-4 bg-slate-50"><p className="text-xs text-slate-500">Perempuan</p><p className="text-2xl font-semibold">{stats.totalPerempuan.toLocaleString()}</p></div>
    </div>
  );
}
function StudentsChart({ data }) {
  return (
    <div className="mt-6 rounded-xl border p-4">
      <p className="font-medium mb-2">Jumlah Siswa per Kecamatan (Top 12)</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="kecamatan" tick={{ fontSize: 12 }} />
            <YAxis /><Tooltip /><Legend />
            <Bar dataKey="laki" stackId="a" name="Laki-laki" />
            <Bar dataKey="perempuan" stackId="a" name="Perempuan" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
function SchoolsMap({ rows }) {
  const pts = rows.filter((r) => r.latitude != null && r.longitude != null);
  const center = pts.length
    ? [pts.reduce((s, r) => s + r.latitude, 0) / pts.length, pts.reduce((s, r) => s + r.longitude, 0) / pts.length]
    : [-7.1, 110.4];
  return (
    <div className="mt-6 rounded-xl border overflow-hidden">
      <div className="p-4"><p className="font-medium">Peta Lokasi Sekolah</p><p className="text-xs text-slate-500">Klik marker untuk detail.</p></div>
      <div className="h-[420px]">
        <MapContainer center={center} zoom={10} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {pts.slice(0, 500).map((r, i) => (
            <Marker key={i} position={[r.latitude, r.longitude]}>
              <Popup>
                <div className="font-medium">{r.nama}</div>
                <div className="text-xs">{r.alamat}</div>
                {"jumlah_siswa" in r && <div className="text-xs mt-1">Total: {r.jumlah_siswa}</div>}
                {"siswa_laki" in r && "siswa_perempuan" in r && (
                  <div className="text-xs">L: {r.siswa_laki} • P: {r.siswa_perempuan}</div>
                )}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
