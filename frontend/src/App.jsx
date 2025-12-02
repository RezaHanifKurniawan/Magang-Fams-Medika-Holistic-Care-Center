import {
  CloudArrowDownIcon, EyeIcon, EyeSlashIcon,
  FunnelIcon, DocumentArrowDownIcon, ExclamationTriangleIcon
} from "@heroicons/react/24/outline";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { fetchKecamatan, previewScrape } from "./services/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts";
import ExcelJS from "exceljs/dist/exceljs.min.js";
import {
  AlertSuccess,
  AlertError,
  AlertWarning,
  AlertConfirm,
  AlertLoading
} from "../utils/alert";


/* ==========================================================
   FIELD LIST – AUTO GENERATE FIELD_MAP
   ========================================================== */
const FIELD_LABELS = [
  "Nama Sekolah",
  "Kelurahan",
  "NPSN",
  "Status",
  "Kepala Sekolah",
  "Alamat",
  "Telepon",
  "Email",
  "Website",
  "Yayasan",
  "Jumlah Siswa Laki-laki",
  "Jumlah Siswa Perempuan",
];

const FIELD_MAP = FIELD_LABELS.reduce((acc, label) => {
  const key = label.toLowerCase().replace(/\s+/g, "_");
  acc[key] = { label, backend: label };
  return acc;
}, {});

/* ==========================================================
   PRIORITAS KOLOM + NO URUT
   ========================================================== */
const COLUMN_ORDER = [
  "No",
  "Nama Sekolah",
  "Kelurahan",
  "NPSN",
  "Status",
  "Kepala Sekolah",
  "Alamat",
  "Telepon",
  "Email",
  "Website",
  "Yayasan",
  "Jumlah Siswa Laki-laki",
  "Jumlah Siswa Perempuan"
];

/* ==========================================================
   CSV / XLSX EXPORT
   ========================================================== */
function exportData(rows, filename, format) {
  const ordered = rows.map(r => {
    const obj = {};
    COLUMN_ORDER.forEach(c => {
      obj[c] = r[c] ?? "";
    });
    return obj;
  });

  if (format === "csv") {
    const header = COLUMN_ORDER.join(",");
    const lines = ordered.map(row =>
      COLUMN_ORDER.map(c => JSON.stringify(row[c] ?? "")).join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    return;
  }

  // XLSX via ExcelJS (browser-safe)
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");

    sheet.addRow(COLUMN_ORDER);   // Header

    ordered.forEach(row => {
      sheet.addRow(COLUMN_ORDER.map(c => row[c] ?? ""));
    });

    // Auto column width
    sheet.columns.forEach(col => {
      let max = 10;
      col.eachCell(cell => {
        max = Math.max(max, String(cell.value).length);
      });
      col.width = max + 2;
    });

    workbook.xlsx.writeBuffer().then(buffer => {
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });

    return;
  }
}

/* ==========================================================
   SORT PRIORITY FOR PREVIEW TABLE
   ========================================================== */
const SORT_PRIORITY = [
  "Kelurahan",
  "Nama Sekolah",
  "NPSN",
  "Status",
  "Kepala Sekolah",
  "Alamat",
  "Telepon",
  "Email",
  "Website",
  "Yayasan",
  "Jumlah Siswa Laki-laki",
  "Jumlah Siswa Perempuan"
];

/* ==========================================================
   Helpers CONVERT TO INT
   ========================================================== */
function toInt(v) {
  const n = parseInt(String(v).replace(/\D+/g, ""), 10);
  return isNaN(n) ? 0 : n;
}


/* ==========================================================
   MAIN COMPONENT
   ========================================================== */
export default function App() {

  const [format, setFormat] = useState("xlsx");
  const [filters, setFilters] = useState({
    provinsi: "Jawa Tengah",
    kabkota: "Kab. Semarang",
    kecamatan: ""
  });

  const [allKecamatan, setAllKecamatan] = useState([]);
  const [kecSuggestions, setKecSuggestions] = useState([]);

  const [fieldStatus, setFieldStatus] = useState(
    Object.keys(FIELD_MAP).reduce((acc, k) => {
      acc[k] = false;
      return acc;
    }, {})
  );

  const [scrapStarted, setScrapStarted] = useState(false);
  const [loading, setLoading] = useState(false);

  const cacheRef = useRef({ key: null, rows: null });

  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  /* ==========================================================
     LOAD KECAMATAN LIST
     ========================================================== */
  useEffect(() => {
    fetchKecamatan().then(list => setAllKecamatan(list || []));
  }, []);

  /* ==========================================================
     AUTOCOMPLETE
     ========================================================== */
  const updateSuggestions = (q) => {
    if (!q) return setKecSuggestions([]);
    const lower = q.toLowerCase();

    const prefix = allKecamatan.filter(x =>
      x.toLowerCase().startsWith(lower)
    );

    const contains = allKecamatan.filter(x =>
      !x.toLowerCase().startsWith(lower) &&
      x.toLowerCase().includes(lower)
    );

    setKecSuggestions([...prefix, ...contains].slice(0, 10));
  };

  /* ==========================================================
     FIELD PROCESSING
     ========================================================== */
  const selectedFieldKeys = Object.keys(fieldStatus).filter(k => fieldStatus[k]);
  const fieldsForBackend = selectedFieldKeys.map(k => FIELD_MAP[k].backend);

  function makeCacheKey() {
    return JSON.stringify({
      kecamatan: filters.kecamatan,
      fields: fieldsForBackend.slice().sort()
    });
  }

  async function getScrape({ force = false } = {}) {
    const key = makeCacheKey();

    if (!force && cacheRef.current.key === key) {
      return cacheRef.current.rows;
    }

    setLoading(true);
    try {
      const data = await previewScrape({
        kecamatan: filters.kecamatan,
        fields: fieldsForBackend
      });

      let rows = Array.isArray(data?.rows) ? data.rows : [];

      // === SORTING SESUAI PRIORITAS ===
      rows.sort((a, b) => {
        for (const key of SORT_PRIORITY) {
          const av = String(a[key] ?? "").toLowerCase();
          const bv = String(b[key] ?? "").toLowerCase();
          if (av < bv) return -1;
          if (av > bv) return 1;
        }
        return 0;
      });

      // Tambahkan kolom No dan urutkan sesuai order
      const finalRows = rows.map((r, idx) => ({
        No: idx + 1,
        ...r
      }));

      cacheRef.current = { key, rows: finalRows };
      return finalRows;
    } finally {
      setLoading(false);
    }
  }

  /* ==========================================================
     MULAI SCRAP
     ========================================================== */
  async function onStartScrap() {
    if (!filters.kecamatan.trim()) {
      AlertWarning("Nama kecamatan wajib diisi.");
      return;
    }
    if (fieldsForBackend.length === 0) {
      AlertWarning("Pilih minimal 1 kolom!");
      return;
    }

    // ============= RESET FE =============
    setShowPreview(false);     // sembunyikan preview
    setPreview(null);          // clear preview
    setScrapStarted(false);    // toggle ulang
    cacheRef.current = { key: null, rows: null }; // reset cache
    // =====================================

    AlertLoading("Sedang melakukan scraping...");

    try {
      await getScrape({ force: true });
      setScrapStarted(true);

      AlertSuccess("Scraping selesai! Anda dapat membuka Preview atau Download data.");

    } catch (e) {
      AlertError("Terjadi kesalahan saat memproses data.");
    }
  }

  /* ==========================================================
     PREVIEW
     ========================================================== */
  async function onPreviewToggle() {
    if (!scrapStarted) return;
    if (showPreview) {
      setShowPreview(false);
      return;
    }

    const rows = await getScrape({ force: false });
    setPreview(rows.slice(0, 5));
    setShowPreview(true);
  }

  /* ==========================================================
     DOWNLOAD
     ========================================================== */
  async function onDownload() {
    if (!scrapStarted) return;

    const rows = await getScrape({ force: false });

    const ok = await AlertConfirm(
      `Download data dalam format ${format.toUpperCase()}?`
    );
    if (!ok) return;

    const filename = `data_sd_${filters.kecamatan.replace(/\s+/g, "_")}.${format}`;

    exportData(rows, filename, format);
    AlertSuccess("Download berhasil!");
  }

  /* ==========================================================
     STATS
     ========================================================== */
  const stats = useMemo(() => {
    if (!cacheRef.current.rows) return null;

    const rows = cacheRef.current.rows;

    const totalSekolah = rows.length;
    const totalLaki = rows.reduce(
      (s, r) => s + toInt(r["Jumlah Siswa Laki-laki"]),
      0
    );

    const rataLaki = totalSekolah ? Math.round(totalLaki / totalSekolah) : 0;

    return {
      totalSekolah,
      totalLaki,
      rataLaki
    };
  }, [cacheRef.current.rows]);

  /* ==========================================================
     CHART DATA
     ========================================================== */
  const chartData = useMemo(() => {
    if (!cacheRef.current.rows) return [];

    return cacheRef.current.rows.map(r => ({
      sekolah: r["Nama Sekolah"],
      laki: toInt(r["Jumlah Siswa Laki-laki"])
    }));
  }, [cacheRef.current.rows]);

  /* ==========================================================
     RENDER
     ========================================================== */
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">

      {/* HEADER */}
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
                Preview & Download Data Sekolah Dasar perkecamatan.
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-slate-500">Format</span>
            <select
              value={format}
              onChange={e => setFormat(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-md ring-1 ring-slate-100 p-6 md:p-8">

          <SectionTitle title="Filter Data SD" />

          <div className="grid md:grid-cols-3 gap-4 mb-1">
            {/* Kecamatan */}
            <div className="relative">
              <label className="text-sm mb-1 block">Kecamatan <span className="text-red-600">*</span></label>
              <input
                className="w-full border rounded px-3 py-2"
                placeholder="Ketik kecamatan..."
                value={filters.kecamatan}
                onChange={e => {
                  const v = e.target.value;
                  setFilters(f => ({ ...f, kecamatan: v }));
                  updateSuggestions(v);
                }}
                onBlur={() => setTimeout(() => setKecSuggestions([]), 150)}
              />

              {kecSuggestions.length > 0 && (
                <div className="absolute bg-white border rounded w-full z-20 shadow max-h-40 overflow-auto">
                  {kecSuggestions.map(k => (
                    <div
                      key={k}
                      className="px-3 py-2 hover:bg-slate-100 cursor-pointer"
                      onMouseDown={() => {
                        setFilters(f => ({ ...f, kecamatan: k }));
                        setKecSuggestions([]);
                      }}
                    >
                      {k}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <LockedInput label="Kab/Kota" value="Kab. Semarang" />
            <LockedInput label="Provinsi" value="Jawa Tengah" />
          </div>

          {/* Warning */}
          <div
            className={`
              flex items-center gap-2 text-amber-600 text-xs mt-2 mb-4
              ${filters.kecamatan ? "invisible" : "visible"}
            `}
          >
            <ExclamationTriangleIcon className="h-4 w-4" />
            Nama kecamatan wajib diisi.
          </div>

          {/* PILIH KOLOM */}
          <SectionTitle title="Pilih Field Data" />

          {/* Warning */}
          <div
            className={`
              flex items-center gap-2 text-amber-600 text-xs mb-3
              ${selectedFieldKeys.length > 0 ? "invisible" : "visible"}
            `}
          >
            <ExclamationTriangleIcon className="h-4 w-4" />
            Pilih minimal 1 field data untuk melanjutkan proses scraping.
          </div>

          <div className="grid sm:grid-cols-3 gap-2 mb-6">
            {Object.keys(FIELD_MAP).map(k => (
              <label key={k} className="flex items-center gap-2 border rounded px-3 py-2">
                <input
                  type="checkbox"
                  checked={fieldStatus[k]}
                  onChange={() =>
                    setFieldStatus(s => ({ ...s, [k]: !s[k] }))
                  }
                />
                {FIELD_MAP[k].label}
              </label>
            ))}
          </div>

          {/* BUTTONS */}
          <div className="flex gap-3 flex-wrap">
            <Btn
              text="Mulai Scrap"
              color="red"
              icon={<FunnelIcon className="h-5 w-5" />}
              onClick={onStartScrap}
              loading={loading}
            />

            <Btn
              text={showPreview ? "Sembunyikan Preview" : "Preview"}
              color="indigo"
              icon={showPreview ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              disabled={!scrapStarted}
              onClick={onPreviewToggle}
              loading={loading}
            />

            <Btn
              text={`Download ${format.toUpperCase()}`}
              color="green"
              icon={<CloudArrowDownIcon className="h-5 w-5" />}
              disabled={!scrapStarted}
              onClick={onDownload}
              loading={loading}
            />
          </div>

          <div className="my-6 border-t" />

          {/* PREVIEW */}
          {showPreview && preview && preview.length > 0 ? (
            <PreviewTable preview={preview} fields={fieldsForBackend} />
          ) : (
            <EmptyState />
          )}

          {/* STAT CARDS */}
          {stats && (
            <StatCards stats={stats} />
          )}

          {/* CHART */}
          {chartData.length > 0 && (
            <StudentsChart
              data={chartData}
              kecamatan={filters.kecamatan}
            />
          )}

        </div>
      </main>
    </div>
  );
}

/* ==========================================================
   COMPONENTS KECIL
   ========================================================== */

function SectionTitle({ title }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="w-1.5 h-5 bg-indigo-600 rounded" />
      <h2 className="font-medium text-slate-700">{title}</h2>
    </div>
  );
}

function LockedInput({ label, value }) {
  return (
    <div>
      <label className="text-sm mb-1 block">{label}</label>
      <input
        className="w-full border rounded px-3 py-2 bg-slate-100"
        value={value}
        disabled
      />
    </div>
  );
}

function Btn({ text, color, icon, onClick, disabled, loading }) {
  const colorClass = {
    indigo: "bg-indigo-600 hover:bg-indigo-700",
    red: "bg-red-600 hover:bg-red-700",
    green: "bg-green-600 hover:bg-green-700"
  }[color];

  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2 text-white rounded-xl shadow 
        ${colorClass}
        disabled:opacity-60
        ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {loading ? (
        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : icon}
      {text}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed rounded-xl py-14 grid place-items-center text-slate-500">
      <div className="flex items-center gap-2 mb-2">
        <EyeIcon className="h-5 w-5" />
        <span className="font-medium">Belum ada preview</span>
      </div>
      <p className="text-sm text-center">
        Klik <span className="font-medium">Mulai Scrap</span> kemudian buka <span className="font-medium">Preview</span>.
      </p>
    </div>
  );
}

/* ==========================================================
    PREVIEW TABLE
    ========================================================== */

function PreviewTable({ preview, fields }) {
  const cols = ["No", ...fields];
  return (
    <div className="overflow-auto border rounded-2xl mb-6 shadow-sm">
      <table className="min-w-full text-sm table-auto">
        <thead className="bg-indigo-600 text-white">
          <tr>
            {cols.map(c => (
              <th
                key={c}
                className="px-4 py-3 text-left font-semibold whitespace-nowrap text-[14px]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="text-slate-700">
          {preview.map((row, i) => (
            <tr
              key={i}
              className={
                "border-b hover:bg-indigo-50 transition-colors " +
                (i % 2 ? "bg-white" : "bg-slate-50/40")
              }
            >
              {cols.map(c => (
                <td
                  key={c}
                  className="px-4 py-2 whitespace-nowrap text-[13.5px] font-medium"
                >
                  {row[c] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/* ==========================================================
   STAT CARDS
   ========================================================== */
function StatCards({ stats }) {
  return (
    <div className="grid sm:grid-cols-3 gap-4 my-6">

      {/* Total Sekolah */}
      <div className="p-4 rounded-xl border bg-slate-50">
        <p className="text-xs text-slate-500">Total Sekolah</p>
        <p className="text-2xl font-semibold">{stats.totalSekolah}</p>
      </div>

      {/* Total Siswa Laki-laki */}
      <div className="p-4 rounded-xl border bg-slate-50">
        <p className="text-xs text-slate-500">Total Siswa Laki-laki</p>
        <p className="text-2xl font-semibold">{stats.totalLaki}</p>
      </div>

      {/* Rata-rata Laki-laki */}
      <div className="p-4 rounded-xl border bg-slate-50">
        <p className="text-xs text-slate-500">Rata-rata Siswa Laki-laki per Sekolah</p>
        <p className="text-2xl font-semibold">{stats.rataLaki}</p>
      </div>

    </div>
  );
}

/* ==========================================================
   CHART BAR – siswa laki-laki / sekolah
   ========================================================== */
function StudentsChart({ data, kecamatan }) {
  return (
    <div className="mt-6 border rounded-xl p-4">
      <p className="font-medium mb-3">Jumlah Siswa Laki-laki per Sekolah di {kecamatan}</p>

      <div className="h-80 overflow-x-auto">
        <ResponsiveContainer width={data.length * 80} height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="sekolah" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="laki" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
