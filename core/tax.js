// Aturan & rumus kalkulator pajak (fungsi murni, tanpa DOM, diuji di tests/unit).
// Dasar: UU PPh s.t.d.t.d. UU HPP (tarif Pasal 17), PP 58/2023 & PMK 168/2023 (PPh 21 tarif efektif rata-rata/TER),
// PP 68/2009 (pesangon & manfaat pensiun sekaligus), PP 80/2010 (honor APBN/APBD), PMK 141/2015 (jasa PPh 23),
// PP 34/2017 (sewa tanah/bangunan), PP 9/2022 (jasa konstruksi), PP 55/2022 (UMKM), KMK 416/417/475 1996 (PPh 15),
// Pasal 31E UU PPh (fasilitas badan), PMK 131/2024 (PPN 12% dengan DPP nilai lain 11/12).
// Semua PPh dibulatkan ke bawah ke rupiah penuh; PKP dibulatkan ke bawah ke ribuan.
// Ini alat bantu edukasi: hasil resmi tetap mengikuti peraturan yang berlaku dan bukti potong.

const INF = Infinity;

export const PTKP = { "TK/0": 54e6, "TK/1": 58.5e6, "TK/2": 63e6, "TK/3": 67.5e6, "K/0": 58.5e6, "K/1": 63e6, "K/2": 67.5e6, "K/3": 72e6 };
export const TER_CATEGORY = { "TK/0": "A", "TK/1": "A", "K/0": "A", "TK/2": "B", "TK/3": "B", "K/1": "B", "K/2": "B", "K/3": "C" };

// Tarif efektif bulanan PP 58/2023: [batas atas penghasilan bruto sebulan (inklusif), tarif %]
const T = (rows) => rows.map(([upper, rate]) => [upper * 1000, rate]);
export const TER = {
  A: T([[5400, 0], [5650, 0.25], [5950, 0.5], [6300, 0.75], [6750, 1], [7500, 1.25], [8550, 1.5], [9650, 1.75], [10050, 2], [10350, 2.25],
    [10700, 2.5], [11050, 3], [11600, 3.5], [12500, 4], [13750, 5], [15100, 6], [16950, 7], [19750, 8], [24150, 9], [26450, 10],
    [28000, 11], [30050, 12], [32400, 13], [35400, 14], [39100, 15], [43850, 16], [47800, 17], [51400, 18], [56300, 19], [62200, 20],
    [68600, 21], [77500, 22], [89000, 23], [103000, 24], [125000, 25], [157000, 26], [206000, 27], [337000, 28], [454000, 29], [550000, 30],
    [695000, 31], [910000, 32], [1400000, 33], [INF, 34]]),
  B: T([[6200, 0], [6500, 0.25], [6850, 0.5], [7300, 0.75], [9200, 1], [10750, 1.5], [11250, 2], [11600, 2.5], [12600, 3], [13600, 4],
    [14950, 5], [16400, 6], [18450, 7], [21850, 8], [26000, 9], [27700, 10], [29350, 11], [31450, 12], [33950, 13], [37100, 14],
    [41100, 15], [45800, 16], [49500, 17], [53800, 18], [58500, 19], [64000, 20], [71000, 21], [80000, 22], [93000, 23], [109000, 24],
    [129000, 25], [163000, 26], [211000, 27], [374000, 28], [459000, 29], [555000, 30], [704000, 31], [957000, 32], [1405000, 33], [INF, 34]]),
  C: T([[6600, 0], [6950, 0.25], [7350, 0.5], [7800, 0.75], [8850, 1], [9800, 1.25], [10950, 1.5], [11200, 1.75], [12050, 2], [12950, 3],
    [14150, 4], [15550, 5], [17050, 6], [19500, 7], [22700, 8], [26600, 9], [28100, 10], [30100, 11], [32600, 12], [35400, 13],
    [38900, 14], [43000, 15], [47400, 16], [51200, 17], [55800, 18], [60400, 19], [66700, 20], [74500, 21], [83200, 22], [95600, 23],
    [110000, 24], [134000, 25], [169000, 26], [221000, 27], [390000, 28], [463000, 29], [561000, 30], [709000, 31], [965000, 32], [1419000, 33], [INF, 34]]),
};

export const PASAL17 = [[60e6, 5], [250e6, 15], [500e6, 25], [5e9, 30], [INF, 35]];
export const PESANGON = [[50e6, 0], [100e6, 5], [500e6, 15], [INF, 25]];
export const MANFAAT_PENSIUN = [[50e6, 0], [INF, 5]];

const floor = (n) => Math.floor(Math.max(0, n) + 1e-9);
const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

/** Tarif (%) dari tabel bertingkat "satu tarif untuk seluruh jumlah" (TER). */
export function flatRate(rows, amount) {
  const a = num(amount);
  return rows.find(([upper]) => a <= upper)[1];
}

/** Pajak progresif berlapis (Pasal 17, pesangon). Mengembalikan { tax, layers:[{from,to,rate,tax}] }. */
export function progressive(amount, rows) {
  let rest = num(amount), lower = 0, tax = 0;
  const layers = [];
  for (const [upper, rate] of rows) {
    if (rest <= 0) break;
    const width = Math.min(rest, upper - lower);
    const t = (width * rate) / 100;
    layers.push({ from: lower, to: lower + width, rate, tax: t });
    tax += t; rest -= width; lower = upper;
  }
  return { tax: floor(tax), layers };
}
export const pasal17 = (pkp) => progressive(pkp, PASAL17).tax;
export const roundPkp = (v) => Math.max(0, Math.floor(num(v) / 1000) * 1000);

/** Gross up untuk tabel TER: tunjangan T sehingga T = TER(dasar + T) x (dasar + T) - pajakSebelumnya. */
export function grossUpTer(rows, base, prevTax = 0) {
  let lower = 0;
  for (const [upper, rate] of rows) {
    const r = rate / 100;
    const t = Math.max(0, (r * base - prevTax) / (1 - r));
    if (base + t <= upper) return floor(t);
    lower = upper;
  }
  return 0;
}

/** Gross up umum (iterasi titik tetap) untuk fungsi pajak monoton dengan kemiringan < 1. */
export function grossUpIter(taxOf, base) {
  let t = 0;
  for (let i = 0; i < 200; i++) {
    const next = taxOf(base + t);
    if (Math.abs(next - t) < 1) return Math.max(next, t);
    t = next;
  }
  return t;
}

// ---------------------------------------------------------------- PPh 21
/** PPh 21 bulanan (pegawai tetap / pensiun berkala) dengan TER. */
export function pph21Bulanan({ bruto, ptkp, akumulasi = 0, grossUp = false }) {
  const cat = TER_CATEGORY[ptkp];
  if (!cat) throw new Error("Pilih status PTKP.");
  const rows = TER[cat];
  const prev = num(akumulasi);
  const prevTax = floor((flatRate(rows, prev) / 100) * prev);
  const base = prev + num(bruto);
  const tunjangan = grossUp ? grossUpTer(rows, base, prevTax) : 0;
  const total = base + tunjangan;
  const rate = flatRate(rows, total);
  const pph = floor((rate / 100) * total) - prevTax;
  return {
    dpp: total, rate, pph: Math.max(0, pph), tunjangan,
    steps: [
      ["Kategori TER", `${cat} (PTKP ${ptkp})`],
      ...(prev ? [["Penghasilan yang telah dipotong", prev], ["PPh atas penghasilan tersebut", prevTax]] : []),
      ["Penghasilan bruto masa ini", num(bruto)],
      ...(grossUp ? [["Tunjangan PPh (gross up)", tunjangan]] : []),
      ["Jumlah bruto untuk TER", total],
      ["Tarif efektif", `${fmtPct(rate)}`],
      ["PPh 21 terutang", Math.max(0, pph)],
    ],
  };
}

export const TIDAK_FINAL = {
  "21-100-03": { label: "Pegawai Tidak Tetap", method: "ptt" },
  "21-100-04": { label: "Distributor Pemasaran Berjenjang", method: "bukan-pegawai" },
  "21-100-05": { label: "Agen Asuransi", method: "bukan-pegawai" },
  "21-100-06": { label: "Penjaja Barang Dagangan", method: "bukan-pegawai" },
  "21-100-07": { label: "Tenaga Ahli", method: "bukan-pegawai" },
  "21-100-08": { label: "Seniman", method: "bukan-pegawai" },
  "21-100-09": { label: "Bukan Pegawai Lainnya", method: "bukan-pegawai" },
  "21-100-10": { label: "Anggota Dewan Komisaris atau Dewan Pengawas yang Menerima Imbalan Secara Tidak Teratur", method: "penuh" },
  "21-100-11": { label: "Mantan Pegawai yang Menerima Jasa Produksi, Tantiem, Bonus atau Imbalan Kepada Mantan Pegawai", method: "penuh" },
  "21-100-12": { label: "Pegawai yang Melakukan Penarikan Uang Pensiun", method: "penuh" },
  "21-100-13": { label: "Peserta Kegiatan", method: "penuh" },
};

/** PPh 21 tidak final: pegawai tidak tetap (TER harian/bulanan), bukan pegawai (50% bruto x Pasal 17), lainnya (bruto x Pasal 17). */
export function pph21TidakFinal({ kode, jenis = "harian", bruto, hari = 1, ptkp, akumulasi = 0, grossUp = false }) {
  const obj = TIDAK_FINAL[kode];
  if (!obj) throw new Error("Pilih kode objek pajak.");
  if (obj.method === "ptt" && jenis === "bulanan") return pph21Bulanan({ bruto, ptkp, akumulasi, grossUp });
  if (obj.method === "ptt") {
    const days = Math.max(1, Math.floor(num(hari)));
    const daily = num(bruto) / days;
    if (daily <= 2.5e6) {
      const rate = daily <= 450000 ? 0 : 0.5;
      const pph = floor((rate / 100) * num(bruto));
      return { dpp: num(bruto), rate, pph, steps: [["Rata-rata bruto sehari", floor(daily)], ["Tarif efektif harian", fmtPct(rate)], ["PPh 21 terutang", pph]] };
    }
    const dpp = floor(num(bruto) * 0.5);
    const pph = pasal17(dpp);
    return { dpp, rate: null, pph, steps: [["Rata-rata bruto sehari > Rp2.500.000", floor(daily)], ["DPP (50% x bruto)", dpp], ["PPh 21 (tarif Pasal 17)", pph]] };
  }
  const share = obj.method === "bukan-pegawai" ? 0.5 : 1;
  const prev = num(akumulasi);
  const taxOf = (gross) => pasal17(floor((prev + gross) * share)) - pasal17(floor(prev * share));
  const tunjangan = grossUp ? floor(grossUpIter(taxOf, num(bruto))) : 0;
  const gross = num(bruto) + tunjangan;
  const dpp = floor((prev + gross) * share);
  const pph = Math.max(0, taxOf(gross));
  return {
    dpp, rate: null, pph, tunjangan,
    steps: [
      ...(prev ? [["Penghasilan yang telah dipotong (masa sama)", prev]] : []),
      ["Penghasilan bruto", num(bruto)],
      ...(grossUp ? [["Tunjangan PPh (gross up)", tunjangan]] : []),
      [share === 0.5 ? "DPP (50% x bruto)" : "DPP (100% x bruto)", dpp],
      ["PPh 21 (tarif Pasal 17)", pph],
    ],
  };
}

export const FINAL = {
  "21-401-01": { label: "Uang Pesangon yang Dibayarkan Sekaligus", rows: PESANGON },
  "21-401-02": { label: "Uang Manfaat Pensiun, Tunjangan Hari Tua, atau Jaminan Hari Tua yang Dibayarkan Sekaligus", rows: MANFAAT_PENSIUN },
  "21-402-01": { label: "Honor dan Imbalan Lain yang Dibebankan kepada APBN atau APBD yang Diterima oleh PNS, Anggota TNI/POLRI, Pejabat Negara dan Pensiunannya", rows: null },
};
export const GOLONGAN = [
  { rate: 0, label: "Golongan I dan II, Tamtama, Bintara" },
  { rate: 5, label: "Golongan III, Perwira Pertama" },
  { rate: 15, label: "Golongan IV, Perwira Menengah, Perwira Tinggi dan Pejabat Negara" },
];

/** PPh 21 final: pesangon & manfaat pensiun sekaligus (progresif, dapat diakumulasi 2 tahun), honor APBN/APBD (tarif golongan). */
export function pph21Final({ kode, bruto, akumulasi = 0, golongan = 0 }) {
  const obj = FINAL[kode];
  if (!obj) throw new Error("Pilih kode objek pajak.");
  if (!obj.rows) {
    const rate = Number(golongan) || 0;
    const pph = floor((rate / 100) * num(bruto));
    return { dpp: num(bruto), rate, pph, steps: [["Penghasilan bruto", num(bruto)], ["Tarif golongan", fmtPct(rate)], ["PPh 21 final", pph]] };
  }
  const prev = num(akumulasi);
  const total = prev + num(bruto);
  const all = progressive(total, obj.rows);
  const before = progressive(prev, obj.rows).tax;
  const pph = Math.max(0, all.tax - before);
  return {
    dpp: num(bruto), rate: null, pph,
    steps: [
      ...(prev ? [["Akumulasi penghasilan bruto sebelumnya", prev]] : []),
      ...all.layers.filter((l) => l.to > prev).map((l) => [`Lapisan ${fmtPct(l.rate)} atas ${rupiah(Math.max(l.from, prev))} – ${rupiah(l.to)}`, floor(((l.to - Math.max(l.from, prev)) * l.rate) / 100)]),
      ["PPh 21 final", pph],
    ],
  };
}

/** PPh 21 tahunan pegawai tetap / pensiunan (formulir 1721-A1/A2), masa pajak terakhir. */
export function pph21Tahunan(i) {
  const n = Math.max(1, Math.min(12, (Number(i.masaAkhir) || 12) - (Number(i.masaAwal) || 1) + 1));
  const b = [i.gaji, i.tunjPph, i.tunjLain, i.honor, i.premi, i.natura, i.bonus].map(num);
  const bruto = b.reduce((s, v) => s + v, 0);
  const capMonthly = i.pensiunan ? 200000 : 500000;
  const biaya = floor(Math.min(bruto * 0.05, capMonthly * n));
  const pengurang = biaya + num(i.iuran) + num(i.zakat);
  const neto = Math.max(0, bruto - pengurang);
  const netoPrev = num(i.netoSebelumnya);
  const disetahunkan = i.metode === "disetahunkan";
  const netoSetahun = floor(disetahunkan ? ((neto + netoPrev) * 12) / n : neto + netoPrev);
  const ptkp = PTKP[i.ptkp];
  if (ptkp == null) throw new Error("Pilih status PTKP.");
  const pkp = roundPkp(netoSetahun - ptkp);
  const pphSetahun = pasal17(pkp);
  const pph18 = disetahunkan ? floor((pphSetahun * n) / 12) : pphSetahun;
  const pph19 = num(i.pphSebelumnya);
  const pph20 = pph18 - pph19;
  return {
    months: n,
    lines: { 1: b[0], 2: b[1], 3: b[2], 4: b[3], 5: b[4], 6: b[5], 7: b[6], 8: bruto, 9: biaya, 10: num(i.iuran), 11: num(i.zakat), 12: pengurang,
      13: neto, 14: netoPrev, 15: netoSetahun, 16: ptkp, 17: pkp, 18: pph18, 19: pph19, 20: pph20 },
  };
}

// ---------------------------------------------------------------- PPh lain (tarif tunggal per objek)
export const PPH23 = [
  { id: "dividen", label: "Dividen", rate: 15 },
  { id: "bunga", label: "Bunga (termasuk premium, diskonto, imbalan jaminan pengembalian utang)", rate: 15 },
  { id: "royalti", label: "Royalti", rate: 15 },
  { id: "hadiah", label: "Hadiah, penghargaan, bonus, dan sejenisnya (selain yang dipotong PPh 21)", rate: 15 },
  { id: "sewa", label: "Sewa dan penghasilan lain sehubungan dengan penggunaan harta (kecuali tanah/bangunan)", rate: 2 },
  { id: "jasa", label: "Imbalan jasa teknik, manajemen, konsultan, dan jasa lain (PMK 141/2015)", rate: 2 },
];
export const PPH42 = [
  { id: "sewa-tb", label: "Persewaan tanah dan/atau bangunan", rate: 10 },
  { id: "bunga-dep", label: "Bunga deposito, tabungan, dan diskonto SBI", rate: 20 },
  { id: "undian", label: "Hadiah undian", rate: 25 },
  { id: "pengalihan", label: "Pengalihan hak atas tanah dan/atau bangunan", rate: 2.5 },
  { id: "pengalihan-rss", label: "Pengalihan rumah sederhana/rusun sederhana oleh pengusaha yang usaha pokoknya pengalihan", rate: 1 },
  { id: "konstruksi-kecil", label: "Pekerjaan konstruksi – kualifikasi kecil atau perseorangan bersertifikat", rate: 1.75 },
  { id: "konstruksi-menengah", label: "Pekerjaan konstruksi – kualifikasi menengah/besar", rate: 2.65 },
  { id: "konstruksi-tanpa", label: "Pekerjaan konstruksi – tanpa sertifikat badan usaha/kompetensi kerja", rate: 4 },
  { id: "terintegrasi", label: "Pekerjaan konstruksi terintegrasi – bersertifikat", rate: 2.65 },
  { id: "terintegrasi-tanpa", label: "Pekerjaan konstruksi terintegrasi – tanpa sertifikat", rate: 4 },
  { id: "konsultansi", label: "Konsultansi konstruksi – bersertifikat", rate: 3.5 },
  { id: "konsultansi-tanpa", label: "Konsultansi konstruksi – tanpa sertifikat", rate: 6 },
  { id: "umkm", label: "Peredaran bruto UMKM (PP 55/2022)", rate: 0.5 },
  { id: "dividen-op", label: "Dividen untuk orang pribadi dalam negeri (tidak diinvestasikan kembali)", rate: 10 },
  { id: "saham-bursa", label: "Penjualan saham di bursa efek", rate: 0.1 },
];
export const PPH22 = [
  { id: "impor-api", label: "Impor dengan Angka Pengenal Impor (API)", rate: 2.5, npwpMatters: false },
  { id: "impor-nonapi", label: "Impor tanpa API", rate: 7.5, npwpMatters: false },
  { id: "bendahara", label: "Pembelian barang oleh instansi pemerintah (bendahara)", rate: 1.5, npwpMatters: true },
  { id: "bbm-pertamina", label: "Penjualan BBM ke SPBU Pertamina", rate: 0.25, npwpMatters: true },
  { id: "bbm-lain", label: "Penjualan BBM ke SPBU non-Pertamina / selain SPBU", rate: 0.3, npwpMatters: true },
];
export const PPH15 = [
  { id: "pelayaran-dn", label: "Pelayaran dalam negeri (KMK 416/1996)", rate: 1.2 },
  { id: "penerbangan-dn", label: "Penerbangan dalam negeri (KMK 475/1996)", rate: 1.8 },
  { id: "pelayaran-ln", label: "Pelayaran/penerbangan luar negeri (KMK 417/1996)", rate: 2.64 },
];

/** PPh tarif tunggal: DPP x tarif; tanpa NPWP 100% lebih tinggi (bila berlaku); gross up = DPP/(1 - tarif). */
export function flatTax({ rate, dpp, npwp = true, npwpMatters = true, grossUp = false }) {
  const r = (npwp || !npwpMatters ? rate : rate * 2) / 100;
  const base = grossUp ? floor(num(dpp) / (1 - r)) : num(dpp);
  const pph = floor(base * r);
  return { dpp: base, rate: r * 100, pph, steps: [...(grossUp ? [["Penghasilan diterima (neto)", num(dpp)], ["DPP setelah gross up", base]] : [["DPP", base]]), ["Tarif", fmtPct(r * 100) + (npwp || !npwpMatters ? "" : " (tanpa NPWP, +100%)")], ["Pajak terutang", pph]] };
}

/** PPh Badan dengan fasilitas Pasal 31E (peredaran bruto s.d. Rp50 miliar). */
export function pphBadan({ peredaran, pkp, tbk = false }) {
  const rate = tbk ? 19 : 22;
  const p = roundPkp(pkp);
  const omzet = num(peredaran);
  let fasilitas = 0;
  if (!tbk && omzet <= 50e9 && omzet > 0) fasilitas = omzet <= 4.8e9 ? p : floor((4.8e9 / omzet) * p);
  const normal = p - fasilitas;
  const pph = floor((fasilitas * rate * 0.5) / 100 + (normal * rate) / 100);
  return {
    dpp: p, rate: null, pph,
    steps: [
      ["PKP (dibulatkan ribuan)", p],
      ...(fasilitas ? [["PKP mendapat fasilitas 31E", fasilitas], [`PPh ${fmtPct(rate / 2)} x PKP fasilitas`, floor((fasilitas * rate) / 200)]] : []),
      [`PPh ${fmtPct(rate)} x PKP ${fasilitas ? "non-fasilitas" : ""}`.trim(), floor((normal * rate) / 100)],
      ["PPh Badan terutang", pph],
    ],
  };
}

/** PPN 12%: barang/jasa umum memakai DPP nilai lain 11/12 (PMK 131/2024); barang mewah memakai harga jual. */
export function ppn({ harga, inklusif = false, mewah = false, ppnbmRate = 0 }) {
  const factor = mewah ? 1 : 11 / 12;
  const eff = 0.12 * factor + (mewah ? num(ppnbmRate) / 100 : 0);
  const dpp = inklusif ? floor(num(harga) / (1 + eff)) : num(harga);
  const dppLain = Math.round(dpp * factor);
  const ppnVal = floor(Math.round(dpp * factor * 0.12 * 100) / 100);      // hindari galat pecahan biner (1.000.000 -> 110.000)
  const ppnbmVal = mewah ? floor((dpp * num(ppnbmRate)) / 100) : 0;
  return {
    dpp, dppLain, ppn: ppnVal, ppnbm: ppnbmVal, total: dpp + ppnVal + ppnbmVal,
    steps: [
      ["Harga jual / penggantian (DPP)", dpp],
      ...(mewah ? [] : [["DPP nilai lain (11/12 x DPP)", dppLain]]),
      ["PPN 12%", ppnVal],
      ...(mewah ? [[`PPnBM ${fmtPct(num(ppnbmRate))}`, ppnbmVal]] : []),
      ["Jumlah yang dibayar pembeli", dpp + ppnVal + ppnbmVal],
    ],
  };
}
export const PPNBM_RATES = [10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 95, 125, 150, 200];

// ---------------------------------------------------------------- format
const rp = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
export const rupiah = (n) => (n < 0 ? "-Rp" : "Rp") + rp.format(Math.abs(Math.round(n)));
export const fmtPct = (n) => `${String(n).replace(".", ",")}%`;
