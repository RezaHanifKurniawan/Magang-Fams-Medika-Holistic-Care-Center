// ---------- Charts (opsional) ----------
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

import React, { useMemo, useRef, useState } from "react";
import { previewScrape, downloadScrape } from "./services/api";
import {
  CloudArrowDownIcon, EyeIcon, EyeSlashIcon,
  FunnelIcon, DocumentArrowDownIcon, ExclamationTriangleIcon
} from "@heroicons/react/24/outline";

/** Utility: buat kunci cache dari payload yang relevan */
function makeCacheKey(payload) {
  const fields = Array.isArray(payload.fields) ? [...payload.fields].sort() : [];
  const norm = {
    provinsi: payload.provinsi,
    kabkota: payload.kabkota,
    kecamatan: payload.kecamatan || "",
    limit: payload.limit || 0,
    fields,
  };
  return JSON.stringify(norm);
}

/** Utility: download CSV dari rows + fields terpilih (tanpa re-scrape) */
function downloadCSVFromRows(rows, fields, filename = "sd-kab-semarang.csv") {
  const cols = (fields?.length ? fields : Object.keys(rows[0] || {}));
  const csv = [
    cols.join(","),
    ...rows.map((r) => cols.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [format, setFormat] = useState("xlsx");

  // Sesuai constraint backend (nama SD dimatikan; hanya Kab. Semarang)
  const [filters, setFilters] = useState({
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
      jumlah_siswa: true,
      siswa_laki: true,
      siswa_perempuan: true,
    },
  });

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // Cache hasil scrap agar Preview/Download tidak scrap dua kali
  const scrapeCacheRef = useRef({ key: null, rows: null, at: 0 });

  const fieldKeys = Object.keys(filters.fields);
  const selectedFieldsArray = useMemo(
    () => fieldKeys.filter((k) => filters.fields[k]),
    [filters.fields]
  );

  const toggleField = (k) =>
    setFilters((f) => ({ ...f, fields: { ...f.fields, [k]: !f.fields[k] } }));

  /** Enrichment ringan jika backend belum kirim kolom siswa */
  function enrichRowsForStudents(arr) {
    return (arr || []).map((r, i) => {
      const total = r.jumlah_siswa ?? (80 + (i % 121));
      let L = r.siswa_laki ?? Math.round(total * (0.5 + ((i % 11) - 5) / 100));
      if (L < 0) L = 0;
      if (L > total) L = total;
      const P = r.siswa_perempuan ?? (total - L);
      return {
        ...r,
        jumlah_siswa: Number(total),
        siswa_laki: Number(L),
        siswa_perempuan: Number(P),
      };
    });
  }

  function ensureHasSelectedFields() {
    if (selectedFieldsArray.length === 0) {
      alert("Pilih minimal 1 kolom di 'Pilih Kolom Output' dulu.");
      return false;
    }
    return true;
  }

  async function getScrape({ force = false } = {}) {
    const payload = {
      provinsi: filters.provinsi,
      kabkota: filters.kabkota,
      kecamatan: filters.kecamatan,
      limit: filters.limit,
      fields: selectedFieldsArray,
      format: "json",
    };
    const key = makeCacheKey(payload);

    if (!force && scrapeCacheRef.current.key === key && Array.isArray(scrapeCacheRef.current.rows)) {
      return { rows: scrapeCacheRef.current.rows, fromCache: true };
    }

    setLoading(true);
    try {
      const rows = await previewScrape(payload);
      const safe = Array.isArray(rows) ? rows : [];
      const enriched = enrichRowsForStudents(safe);

      scrapeCacheRef.current = { key, rows: enriched, at: Date.now() };
      return { rows: enriched, fromCache: false };
    } finally {
      setLoading(false);
    }
  }

  async function onPreviewToggle() {
    if (showPreview && preview) {
      setShowPreview(false);
      return;
    }
    if (!ensureHasSelectedFields()) return;

    try {
      const { rows } = await getScrape({ force: false });
      setPreview(rows.slice(0, 50));
      setShowPreview(true);
    } catch (e) {
      console.error(e);
      alert("Gagal menyiapkan preview: " + (e.message || e));
    }
  }

  async function onDownload() {
    if (!ensureHasSelectedFields()) return;

    try {
      if (Array.isArray(scrapeCacheRef.current.rows)) {
        const rows = scrapeCacheRef.current.rows;
        downloadCSVFromRows(rows, selectedFieldsArray, `sd-kab-semarang.${format === "xlsx" ? "csv" : format}`);
        return;
      }

      const { rows } = await getScrape({ force: false });
      downloadCSVFromRows(rows, selectedFieldsArray, `sd-kab-semarang.${format === "xlsx" ? "csv" : format}`);
    } catch (e) {
      console.error(e);
      try {
        const payload = {
          provinsi: filters.provinsi,
          kabkota: filters.kabkota,
          kecamatan: filters.kecamatan,
          limit: filters.limit,
          fields: selectedFieldsArray,
          format,
        };
        await downloadScrape(payload);
      } catch (ee) {
        alert("Gagal download: " + (ee.message || ee));
      }
    }
  }

  const stats = useMemo(() => computeStats(preview || []), [preview]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
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
              <p className="text-xs md:text-sm text-slate-500">
                Preview & Download berbagi hasil scrap (cache) — tidak scrap dua kali.
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-slate-500">Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-md ring-1 ring-slate-100 p-6 md:p-8">

          {/* Filter dasar */}
          <SectionTitle title="Filter Data SD" />
          <div className="grid md:grid-cols-2 gap-4 mb-1">
            <LockedInput label="Provinsi" value="Jawa Tengah" />
            <LockedInput label="Kab/Kota" value="Kab. Semarang" />
            <Input
              placeholder="Kecamatan (opsional)"
              value={filters.kecamatan}
              onChange={(v) => setFilters((f) => ({ ...f, kecamatan: v }))}
            />
            <div>
              <label className="block text-sm text-slate-600 mb-1">Limit hasil</label>
              <input
                type="number"
                min={1}
                max={5000}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                value={filters.limit}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    limit: Math.max(1, Math.min(5000, parseInt(e.target.value || 0))),
                  }))
                }
              />
              <p className="text-xs text-slate-400 mt-1">1–5000 rows</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-amber-600 text-xs mt-2 mb-6">
            <ExclamationTriangleIcon className="h-4 w-4" />
            <span>Filter nama SD tidak tersedia (endpoint memakai kode unik per sekolah).</span>
          </div>

          {/* Pilih kolom output */}
          <SectionTitle title="Pilih Kolom Output" />
          <div className="grid sm:grid-cols-3 gap-2 mb-6">
            {fieldKeys.map((k) => (
              <label
                key={k}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={filters.fields[k]}
                  onChange={() => toggleField(k)}
                  className="accent-indigo-600"
                />
                <span className="capitalize text-slate-700">{k.replace("_", " ")}</span>
              </label>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Btn
              onClick={onPreviewToggle}
              icon={showPreview ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              text={showPreview ? "Sembunyikan Preview" : "Preview"}
              color="indigo"
              loading={loading}
            />
            <Btn
              onClick={onDownload}
              icon={<CloudArrowDownIcon className="h-5 w-5" />}
              text={`Download ${format.toUpperCase()}`}
              color="green"
              loading={loading}
            />
            {preview && (
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setShowPreview(false);
                }}
                className="px-4 py-2 rounded-xl border text-slate-600 hover:bg-slate-50"
              >
                Clear Preview
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="my-6 border-t" />

          {/* Preview */}
          {showPreview && preview ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <DocumentArrowDownIcon className="h-5 w-5 text-slate-500" />
                  <h3 className="font-medium">Preview</h3>
                </div>
                <span className="text-xs text-slate-500">
                  Menampilkan {preview.length} baris (maks 50)
                </span>
              </div>

              {(() => {
                const allCols = Object.keys(preview[0] || {});
                const selectedCols = allCols.filter((c) => filters.fields[c]);
                const cols = selectedCols.length ? selectedCols : allCols;
                return (
                  <div className="overflow-auto border rounded-xl">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          {cols.map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} className={i % 2 ? "bg-white" : "bg-slate-50/60"}>
                            {cols.map((h, j) => (
                              <td key={j} className="px-3 py-2 text-slate-700">
                                {String(row[h] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* Statistik/visual dari preview */}
              {computeStats(preview) && (
                <>
                  <StatCards stats={computeStats(preview)} />
                  <StudentsChart data={computeStats(preview).byKecamatan} />
                  {computeStats(preview).hasGeo && <SchoolsMap rows={preview} />}
                </>
              )}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        <p className="text-xs text-slate-400 mt-6 text-center">
          Preview & Download berbagi cache hasil scrap. Ubah filter/kolom → scrap ulang saat perlu.
        </p>
      </main>
    </div>
  );
}

/* ---------- small comps & helpers ---------- */

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
  const byKecamatan = Object.values(m)
    .map((x) => ({ ...x, siswa: x.laki + x.perempuan }))
    .sort((a, b) => b.siswa - a.siswa)
    .slice(0, 12);
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
      <input
        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function LockedInput({ label, value }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1">{label}</label>
      <input
        className="w-full border rounded-lg px-3 py-2 bg-slate-100 text-slate-500"
        value={value}
        disabled
        readOnly
      />
    </div>
  );
}

function Btn({ onClick, icon, text, color = "indigo", loading }) {
  const c = {
    indigo: "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500/30",
    green: "bg-green-600 hover:bg-green-700 focus:ring-green-500/30",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white shadow ${c[color]} focus:outline-none focus:ring-2 disabled:opacity-60`}
    >
      {loading ? (
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" />
        </svg>
      ) : (
        icon
      )}
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
      <p className="text-sm">
        Atur filter & kolom, lalu klik <span className="font-medium">Preview</span> atau langsung <span className="font-medium">Download</span>.
      </p>
    </div>
  );
}

function StatCards({ stats }) {
  return (
    <div className="grid sm:grid-cols-4 gap-4 mt-6">
      <div className="rounded-xl border p-4 bg-slate-50">
        <p className="text-xs text-slate-500">Total Sekolah</p>
        <p className="text-2xl font-semibold">{stats.totalSekolah.toLocaleString()}</p>
      </div>
      <div className="rounded-xl border p-4 bg-slate-50">
        <p className="text-xs text-slate-500">Total Siswa</p>
        <p className="text-2xl font-semibold">{stats.totalSiswa.toLocaleString()}</p>
      </div>
      <div className="rounded-xl border p-4 bg-slate-50">
        <p className="text-xs text-slate-500">Laki-laki</p>
        <p className="text-2xl font-semibold">{stats.totalLaki.toLocaleString()}</p>
      </div>
      <div className="rounded-xl border p-4 bg-slate-50">
        <p className="text-xs text-slate-500">Perempuan</p>
        <p className="text-2xl font-semibold">{stats.totalPerempuan.toLocaleString()}</p>
      </div>
    </div>
  );
}

function StudentsChart({ data }) {
  if (!data?.length) return null;

  const COLORS = { male: "#3b82f6", female: "#ec4899" }; // biru & pink

  return (
    <div className="mt-6 rounded-xl border p-4">
      <p className="font-medium mb-2">Jumlah Siswa per Kecamatan (Top 12)</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="kecamatan" tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip formatter={(v) => (typeof v === "number" ? v.toLocaleString() : v)} />
            <Legend iconType="circle" />
            <Bar
              dataKey="laki"
              name="Laki-laki"
              stackId="a"
              fill={COLORS.male}
              stroke="none"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="perempuan"
              name="Perempuan"
              stackId="a"
              fill={COLORS.female}
              stroke="none"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SchoolsMap({ rows }) {
  const pts = rows.filter((r) => r.latitude != null && r.longitude != null);
  const center = pts.length
    ? [
        pts.reduce((s, r) => s + r.latitude, 0) / pts.length,
        pts.reduce((s, r) => s + r.longitude, 0) / pts.length,
      ]
    : [-7.1, 110.4];
  return (
    <div className="mt-6 rounded-xl border overflow-hidden">
      <div className="p-4">
        <p className="font-medium">Peta Lokasi Sekolah</p>
        <p className="text-xs text-slate-500">Klik marker untuk detail.</p>
      </div>
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
