/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import mammoth from 'mammoth';

// Types for Gemini JSON response
interface InputDipakai {
  platform?: string;
  audiens?: string;
  tujuan?: string;
  gaya?: string;
  kecepatan_bicara?: number;
  catatan_khusus?: string;
}

interface SkorKesiapanItem {
  aspek: 'Kelengkapan' | 'Struktur' | 'Audiens' | 'Durasi' | 'FYP' | string;
  status: 'baik' | 'perlu_perbaikan' | 'kurang' | string;
  ringkasan: string;
}

interface KelengkapanKosongItem {
  lokasi: string;
  bagian: string;
  saran_isi: string;
}

interface KelengkapanData {
  lengkap: boolean;
  kosong?: KelengkapanKosongItem[];
}

interface StrukturItem {
  elemen: 'Hook' | 'Hold' | 'Isi dan Pattern Interrupt' | 'Climax' | 'CTA' | 'Loop' | string;
  status: 'kuat' | 'lemah' | 'belum_ada' | 'opsional' | string;
  temuan: string;
  rekomendasi: string;
}

interface AudiensData {
  target_terbaca: string;
  kesesuaian: 'sesuai' | 'kurang_sesuai' | 'tidak_sesuai' | string;
  temuan: string;
  rekomendasi: string;
}

interface SceneItem {
  scene: string;
  estimasi_detik: number;
  catatan: string;
}

interface DurasiData {
  target_detik: number;
  estimasi_detik: number;
  status: 'sesuai' | 'kurang' | 'melebihi' | string;
  perkiraan?: boolean;
  catatan_target?: string;
  per_scene?: SceneItem[];
  asumsi?: string;
  rekomendasi?: string;
}

interface FypData {
  saran_naskah?: string[];
  visual_3_detik_pertama?: string[];
  audio?: string[];
}

interface SaranPerubahanItem {
  prioritas: 'tinggi' | 'sedang' | 'rendah' | string;
  lokasi: string;
  teks_sekarang: string;
  masalah: string;
  rekomendasi: string;
  contoh_revisi: string;
  dampak: string;
}

interface AnalysisResult {
  input_dipakai?: InputDipakai;
  skor_kesiapan?: SkorKesiapanItem[];
  kelengkapan?: KelengkapanData;
  struktur?: StrukturItem[];
  audiens?: AudiensData;
  durasi?: DurasiData;
  fyp?: FypData;
  saran_perubahan?: SaranPerubahanItem[];
  langkah_berikutnya?: string[];
}

const SPEED_MAP: Record<string, number> = {
  Pelan: 2.0,
  Normal: 2.5,
  Cepat: 3.0,
};

function formatSecondsToMinSec(totalSec: number): string {
  const rounded = Math.round(totalSec);
  if (rounded <= 0) return '0 detik';
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (mins === 0) return `${secs} detik`;
  if (secs === 0) return `${mins} menit`;
  return `${mins} menit ${secs} detik`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_MESSAGES = [
  'Lagi baca naskahmu...',
  'Ngecek struktur video...',
  'Ngitung durasi...',
  'Nyiapin saran buat kamu...',
];

export default function App() {
  // Step 1: File state
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Target Duration
  const [minutes, setMinutes] = useState<string>('');
  const [seconds, setSeconds] = useState<string>('');

  // Optional inputs
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [platform, setPlatform] = useState<string>('');
  const [targetAudiens, setTargetAudiens] = useState<string>('');
  const [tujuanVideo, setTujuanVideo] = useState<string>('');
  const [gayaVideo, setGayaVideo] = useState<string>('');
  const [kecepatanBicara, setKecepatanBicara] = useState<'Pelan' | 'Normal' | 'Cepat'>('Normal');
  const [catatanKhusus, setCatatanKhusus] = useState<string>('');

  // Process / Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [statusMessageIndex, setStatusMessageIndex] = useState<number>(0);
  const [busyRetryText, setBusyRetryText] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [generalError, setGeneralError] = useState<string>('');

  // Section collapse state (default open)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    skor: true,
    kelengkapan: true,
    struktur: true,
    audiens: true,
    durasi: true,
    fyp: true,
    saran: true,
    langkah: true,
  });

  // Copied state per item
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);

  // Total seconds calculation
  const totalDurationSeconds =
    (parseInt(minutes, 10) || 0) * 60 + (parseInt(seconds, 10) || 0);

  const isFormValid = !!file && totalDurationSeconds >= 5;

  // Validation warning for submit button
  const getDisabledReason = () => {
    if (!file && totalDurationSeconds < 5) {
      return 'Pilih file naskah dan isi target durasi dulu ya';
    }
    if (!file) {
      return 'Pilih file dulu ya';
    }
    if (totalDurationSeconds < 5) {
      return 'Isi target durasi dulu ya (minimal 5 detik)';
    }
    return '';
  };

  // Rotating loading messages
  useEffect(() => {
    let interval: any;
    if (isAnalyzing) {
      interval = setInterval(() => {
        setStatusMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
      }, 3000);
    } else {
      setStatusMessageIndex(0);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  // File handler & validation
  const handleFileSelect = (selectedFile: File) => {
    setFileError('');
    setGeneralError('');
    const fileName = selectedFile.name.toLowerCase();

    // Check file size (max 5 MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setFileError('Filenya terlalu besar (maks 5 MB), coba kecilkan dulu ya.');
      setFile(null);
      return;
    }

    // Check old .doc
    if (fileName.endsWith('.doc')) {
      setFileError('File .doc belum bisa dibaca. Simpan dulu sebagai .docx atau PDF, lalu upload ulang ya.');
      setFile(null);
      return;
    }

    // Check supported types
    const isDocx = fileName.endsWith('.docx');
    const isPdf = fileName.endsWith('.pdf');
    if (!isDocx && !isPdf) {
      setFileError('Format belum didukung. Upload PDF atau Word (.docx) ya.');
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Duration adjustments
  const adjustMinutes = (delta: number) => {
    const current = parseInt(minutes, 10) || 0;
    const nextVal = Math.max(0, current + delta);
    setMinutes(nextVal === 0 ? '' : nextVal.toString());
  };

  const adjustSeconds = (delta: number) => {
    const current = parseInt(seconds, 10) || 0;
    const nextVal = Math.max(0, Math.min(59, current + delta));
    setSeconds(nextVal === 0 ? '' : nextVal.toString());
  };

  const setPresetDuration = (m: number, s: number) => {
    setMinutes(m === 0 ? '' : m.toString());
    setSeconds(s === 0 ? '' : s.toString());
  };

  // Copy revised text helper
  const handleCopyRevision = (text: string, index: number) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex(null);
      }, 2000);
    }
  };

  // Build input block
  const buildInputBlock = () => {
    const speedVal = SPEED_MAP[kecepatanBicara] || 2.5;
    return `TARGET_DURASI_DETIK: ${totalDurationSeconds}
PLATFORM: ${platform.trim() ? platform : 'tidak diisi'}
TARGET_AUDIENS: ${targetAudiens.trim() ? targetAudiens : 'tidak diisi'}
TUJUAN_VIDEO: ${tujuanVideo.trim() ? tujuanVideo : 'tidak diisi'}
GAYA_VIDEO: ${gayaVideo.trim() ? gayaVideo : 'tidak diisi'}
KECEPATAN_BICARA_KATA_PER_DETIK: ${speedVal.toFixed(1)}
CATATAN_KHUSUS: ${catatanKhusus.trim() ? catatanKhusus : 'tidak diisi'}`;
  };

  // Convert docx to ordered structured lines
  const parseDocx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const lines: string[] = [];

    for (const child of Array.from(doc.body.children)) {
      const tag = child.tagName.toLowerCase();
      if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        const text = child.textContent?.trim();
        if (text) lines.push(text);
      } else if (['ul', 'ol'].includes(tag)) {
        for (const li of Array.from(child.querySelectorAll('li'))) {
          const text = li.textContent?.trim();
          if (text) lines.push(text);
        }
      } else if (tag === 'table') {
        for (const tr of Array.from(child.querySelectorAll('tr'))) {
          const cells = Array.from(tr.querySelectorAll('th, td'));
          const cellTexts = cells.map((cell) => {
            const paragraphs = Array.from(cell.querySelectorAll('p'));
            if (paragraphs.length > 1) {
              return paragraphs
                .map((p) => p.textContent?.trim())
                .filter(Boolean)
                .join(' / ');
            }
            return cell.textContent?.trim() || '';
          });
          lines.push('[BARIS TABEL] ' + cellTexts.join(' | '));
        }
      } else {
        const text = child.textContent?.trim();
        if (text) lines.push(text);
      }
    }

    let naskahTeks = lines.join('\n');
    if (naskahTeks.length < 50) {
      try {
        const raw = await mammoth.extractRawText({ arrayBuffer });
        if (raw.value && raw.value.length > naskahTeks.length) {
          naskahTeks = raw.value;
        }
      } catch (e) {
        // use whatever was extracted
      }
    }
    return naskahTeks;
  };

  // Convert file to base64 for PDF
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Index = result.indexOf(';base64,');
        if (base64Index !== -1) {
          resolve(result.substring(base64Index + 8));
        } else {
          resolve(result);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  // Core API call with automatic retries for JSON parse and 429/503 errors
  const executeAnalysis = async () => {
    if (!file || totalDurationSeconds < 5) return;

    setIsAnalyzing(true);
    setGeneralError('');
    setBusyRetryText('');

    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      const inputBlock = buildInputBlock();
      let payload: any = {};

      if (isPdf) {
        let base64: string;
        try {
          base64 = await readFileAsBase64(file);
        } catch (e) {
          setGeneralError('Gagal membaca file PDF. Pastikan file dapat dibuka dan coba lagi.');
          setIsAnalyzing(false);
          return;
        }
        if (!base64 || base64.length < 50) {
          setGeneralError('Naskahnya belum kebaca. Pastikan file tidak diproteksi password dan bukan file kosong, lalu upload ulang ya.');
          setIsAnalyzing(false);
          return;
        }
        payload = {
          type: 'pdf',
          fileBase64: base64,
          mimeType: 'application/pdf',
          inputBlock,
        };
      } else {
        // Docx
        let naskahTeks = '';
        try {
          naskahTeks = await parseDocx(file);
        } catch (e) {
          setGeneralError('Naskahnya belum kebaca. Pastikan file tidak diproteksi password dan bukan file kosong, lalu upload ulang ya.');
          setIsAnalyzing(false);
          return;
        }
        if (!naskahTeks || naskahTeks.trim().length < 10) {
          setGeneralError('Naskahnya belum kebaca. Pastikan file tidak diproteksi password dan bukan file kosong, lalu upload ulang ya.');
          setIsAnalyzing(false);
          return;
        }
        payload = {
          type: 'text',
          content: `${inputBlock}\n\nNASKAH:\n${naskahTeks}`,
        };
      }

      // Retry mechanism:
      // - Max 2 auto-retries for JSON parse failure with added instruction
      // - Max 2 auto-retries for 429/503 errors with 6-second wait
      let attempts = 0;
      let busyAttempts = 0;
      let parseAttempts = 0;
      let successData: AnalysisResult | null = null;
      let lastErrorMessage = '';

      while (attempts < 6) {
        attempts++;
        try {
          const reqBody = { ...payload };
          if (parseAttempts > 0) {
            reqBody.retryAddition =
              'Kembalikan HANYA JSON valid sesuai skema, tanpa teks lain, dan perpendek setiap teks.';
          }

          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody),
          });

          // Check busy statuses (429 or 503)
          if (res.status === 429 || res.status === 503) {
            if (busyAttempts < 2) {
              busyAttempts++;
              setBusyRetryText('Server lagi sibuk, mencoba lagi...');
              await new Promise((r) => setTimeout(r, 6000));
              setBusyRetryText('');
              continue;
            } else {
              lastErrorMessage = 'Server lagi sibuk. Coba lagi dalam beberapa saat ya.';
              break;
            }
          }

          const data = await res.json();

          if (data.success && data.data) {
            successData = data.data;
            break;
          } else if (data.error === 'json_parse_error') {
            if (parseAttempts < 2) {
              parseAttempts++;
              continue;
            } else {
              lastErrorMessage = 'Format analisis tidak terbaca.';
              break;
            }
          } else if (data.error === 'rate_limit' || data.error === 'service_unavailable') {
            if (busyAttempts < 2) {
              busyAttempts++;
              setBusyRetryText('Server lagi sibuk, mencoba lagi...');
              await new Promise((r) => setTimeout(r, 6000));
              setBusyRetryText('');
              continue;
            } else {
              lastErrorMessage = 'Server lagi sibuk. Coba lagi dalam beberapa saat ya.';
              break;
            }
          } else {
            lastErrorMessage = data.message || 'Analisis belum berhasil.';
            break;
          }
        } catch (fetchErr: any) {
          if (busyAttempts < 2) {
            busyAttempts++;
            setBusyRetryText('Server lagi sibuk, mencoba lagi...');
            await new Promise((r) => setTimeout(r, 6000));
            setBusyRetryText('');
            continue;
          } else {
            lastErrorMessage = 'Koneksi terganggu saat memproses naskah.';
            break;
          }
        }
      }

      setBusyRetryText('');

      if (successData) {
        setAnalysisResult(successData);
        // Smooth scroll to results
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      } else {
        setGeneralError(lastErrorMessage || 'Analisisnya belum berhasil. Coba lagi ya.');
      }
    } catch (e: any) {
      setGeneralError('Terjadi kesalahan saat memproses naskah. Coba lagi ya.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset file & result, keep duration and details, scroll top
  const handleUploadRevisi = () => {
    setFile(null);
    setAnalysisResult(null);
    setGeneralError('');
    setFileError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Calculate Duration in app code per requirements
  const targetDetik =
    analysisResult?.durasi?.target_detik || totalDurationSeconds;
  const perSceneList = analysisResult?.durasi?.per_scene || [];
  const calculatedTotalSeconds = perSceneList.reduce(
    (sum, sc) => sum + (Number(sc.estimasi_detik) || 0),
    0
  );
  const effectiveEstimasiTotal =
    calculatedTotalSeconds > 0
      ? calculatedTotalSeconds
      : Number(analysisResult?.durasi?.estimasi_detik) || 0;

  const selisihRatio =
    targetDetik > 0 ? (effectiveEstimasiTotal - targetDetik) / targetDetik : 0;
  const selisihPercent = Math.round(selisihRatio * 100);

  let computedDurationStatus: 'sesuai' | 'kurang' | 'melebihi' = 'sesuai';
  if (selisihRatio < -0.1) {
    computedDurationStatus = 'kurang';
  } else if (selisihRatio > 0.1) {
    computedDurationStatus = 'melebihi';
  } else {
    computedDurationStatus = 'sesuai';
  }

  // Determine current active steps
  const isStep1Done = !!file;
  const isStep2Done = totalDurationSeconds >= 5;
  const isStep3Done = !!analysisResult;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 pt-6 px-4 selection:bg-indigo-100 selection:text-indigo-900">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* HEADER */}
        <header className="text-center pt-2 pb-4">
          <div className="inline-flex items-center justify-center text-4xl mb-2 drop-shadow-sm">
            🎬
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            ScriptAnalyst
          </h1>
          <p className="mt-1.5 text-base sm:text-lg text-slate-600 font-medium">
            Upload naskahmu, isi target durasi, dapat rekomendasi dan contoh perbaikannya.
          </p>

          {/* 3 Steps Indicator */}
          <div className="mt-5 flex items-center justify-center gap-2 sm:gap-4 max-w-md mx-auto">
            {/* Step 1 */}
            <div className="flex items-center gap-1.5">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isStep1Done
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-indigo-600 text-white shadow-sm'
                }`}
              >
                {isStep1Done ? '✓' : '1'}
              </span>
              <span className={`text-xs sm:text-sm font-semibold ${isStep1Done ? 'text-emerald-700' : 'text-slate-700'}`}>
                Upload
              </span>
            </div>

            <div className={`h-0.5 w-6 sm:w-10 rounded ${isStep1Done ? 'bg-emerald-300' : 'bg-slate-200'}`} />

            {/* Step 2 */}
            <div className="flex items-center gap-1.5">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isStep2Done
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : isStep1Done
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {isStep2Done ? '✓' : '2'}
              </span>
              <span className={`text-xs sm:text-sm font-semibold ${isStep2Done ? 'text-emerald-700' : 'text-slate-700'}`}>
                Durasi
              </span>
            </div>

            <div className={`h-0.5 w-6 sm:w-10 rounded ${isStep2Done ? 'bg-emerald-300' : 'bg-slate-200'}`} />

            {/* Step 3 */}
            <div className="flex items-center gap-1.5">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isStep3Done
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : isStep2Done
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {isStep3Done ? '✓' : '3'}
              </span>
              <span className={`text-xs sm:text-sm font-semibold ${isStep3Done ? 'text-emerald-700' : 'text-slate-700'}`}>
                Analisis
              </span>
            </div>
          </div>
        </header>

        {/* LANGKAH 1: Upload Naskah */}
        <section className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">📄</span>
            <h2 className="text-lg font-bold text-slate-900">
              Langkah 1: Upload Naskah
            </h2>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all min-h-[160px] flex flex-col items-center justify-center ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                  : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/80'
              }`}
            >
              <div className="text-4xl mb-2">📄</div>
              <p className="text-base font-semibold text-slate-800">
                Tarik file ke sini atau klik untuk pilih
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                PDF atau Word (.docx), maks 5 MB. Hasil paling akurat: simpan naskahmu sebagai PDF.
              </p>
            </div>
          ) : (
            <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="text-2xl shrink-0">
                  {file.name.toLowerCase().endsWith('.pdf') ? '📕' : '📘'}
                </span>
                <div className="truncate">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-emerald-800 font-medium">
                    {formatFileSize(file.size)} • {file.name.toLowerCase().endsWith('.pdf') ? 'PDF Document' : 'Word (.docx)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors min-h-[36px]"
              >
                Ganti file
              </button>
            </div>
          )}

          {/* Validation Error Message */}
          {fileError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
              ⚠️ {fileError}
            </div>
          )}
        </section>

        {/* LANGKAH 2: Target Durasi (WAJIB) */}
        <section className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">⏱️</span>
            <h2 className="text-lg font-bold text-slate-900">
              Langkah 2: Target Durasi <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full ml-1">WAJIB</span>
            </h2>
          </div>

          <p className="text-xs text-slate-500 mb-3">
            Pilih durasi cepat atau atur sendiri target menit dan detiknya:
          </p>

          {/* Preset Pills */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {[
              { label: '30 dtk', m: 0, s: 30 },
              { label: '1 menit', m: 1, s: 0 },
              { label: '90 dtk', m: 1, s: 30 },
              { label: '3 menit', m: 3, s: 0 },
            ].map((preset) => {
              const isSelected =
                (parseInt(minutes, 10) || 0) === preset.m &&
                (parseInt(seconds, 10) || 0) === preset.s;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setPresetDuration(preset.m, preset.s)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all min-h-[36px] ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Two Large Numeric Input Columns */}
          <div className="grid grid-cols-2 gap-4">
            {/* Menit */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center">
              <label className="text-xs font-bold text-slate-600 mb-2">Menit</label>
              <div className="flex items-center justify-between w-full max-w-[150px]">
                <button
                  type="button"
                  onClick={() => adjustMinutes(-1)}
                  className="w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-700 active:scale-95 transition-all shadow-sm"
                  aria-label="Kurangi menit"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  max="60"
                  placeholder="0"
                  value={minutes}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setMinutes(val === '' ? '' : Math.min(60, parseInt(val, 10)).toString());
                  }}
                  className="w-14 text-center text-2xl font-black text-slate-900 bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustMinutes(1)}
                  className="w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-700 active:scale-95 transition-all shadow-sm"
                  aria-label="Tambah menit"
                >
                  +
                </button>
              </div>
            </div>

            {/* Detik */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center">
              <label className="text-xs font-bold text-slate-600 mb-2">Detik</label>
              <div className="flex items-center justify-between w-full max-w-[150px]">
                <button
                  type="button"
                  onClick={() => adjustSeconds(-5)}
                  className="w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-700 active:scale-95 transition-all shadow-sm"
                  aria-label="Kurangi detik"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="0"
                  value={seconds}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setSeconds(val === '' ? '' : Math.min(59, parseInt(val, 10)).toString());
                  }}
                  className="w-14 text-center text-2xl font-black text-slate-900 bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustSeconds(5)}
                  className="w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-700 active:scale-95 transition-all shadow-sm"
                  aria-label="Tambah detik"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Total Duration Note */}
          <div className="mt-3 text-center">
            <span className="text-xs text-slate-500 font-semibold font-mono">
              = {totalDurationSeconds} detik ({formatSecondsToMinSec(totalDurationSeconds)})
            </span>
          </div>
        </section>

        {/* DETAIL TAMBAHAN (Opsional) */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{showDetails ? '➖' : '➕'}</span>
              <span className="text-sm font-bold text-slate-800">
                Detail tambahan (opsional, bikin rekomendasi lebih pas)
              </span>
            </div>
            <span className="text-xs font-semibold text-indigo-600 ml-2">
              {showDetails ? 'Tutup' : 'Buka'}
            </span>
          </button>

          {showDetails && (
            <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Platform */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Platform tujuan
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {['IG Reels', 'TikTok', 'YouTube Shorts', 'Lainnya'].map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPlatform(platform === item ? '' : item)}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors min-h-[36px] ${
                          platform === item
                            ? 'bg-indigo-600 text-white font-semibold'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gaya / Nuansa Video */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Gaya / nuansa video
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Edukatif', 'Humor', 'Drama', 'Inspiratif', 'Lainnya'].map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setGayaVideo(gayaVideo === item ? '' : item)}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors min-h-[36px] ${
                          gayaVideo === item
                            ? 'bg-indigo-600 text-white font-semibold'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Audiens */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Target audiens
                  </label>
                  <input
                    type="text"
                    value={targetAudiens}
                    onChange={(e) => setTargetAudiens(e.target.value)}
                    placeholder="Contoh: ASN muda, mahasiswa, ibu rumah tangga"
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[44px]"
                  />
                </div>

                {/* Tujuan Video */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Tujuan/pesan utama video
                  </label>
                  <input
                    type="text"
                    value={tujuanVideo}
                    onChange={(e) => setTujuanVideo(e.target.value)}
                    placeholder="Contoh: mengajak penonton memahami nilai Adaptif"
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[44px]"
                  />
                </div>
              </div>

              {/* Kecepatan Bicara */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Kecepatan bicara
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['Pelan', 'Normal', 'Cepat'] as const).map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setKecepatanBicara(spd)}
                      className={`px-3.5 py-1.5 text-xs rounded-lg transition-colors min-h-[38px] ${
                        kecepatanBicara === spd
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium'
                      }`}
                    >
                      {spd} ({SPEED_MAP[spd]} kata/dtk)
                    </button>
                  ))}
                </div>
              </div>

              {/* Catatan Khusus */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Catatan khusus
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {catatanKhusus.length}/300
                  </span>
                </div>
                <textarea
                  maxLength={300}
                  rows={2}
                  value={catatanKhusus}
                  onChange={(e) => setCatatanKhusus(e.target.value)}
                  placeholder="Contoh: bagian hook ingin dibuat lebih lucu"
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
              </div>
            </div>
          )}
        </section>

        {/* LANGKAH 3: TOMBOL STICKY */}
        <div className="sticky bottom-4 z-30 pt-2">
          {!isFormValid && !isAnalyzing && (
            <div className="text-center mb-1.5">
              <span className="text-xs font-semibold text-slate-500 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-xs border border-slate-200/60 inline-block">
                {getDisabledReason()}
              </span>
            </div>
          )}

          {busyRetryText && (
            <div className="text-center mb-1.5 animate-pulse">
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full shadow-xs border border-amber-200 inline-block">
                ⏳ {busyRetryText}
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={!isFormValid || isAnalyzing}
            onClick={executeAnalysis}
            className={`w-full min-h-[48px] py-3.5 px-6 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 shadow-lg ${
              !isFormValid || isAnalyzing
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white active:scale-[0.99]'
            }`}
          >
            {isAnalyzing ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                <span>{STATUS_MESSAGES[statusMessageIndex]}</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>Analisis Naskah</span>
              </>
            )}
          </button>
        </div>

        {/* SKELETON LOADING STATE */}
        {isAnalyzing && (
          <div className="space-y-4 pt-2 animate-pulse">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 space-y-3">
              <div className="h-5 bg-slate-200 rounded w-1/3" />
              <div className="h-4 bg-slate-100 rounded w-2/3" />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
                <div className="h-16 bg-slate-100 rounded-xl" />
                <div className="h-16 bg-slate-100 rounded-xl" />
                <div className="h-16 bg-slate-100 rounded-xl" />
                <div className="h-16 bg-slate-100 rounded-xl" />
                <div className="h-16 bg-slate-100 rounded-xl" />
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200 space-y-3">
              <div className="h-5 bg-slate-200 rounded w-1/4" />
              <div className="h-12 bg-slate-100 rounded-xl" />
              <div className="h-12 bg-slate-100 rounded-xl" />
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200 space-y-3">
              <div className="h-5 bg-slate-200 rounded w-1/3" />
              <div className="h-24 bg-slate-100 rounded-xl" />
            </div>
          </div>
        )}

        {/* ERROR CARD (Friendly fallback) */}
        {generalError && !isAnalyzing && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3">
            <div className="text-3xl">⚠️</div>
            <p className="text-base font-bold text-red-900">
              {generalError}
            </p>
            <p className="text-xs text-red-700">
              Analisisnya belum berhasil. Coba lagi ya dengan klik tombol di bawah.
            </p>
            <button
              type="button"
              onClick={executeAnalysis}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all min-h-[44px]"
            >
              🔄 Coba lagi
            </button>
          </div>
        )}

        {/* HASIL ANALISIS */}
        {analysisResult && !isAnalyzing && (
          <div ref={resultsRef} className="space-y-5 pt-4">
            {/* A. Baris kecil input_dipakai */}
            {analysisResult.input_dipakai && (
              <div className="text-xs text-slate-500 font-medium text-center px-3 py-1.5 bg-white/60 rounded-xl border border-slate-200/60">
                {[
                  analysisResult.input_dipakai.platform &&
                    `Dianalisis untuk: ${analysisResult.input_dipakai.platform}`,
                  analysisResult.input_dipakai.audiens &&
                    `Audiens: ${analysisResult.input_dipakai.audiens}`,
                  analysisResult.input_dipakai.gaya &&
                    `Gaya: ${analysisResult.input_dipakai.gaya}`,
                  analysisResult.input_dipakai.kecepatan_bicara &&
                    `Bicara: ${analysisResult.input_dipakai.kecepatan_bicara} kata/dtk`,
                ]
                  .filter(Boolean)
                  .join(' | ')}
              </div>
            )}

            {/* B. Skor Kesiapan Naskah */}
            {analysisResult.skor_kesiapan && analysisResult.skor_kesiapan.length > 0 && (
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => toggleSection('skor')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Skor Kesiapan Naskah
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    {openSections.skor ? '▲' : '▼'}
                  </span>
                </button>

                {openSections.skor && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                    {analysisResult.skor_kesiapan.map((chip, idx) => {
                      const isBaik = chip.status === 'baik';
                      const isKuning = chip.status === 'perlu_perbaikan';
                      const isKurang = chip.status === 'kurang';

                      const badgeBg = isBaik
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : isKuning
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-red-50 border-red-200 text-red-900';

                      const icon = isBaik ? '✅' : isKuning ? '⚠️' : '❌';

                      return (
                        <div
                          key={idx}
                          className={`border rounded-xl p-3 flex flex-col justify-between ${badgeBg}`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold">{chip.aspek}</span>
                            <span className="text-xs">{icon}</span>
                          </div>
                          <p className="text-[11px] leading-snug line-clamp-3 font-medium opacity-90">
                            {chip.ringkasan}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* C. Cek Kelengkapan Template */}
            {analysisResult.kelengkapan && (
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => toggleSection('kelengkapan')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📝</span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Cek Kelengkapan Template
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    {openSections.kelengkapan ? '▲' : '▼'}
                  </span>
                </button>

                {openSections.kelengkapan && (
                  <div className="mt-4">
                    {analysisResult.kelengkapan.lengkap ? (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-semibold flex items-center gap-2">
                        <span>✅</span>
                        <span>Lengkap! Semua bagian template dasar naskah sudah terisi dengan baik.</span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-xl font-medium">
                          ⚠️ Ada beberapa bagian template yang masih kosong atau menggunakan teks petunjuk:
                        </div>
                        {(analysisResult.kelengkapan.kosong || []).map((item, i) => (
                          <div
                            key={i}
                            className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-bold text-slate-800">
                              <span>📍 {item.lokasi || 'Naskah'}</span>
                              <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                                {item.bagian}
                              </span>
                            </div>
                            <p className="text-slate-600">
                              <span className="font-semibold text-slate-700">Saran isi:</span>{' '}
                              {item.saran_isi}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* D. Checklist Struktur Video */}
            {analysisResult.struktur && analysisResult.struktur.length > 0 && (
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => toggleSection('struktur')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🎯</span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Checklist Struktur Video
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    {openSections.struktur ? '▲' : '▼'}
                  </span>
                </button>

                {openSections.struktur && (
                  <div className="mt-4 space-y-3">
                    {analysisResult.struktur.map((st, i) => {
                      const isKuat = st.status === 'kuat';
                      const isLemah = st.status === 'lemah';
                      const isBelumAda = st.status === 'belum_ada';

                      const badgeStyle = isKuat
                        ? 'bg-emerald-100 text-emerald-800'
                        : isLemah
                        ? 'bg-amber-100 text-amber-800'
                        : isBelumAda
                        ? 'bg-red-100 text-red-800'
                        : 'bg-slate-100 text-slate-700';

                      const label = isKuat
                        ? 'Kuat ✅'
                        : isLemah
                        ? 'Lemah ⚠️'
                        : isBelumAda
                        ? 'Belum Ada ❌'
                        : 'Opsional ⚪';

                      return (
                        <div
                          key={i}
                          className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-900">
                              {i + 1}. {st.elemen}
                            </span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badgeStyle}`}>
                              {label}
                            </span>
                          </div>
                          {st.temuan && (
                            <p className="text-xs text-slate-600">
                              <span className="font-semibold text-slate-700">Temuan:</span>{' '}
                              {st.temuan}
                            </p>
                          )}
                          {st.rekomendasi && (
                            <p className="text-xs text-indigo-900 font-medium bg-indigo-50/70 p-2 rounded-lg border border-indigo-100">
                              💡 <span className="font-semibold">Rekomendasi:</span>{' '}
                              {st.rekomendasi}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* E. Kesesuaian Audiens */}
            {analysisResult.audiens && (
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => toggleSection('audiens')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">👥</span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Kesesuaian Audiens
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    {openSections.audiens ? '▲' : '▼'}
                  </span>
                </button>

                {openSections.audiens && (
                  <div className="mt-4 space-y-2.5">
                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div>
                        <span className="text-xs text-slate-500 font-medium">Target Terbaca:</span>
                        <p className="text-sm font-bold text-slate-800">
                          {analysisResult.audiens.target_terbaca || 'Umum'}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          analysisResult.audiens.kesesuaian === 'sesuai'
                            ? 'bg-emerald-100 text-emerald-800'
                            : analysisResult.audiens.kesesuaian === 'kurang_sesuai'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {analysisResult.audiens.kesesuaian === 'sesuai'
                          ? 'Sesuai ✅'
                          : analysisResult.audiens.kesesuaian === 'kurang_sesuai'
                          ? 'Kurang Sesuai ⚠️'
                          : 'Tidak Sesuai ❌'}
                      </span>
                    </div>

                    {analysisResult.audiens.temuan && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <span className="font-semibold text-slate-700">Temuan:</span>{' '}
                        {analysisResult.audiens.temuan}
                      </p>
                    )}

                    {analysisResult.audiens.rekomendasi && (
                      <p className="text-xs text-indigo-900 font-medium bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                        💡 <span className="font-semibold">Rekomendasi Penyesuaian:</span>{' '}
                        {analysisResult.audiens.rekomendasi}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* F. Validasi Durasi (App Code Calculation Rules) */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
              <button
                type="button"
                onClick={() => toggleSection('durasi')}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">⏱️</span>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">
                      Validasi Durasi
                    </h3>
                    {analysisResult.durasi?.perkiraan && (
                      <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        perkiraan
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-400 font-bold">
                  {openSections.durasi ? '▲' : '▼'}
                </span>
              </button>

              {openSections.durasi && (
                <div className="mt-4 space-y-4">
                  {/* Status Banner */}
                  <div
                    className={`p-4 rounded-xl border flex items-center justify-between ${
                      computedDurationStatus === 'sesuai'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                        : computedDurationStatus === 'kurang'
                        ? 'bg-amber-50 border-amber-200 text-amber-950'
                        : 'bg-red-50 border-red-200 text-red-950'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider opacity-75">
                        Status Durasi
                      </span>
                      <h4 className="text-xl font-black flex items-center gap-1.5 mt-0.5">
                        {computedDurationStatus === 'sesuai' && '✅ Sesuai'}
                        {computedDurationStatus === 'kurang' && '⚠️ Kurang'}
                        {computedDurationStatus === 'melebihi' && '❌ Melebihi'}
                      </h4>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono font-bold">
                        Selisih: {selisihPercent > 0 ? `+${selisihPercent}%` : `${selisihPercent}%`}
                      </div>
                      <div className="text-xs font-medium opacity-80">
                        {computedDurationStatus === 'sesuai'
                          ? 'Aman (toleransi ±10%)'
                          : computedDurationStatus === 'kurang'
                          ? 'Terlalu pendek'
                          : 'Terlalu panjang'}
                      </div>
                    </div>
                  </div>

                  {/* Target vs Estimasi Cards */}
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-xs text-slate-500 font-medium">Target Peserta</span>
                      <p className="text-base font-black text-slate-900 mt-0.5">
                        {formatSecondsToMinSec(targetDetik)}
                      </p>
                      <span className="text-[11px] text-slate-400 font-mono">
                        ({targetDetik} detik)
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-xs text-slate-500 font-medium">Estimasi Naskah</span>
                      <p className="text-base font-black text-slate-900 mt-0.5">
                        {formatSecondsToMinSec(effectiveEstimasiTotal)}
                      </p>
                      <span className="text-[11px] text-slate-400 font-mono">
                        ({effectiveEstimasiTotal} detik)
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 font-medium mb-1">
                      <span>Perbandingan ke Target</span>
                      <span>{Math.round((effectiveEstimasiTotal / (targetDetik || 1)) * 100)}%</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className={`h-full rounded-full transition-all ${
                          computedDurationStatus === 'sesuai'
                            ? 'bg-emerald-500'
                            : computedDurationStatus === 'kurang'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(8, (effectiveEstimasiTotal / (targetDetik || 1)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Notes / Asumsi */}
                  {analysisResult.durasi?.asumsi && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <span className="font-semibold text-slate-700">Asumsi Kecepatan:</span>{' '}
                      {analysisResult.durasi.asumsi}
                    </p>
                  )}

                  {/* Table per scene */}
                  {perSceneList.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-slate-700 mb-2">
                        Rincian Durasi per Adegan:
                      </h5>
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                            <tr>
                              <th className="p-2.5">Scene</th>
                              <th className="p-2.5 text-center whitespace-nowrap">Estimasi</th>
                              <th className="p-2.5">Catatan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {perSceneList.map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-2.5 font-semibold text-slate-800">
                                  {row.scene}
                                </td>
                                <td className="p-2.5 text-center font-mono font-bold text-indigo-700 whitespace-nowrap">
                                  {row.estimasi_detik} dtk
                                </td>
                                <td className="p-2.5 text-slate-600">
                                  {row.catatan || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {analysisResult.durasi?.rekomendasi && (
                    <p className="text-xs text-indigo-900 font-medium bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                      💡 <span className="font-semibold">Saran Durasi:</span>{' '}
                      {analysisResult.durasi.rekomendasi}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* G. Optimasi FYP */}
            {analysisResult.fyp && (
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => toggleSection('fyp')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚀</span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Optimasi FYP
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    {openSections.fyp ? '▲' : '▼'}
                  </span>
                </button>

                {openSections.fyp && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Saran Naskah */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                      <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                        ✍️ Saran Naskah
                      </span>
                      <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
                        {(analysisResult.fyp.saran_naskah || []).map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Visual 3 Detik Pertama */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                      <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                        👁️ Visual (3 Detik Pertama)
                      </span>
                      <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
                        {(analysisResult.fyp.visual_3_detik_pertama || []).map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Audio */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                      <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                        🎵 Audio & SFX
                      </span>
                      <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
                        {(analysisResult.fyp.audio || []).map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* H. Saran Perubahan (Kartu Prioritas dengan Pita Warna & Contoh Revisi Siap Pakai) */}
            {analysisResult.saran_perubahan && analysisResult.saran_perubahan.length > 0 && (
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => toggleSection('saran')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✨</span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Saran Perubahan
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    {openSections.saran ? '▲' : '▼'}
                  </span>
                </button>

                {openSections.saran && (
                  <div className="mt-4 space-y-4">
                    {analysisResult.saran_perubahan.map((item, idx) => {
                      const isHigh = item.prioritas?.toLowerCase() === 'tinggi';
                      const isMed = item.prioritas?.toLowerCase() === 'sedang';

                      const ribbonColor = isHigh
                        ? 'border-l-4 border-l-red-500'
                        : isMed
                        ? 'border-l-4 border-l-amber-500'
                        : 'border-l-4 border-l-emerald-500';

                      const priorityBadge = isHigh
                        ? 'bg-red-100 text-red-800'
                        : isMed
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800';

                      return (
                        <div
                          key={idx}
                          className={`bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-xs space-y-2.5 ${ribbonColor}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">
                              📍 {item.lokasi || `Saran #${idx + 1}`}
                            </span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${priorityBadge}`}>
                              Prioritas {item.prioritas ? item.prioritas.charAt(0).toUpperCase() + item.prioritas.slice(1) : 'Normal'}
                            </span>
                          </div>

                          {/* Teks Sekarang */}
                          {item.teks_sekarang && (
                            <div className="text-xs">
                              <span className="text-slate-500 font-semibold block mb-0.5">
                                Teks sekarang:
                              </span>
                              <p className="italic text-slate-700 bg-white/80 p-2.5 rounded-lg border border-slate-200/80">
                                &ldquo;{item.teks_sekarang}&rdquo;
                              </p>
                            </div>
                          )}

                          {/* Masalah & Rekomendasi */}
                          {item.masalah && (
                            <p className="text-xs text-slate-700">
                              <span className="font-bold text-red-700">Masalah:</span>{' '}
                              {item.masalah}
                            </p>
                          )}

                          {item.rekomendasi && (
                            <p className="text-xs text-slate-800">
                              <span className="font-bold text-indigo-700">Rekomendasi:</span>{' '}
                              {item.rekomendasi}
                            </p>
                          )}

                          {/* KOTAK CONTOH REVISI */}
                          {item.contoh_revisi && (
                            <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-3.5 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-indigo-950 flex items-center gap-1">
                                  💡 CONTOH REVISI
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyRevision(item.contoh_revisi, idx)}
                                  className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors min-h-[32px] flex items-center gap-1 shadow-xs active:scale-95"
                                >
                                  {copiedIndex === idx ? (
                                    <span className="text-emerald-600 font-bold">Tersalin ✓</span>
                                  ) : (
                                    <span>📋 Salin</span>
                                  )}
                                </button>
                              </div>
                              <p className="text-sm font-semibold text-indigo-950 leading-relaxed">
                                {item.contoh_revisi}
                              </p>
                            </div>
                          )}

                          {/* Dampak */}
                          {item.dampak && (
                            <p className="text-[11px] text-slate-500 italic">
                              <span className="font-semibold text-slate-600">Dampak:</span>{' '}
                              {item.dampak}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* I. Langkah Berikutnya (3 Poin Bernomor) */}
            {analysisResult.langkah_berikutnya && analysisResult.langkah_berikutnya.length > 0 && (
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => toggleSection('langkah')}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📋</span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Langkah Berikutnya
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    {openSections.langkah ? '▲' : '▼'}
                  </span>
                </button>

                {openSections.langkah && (
                  <div className="mt-4 space-y-2.5">
                    {analysisResult.langkah_berikutnya.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <p className="text-xs sm:text-sm font-medium text-slate-800">
                          {step}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* J. Tombol Sekunder: Upload Revisi */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleUploadRevisi}
                className="w-full min-h-[44px] py-3 px-5 rounded-2xl font-bold text-sm bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <span>🔄</span>
                <span>Upload revisi untuk dicek lagi</span>
              </button>
            </div>
          </div>
        )}

        {/* FOOTER */}
        <footer className="pt-6 pb-4 text-center">
          <p className="text-xs text-slate-400 font-medium">
            Kendala alat/studio? Langsung hubungi instruktur.
          </p>
        </footer>
      </div>
    </div>
  );
}
