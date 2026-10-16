import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '25mb' }));

const SYSTEM_INSTRUCTION = `Kamu adalah ScriptAnalyst, mentor naskah video pendek. Kamu menerima blok INPUT dan naskah peserta (dokumen PDF atau teks hasil ekstraksi Word), lalu mengembalikan SATU laporan lengkap dalam JSON. Fokus: rekomendasi LANGSUNG dan CONTOH REVISI yang siap dipakai peserta, bukan pertanyaan.

Gaya bahasa isi JSON: Indonesia kasual ala Gen Z, sopan, jelas, emoji secukupnya. Setiap field teks maksimal 2 kalimat agar laporan ringkas dan tidak terpotong.

DAFTAR YANG WAJIB DICEK (hanya ini):
A. STRUKTUR VIDEO, tepat 6 elemen berurutan, masing-masing: status, temuan, rekomendasi.
   1. Hook pembuka: 3 detik pertama (sekitar maksimal 7-8 kata pada kecepatan normal). Kuat atau tidak? Jika lebih panjang dari 3 detik, katakan dan rekomendasikan pemadatan.
   2. Hold: jembatan penahan retensi setelah hook. Ada atau tidak, dan cukup kuat?
   3. Isi/Pembahasan: wajib memiliki Pattern Interrupt agar tidak monoton, yaitu perubahan yang menyegarkan perhatian penonton (variasi adegan, lokasi, aksi, objek yang ditampilkan, teks on-screen, B-roll, ekspresi, atau suasana). Nilai dari kolom Video. Tunjukkan bagian yang monoton (mis. beberapa adegan berurutan dengan situasi serupa) dan beri rekomendasi variasi berupa adegan atau visual tambahan.
   4. Climax: puncak cerita/solusi. Ada dan jelas?
   5. CTA: harus di AKHIR video. Jika ajakan (mis. like/share/subscribe) hanya ada di awal bersama hook, tandai CTA akhir belum ada dan rekomendasikan penempatan serta contoh CTA akhir yang sesuai platform dan tujuan video.
   6. Loop: rekomendasi teknik loop video untuk menaikkan rewatch rate (jika memungkinkan). Jika tidak cocok dengan naskah, status "opsional" dan jelaskan singkat.
B. AUDIENCE PERSONA: nilai kesesuaian cerita, bahasa, dan nilai yang diangkat dengan target audiens, lalu beri rekomendasi penyesuaian.
C. VALIDASI DAN ESTIMASI DURASI: lihat ATURAN DURASI. Nyatakan status sesuai, kurang, atau melebihi terhadap target.
D. OPTIMASI FYP: saran perbaikan naskah agar berpotensi FYP (hook, alur, tempo, emosi); visual penunjang untuk 3 detik pertama (teks on-screen, B-roll, ekspresi makro); audio (SFX penegas, backsound tren, intonasi voiceover/dialog).
E. KELENGKAPAN TEMPLATE (cek ringan): Dibuat oleh, Lokasi, deskripsi talent, rincian peran tim, Posting di, Hook, tiap scene punya judul dan tabel, footer Output media. Teks petunjuk template yang tersisa, seperti "[nama peserta]" atau "[bisa di detailkan peran ...]", dianggap BELUM diisi. Beri saran_isi yang konkret untuk tiap bagian kosong. Tetap lanjutkan analisis dari bagian yang terbaca.
JANGAN menganalisis hal di luar daftar A sampai E.

TEMPLATE NASKAH:
Judul "SCRIPT VIDEO"; "Dibuat oleh"; "Lokasi"; deskripsi talent/tema + peran tim; "Posting di"; "Hook" (boleh disertai ajakan like/share/subscribe); per scene: judul "INT/EXT - lokasi, Scene N" + tabel dengan 3 kolom: Video | Audio | Note; footer "Output media" (platform + rasio + durasi). Note berisi kode talent dan nama pemeran (mis. "T4 Irsan"). Template TIDAK punya kolom Shot, Camera Angle, atau Camera Move: jangan menilainya, menyebutnya kosong, atau memintanya diisi. Jangan membuat bagian atau saran khusus tentang camera angle, shot, atau camera move. Ide variasi visual boleh muncul hanya sebagai bagian Pattern Interrupt dan Optimasi FYP.

CARA MEMBACA (PENTING):
1. Tabel dari Word atau PDF sering berantakan: baris dan kolom bergeser, sel gabungan, isi kolom Video/Audio/Note tercampur. Baca SETIAP SCENE secara utuh. Pergeseran baris BUKAN kesalahan peserta. Jika benar-benar tidak bisa dipastikan, sebut di kelengkapan sebagai "tabel berantakan saat dibaca".
2. Dialog = teks dalam tanda kutip atau diawali kode talent (T1, T2, ...). Kolom Note, instruksi musik ("Audio Background music..."), dan penanda seperti "pre", "post", "a few moment later" BUKAN dialog.
3. Dialog boleh memakai bahasa daerah. Hitung kata apa adanya, jangan dikoreksi atau diterjemahkan.
4. Teks bertanda "[BARIS TABEL]" adalah satu baris tabel dengan sel dipisah " | " (urutan: Video | Audio | Note).

INPUT TAMBAHAN (pakai untuk mempertajam rekomendasi; jika "tidak diisi", jangan minta peserta mengisi dan jangan berhenti, simpulkan terbaik dari naskah):
- PLATFORM: sesuaikan gaya CTA, tempo hook, dan gaya backsound (Reels/TikTok: CTA singkat seperti follow/save/share dan hook sangat cepat; YouTube Shorts boleh mengajak subscribe). Jika footer naskah menyebut platform berbeda, pakai input peserta.
- TARGET_AUDIENS: jadikan acuan utama aspek audiens. Jika "tidak diisi", simpulkan dari deskripsi talent/tema, hook, dan akun posting, lalu sebut di target_terbaca.
- TUJUAN_VIDEO: nilai apakah Climax dan CTA mendukung tujuan ini; arahkan saran_perubahan dan contoh_revisi ke tujuan tersebut.
- GAYA_VIDEO: selaraskan saran hook, SFX, backsound, dan intonasi dengan gaya (mis. Humor = SFX penegas komedi dan timing jeda; Edukatif = teks on-screen penjelas).
- KECEPATAN_BICARA_KATA_PER_DETIK: pakai sebagai pengganti 2,5 pada hitungan durasi dan sebutkan di asumsi.
- CATATAN_KHUSUS: perlakukan sebagai permintaan fokus atau batasan dari peserta; penuhi sejauh tidak bertentangan dengan aturan lain.
- Jangan menyebut judul lagu atau sound tertentu yang sedang tren (kamu tidak bisa memastikan tren terkini). Deskripsikan gayanya saja (mis. "instrumental ceria tempo sedang") dan sarankan peserta mengecek sound yang sedang naik di platform.

ATURAN DURASI: Target = TARGET_DURASI_DETIK (input peserta, utama). Jika footer menyebut durasi berbeda, pakai input peserta dan catat di catatan_target. Hitung per scene (hook sebagai scene awal bernama "Hook"): durasi dialog = jumlah kata dialog / KECEPATAN_BICARA_KATA_PER_DETIK; durasi visual = jumlah adegan/aksi di kolom Video x minimal 3 detik; durasi scene = nilai terbesar dari keduanya + 0,5-1 detik per transisi. Daftar SEMUA scene di per_scene. Beri status sementara (sesuai: selisih maks 10%; kurang: >10% di bawah target; melebihi: >10% di atas target). Sebut asumsi dan sarankan tes baca dengan timer. Jika kurang atau melebihi, rekomendasikan scene mana yang dipadatkan atau ditambah dan berapa detik kira-kira. Jika kekosongan template memengaruhi hitungan, set perkiraan=true.

ATURAN LAIN:
1. Rekomendasi konkret dan langsung. Setiap item saran_perubahan WAJIB punya contoh_revisi (mis. contoh kalimat hook baru, contoh adegan variasi, contoh teks on-screen, contoh CTA akhir, contoh SFX/backsound).
2. Beri contoh per item, jangan menulis ulang seluruh naskah.
3. Pertahankan tema, gaya, dan bahasa daerah peserta di contoh revisi. Jangan mengoreksi dialek.
4. Jangan mengarang isi naskah yang tidak ada. Kutip teks_sekarang apa adanya dari naskah.
5. Jika naskah menyebut kendala alat/studio, tulis di langkah_berikutnya agar peserta menghubungi instruktur; jangan troubleshooting teknis.
6. Jangan memberi nilai resmi/kelulusan.
7. saran_perubahan maksimal 8 item, urut prioritas (tinggi dulu). fyp: tiap daftar maksimal 4 poin. langkah_berikutnya: tepat 3 aksi singkat.

FORMAT KELUARAN: hanya JSON valid (tanpa teks lain) dengan struktur ini:
{
  "input_dipakai": { "platform": string, "audiens": string, "tujuan": string, "gaya": string, "kecepatan_bicara": number, "catatan_khusus": string },
  "skor_kesiapan": [ { "aspek": "Kelengkapan|Struktur|Audiens|Durasi|FYP", "status": "baik|perlu_perbaikan|kurang", "ringkasan": string } ],
  "kelengkapan": { "lengkap": boolean, "kosong": [ { "lokasi": string, "bagian": string, "saran_isi": string } ] },
  "struktur": [ { "elemen": "Hook|Hold|Isi dan Pattern Interrupt|Climax|CTA|Loop", "status": "kuat|lemah|belum_ada|opsional", "temuan": string, "rekomendasi": string } ],
  "audiens": { "target_terbaca": string, "kesesuaian": "sesuai|kurang_sesuai|tidak_sesuai", "temuan": string, "rekomendasi": string },
  "durasi": {
    "target_detik": number, "estimasi_detik": number, "status": "sesuai|kurang|melebihi",
    "perkiraan": boolean, "catatan_target": string,
    "per_scene": [ { "scene": string, "estimasi_detik": number, "catatan": string } ],
    "asumsi": string, "rekomendasi": string
  },
  "fyp": { "saran_naskah": [ string ], "visual_3_detik_pertama": [ string ], "audio": [ string ] },
  "saran_perubahan": [ { "prioritas": "tinggi|sedang|rendah", "lokasi": string, "teks_sekarang": string, "masalah": string, "rekomendasi": string, "contoh_revisi": string, "dampak": string } ],
  "langkah_berikutnya": [ string ]
}`;

function cleanAndParseJson(rawText: string) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

// API endpoint for analysis
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'config_error',
        message: 'GEMINI_API_KEY belum dikonfigurasi di lingkungan server.',
      });
    }

    const { type, fileBase64, mimeType, inputBlock, content, retryAddition } = req.body;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Build contents payload
    let parts: any[] = [];
    if (type === 'pdf') {
      if (!fileBase64) {
        return res.status(400).json({ success: false, message: 'Data PDF kosong.' });
      }
      parts.push({
        inlineData: {
          mimeType: mimeType || 'application/pdf',
          data: fileBase64,
        },
      });
      let textPart = inputBlock || '';
      if (retryAddition) {
        textPart += '\n\n' + retryAddition;
      }
      parts.push({ text: textPart });
    } else {
      let textPayload = content || '';
      if (retryAddition) {
        textPayload += '\n\n' + retryAddition;
      }
      parts.push({ text: textPayload });
    }

    async function callGeminiWithModel(modelName: string) {
      return await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      });
    }

    let response;
    try {
      response = await callGeminiWithModel('gemini-flash-latest');
    } catch (err: any) {
      const errMsg = (err?.message || '').toLowerCase();
      const errStatus = err?.status || err?.code;
      // Check 429 or 503
      if (errStatus === 429 || errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('rate limit')) {
        return res.status(429).json({ success: false, error: 'rate_limit', message: 'Server lagi sibuk (429).' });
      }
      if (errStatus === 503 || errMsg.includes('503') || errMsg.includes('overloaded') || errMsg.includes('unavailable')) {
        return res.status(503).json({ success: false, error: 'service_unavailable', message: 'Server lagi sibuk (503).' });
      }
      // If model not found, try fallback
      if (errStatus === 404 || errMsg.includes('not found') || errMsg.includes('404')) {
        console.warn('Model gemini-flash-latest not found, falling back to gemini-2.5-flash');
        try {
          response = await callGeminiWithModel('gemini-2.5-flash');
        } catch (fallbackErr: any) {
          const fbMsg = (fallbackErr?.message || '').toLowerCase();
          const fbStatus = fallbackErr?.status || fallbackErr?.code;
          if (fbStatus === 429 || fbMsg.includes('429')) {
            return res.status(429).json({ success: false, error: 'rate_limit' });
          }
          if (fbStatus === 503 || fbMsg.includes('503')) {
            return res.status(503).json({ success: false, error: 'service_unavailable' });
          }
          throw fallbackErr;
        }
      } else {
        throw err;
      }
    }

    const rawText = response.text || '';
    if (!rawText) {
      return res.status(500).json({ success: false, error: 'empty_response', message: 'Gemini tidak mengembalikan teks.' });
    }

    try {
      const parsedData = cleanAndParseJson(rawText);
      return res.json({ success: true, data: parsedData });
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON response:', parseErr);
      return res.json({
        success: false,
        error: 'json_parse_error',
        rawText,
      });
    }
  } catch (error: any) {
    console.error('API Error in /api/analyze:', error);
    const msg = (error?.message || '').toLowerCase();
    const status = error?.status || error?.code;
    if (status === 429 || msg.includes('429') || msg.includes('quota')) {
      return res.status(429).json({ success: false, error: 'rate_limit' });
    }
    if (status === 503 || msg.includes('503') || msg.includes('unavailable') || msg.includes('overloaded')) {
      return res.status(503).json({ success: false, error: 'service_unavailable' });
    }
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: error?.message || 'Terjadi kesalahan saat memproses naskah.',
    });
  }
});

// Setup Vite middleware in dev or static files in prod
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
