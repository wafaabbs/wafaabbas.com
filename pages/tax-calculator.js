// Kalkulator Pajak (kalkulator-pajak.html). Susunan mengikuti kalkulator DJP: tab PPh 21, PPh 23, PPh 4(2), dan
// "Lainnya" (PPh 22, PPh 15, PPh Badan, PPN, PPnBM). Setiap tab = <form> sendiri; hasil dihitung langsung saat isian
// berubah (tombol Hitung tetap ada). Semua rumus ada di core/tax.js; halaman ini hanya UI. Tanpa server, tanpa captcha.

import { html, raw, setHtml } from "../core/dom.js";
import { setPageMeta } from "../core/seo.js";
import { pathTo } from "../core/url.js";
import { icon } from "../components/icons.js";
import * as tax from "../core/tax.js";
import { bootChrome } from "./boot.js";

bootChrome();
setPageMeta({ title: "Kalkulator Pajak", description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "" });

const { rupiah, fmtPct } = tax;
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const TABS = [
  { id: "pph21", label: "PPh 21", main: true },
  { id: "pph23", label: "PPh 23", main: true },
  { id: "pph42", label: "PPh 4 (2)", main: true },
  { id: "pph22", label: "PPh 22" },
  { id: "pph15", label: "PPh 15" },
  { id: "badan", label: "PPh Badan" },
  { id: "ppn", label: "PPN" },
  { id: "ppnbm", label: "PPnBM" },
];

// ---------------------------------------------------------------- potongan markup
const ptkpOptions = () => html`<option value="">Pilih PTKP</option>${Object.entries(tax.PTKP).map(([k, v]) => html`<option value="${k}">${k} – ${rupiah(v)}</option>`)}`;
const money = (name, label, { hint = "", readonly = false } = {}) => html`
  <div class="calc-row" data-row="${name}"><label class="calc-row__label" for="${"f-" + name}">${label}</label>
    <div class="calc-row__ctl"><div class="money"><span aria-hidden="true">Rp</span><input id="${"f-" + name}" name="${name}" type="text" inputmode="numeric" autocomplete="off" placeholder="0" data-money ${readonly ? raw("readonly") : ""}></div>
    ${hint ? html`<small class="calc-hint">${hint}</small>` : ""}</div></div>`;
const select = (name, label, options, { hint = "" } = {}) => html`
  <div class="calc-row" data-row="${name}"><label class="calc-row__label" for="${"f-" + name}">${label}</label>
    <div class="calc-row__ctl"><select class="select" id="${"f-" + name}" name="${name}">${options}</select>${hint ? html`<small class="calc-hint">${hint}</small>` : ""}</div></div>`;
const radios = (name, label, items) => html`
  <div class="calc-row" data-row="${name}"><span class="calc-row__label" id="${"l-" + name}">${label}</span>
    <div class="calc-row__ctl calc-radios" role="radiogroup" aria-labelledby="${"l-" + name}">
      ${items.map(([v, t], i) => html`<label class="calc-radio"><input type="radio" name="${name}" value="${v}" ${i === 0 ? raw("checked") : ""}><span>${t}</span></label>`)}</div></div>`;
const toggle = (name, label, { on = "Ada", off = "Tidak Ada", target = "" } = {}) => html`
  <div class="calc-row" data-row="${name}"><span class="calc-row__label" id="${"l-" + name}">${label}</span>
    <div class="calc-row__ctl calc-toggle-wrap"><label class="switch"><input type="checkbox" name="${name}" aria-labelledby="${"l-" + name}" data-toggle-target="${target}"><span class="switch__track"></span><span class="switch__text" data-on="${on}" data-off="${off}">${off}</span></label>
    ${target ? money(target, "", {}) : ""}</div></div>`;
const objOptions = (list) => html`${list.map((o) => html`<option value="${o.id}">${o.label} – ${fmtPct(o.rate)}</option>`)}`;

function resultPanel(id, title, { note = "" } = {}) {
  return html`
    <aside class="calc-result" aria-live="polite" data-result="${id}">
      <div class="calc-result__head"><span class="calc-badge">${title}</span></div>
      <dl class="calc-out">
        <div><dt>DPP</dt><dd data-out="dpp">–</dd></div>
        <div><dt>Tarif</dt><dd data-out="rate">–</dd></div>
        <div class="calc-out__main"><dt data-out="label">Pajak terutang</dt><dd data-out="pph">–</dd></div>
      </dl>
      <details class="calc-steps" open><summary>Rincian penghitungan</summary><ol data-out="steps"><li class="calc-muted">Isi formulir untuk melihat rincian.</li></ol></details>
      <p class="calc-msg" data-out="msg" hidden></p>
      ${note ? html`<p class="calc-note">${icon("book", { size: 14 })}<span>${note}</span></p>` : ""}
    </aside>`;
}

const submitRow = () => html`<div class="calc-actions"><button type="reset" class="btn btn--ghost btn--sm">Atur ulang</button><button type="submit" class="btn btn--accent btn--sm">${icon("calculator", { size: 16 })} Hitung</button></div>`;

function pph21Panel() {
  const kodeBulanan = html`<option value="21-100-01">21-100-01 Pegawai Tetap</option><option value="21-100-02">21-100-02 Penerima Pensiun Berkala</option>`;
  const kodeFinal = html`${Object.entries(tax.FINAL).map(([k, v]) => html`<option value="${k}">${k} ${v.label}</option>`)}`;
  const kodeTF = html`${Object.entries(tax.TIDAK_FINAL).map(([k, v]) => html`<option value="${k}">${k} ${v.label}</option>`)}`;
  const lines = [
    ["h", "PENGHASILAN BRUTO"], [1, "Gaji/pensiun atau THT/JHT"], [2, "Tunjangan PPh"], [3, "Tunjangan lainnya, uang lembur, dan sebagainya"],
    [4, "Honorarium dan imbalan lain sejenisnya"], [5, "Premi asuransi yang dibayarkan pemberi kerja"], [6, "Penerimaan dalam bentuk natura dan kenikmatan lainnya yang dikenakan pemotongan PPh 21"],
    [7, "Tantiem, bonus, gratifikasi, jasa produksi, dan THR"], [8, "Jumlah penghasilan bruto (1 s.d. 7)", "c"],
    ["h", "PENGURANGAN"], [9, "Biaya jabatan/biaya pensiun", "c"], [10, "Iuran terkait pensiun atau hari tua"], [11, "Zakat/sumbangan keagamaan wajib melalui pemberi kerja"],
    [12, "Jumlah pengurangan (9 s.d. 11)", "c"],
    ["h", "PENGHITUNGAN PPh PASAL 21"], [13, "Jumlah penghasilan neto (8 – 12)", "c"], [14, "Penghasilan neto masa pajak sebelumnya"],
    [15, "Jumlah penghasilan neto untuk penghitungan PPh 21 (setahun/disetahunkan)", "c"], [16, "Penghasilan tidak kena pajak (PTKP)", "c"],
    [17, "Penghasilan kena pajak setahun/disetahunkan (15 – 16)", "c"], [18, "PPh 21 atas PKP setahun/disetahunkan", "c"],
    [19, "PPh 21 yang telah dipotong masa pajak sebelumnya"], [20, "PPh 21 terutang (18 – 19)", "c"],
  ];
  return html`
    <form class="calc-panel" id="pph21" data-calc="pph21" novalidate>
      <h2 class="calc-title">PPh 21</h2>
      <div class="calc-grid">
        <div class="calc-form">
          ${select("mode", "Jenis Pemotongan", html`<option value="bulanan">PPh 21 Bulanan</option><option value="final">PPh 21 Final</option><option value="tidakfinal">PPh 21 Tidak Final</option><option value="tahunan">PPh 21 Tahunan</option>`)}
          <div data-show="mode:bulanan">
            ${select("kdBulanan", "Kode Objek Pajak", kodeBulanan)}
            ${radios("grossBulanan", "Skema Penghitungan", [["0", "Gross"], ["1", "Gross Up"]])}
            ${toggle("optAkBulanan", "Penghasilan yang telah dipotong PPh 21 pada masa pajak yang sama", { target: "akBulanan" })}
            ${money("brutoBulanan", "Penghasilan Bruto", { hint: "Seluruh penghasilan bruto sebulan: gaji, tunjangan, lembur, bonus, premi yang dibayar pemberi kerja." })}
            ${select("ptkpBulanan", "PTKP", ptkpOptions(), { hint: "Menentukan kategori TER: A (TK/0, TK/1, K/0), B (TK/2, TK/3, K/1, K/2), C (K/3)." })}
          </div>
          <div data-show="mode:final" hidden>
            ${select("kdFinal", "Kode Objek Pajak", kodeFinal)}
            <div class="calc-row" data-show="kdFinal:21-401-01|21-401-02"><span class="calc-row__label"></span>
              <div class="calc-row__ctl"><label class="calc-check"><input type="checkbox" name="cbDuaTahun"> Transaksi dilakukan dalam kurun waktu 2 tahun</label></div></div>
            <div data-show="cbDuaTahun:on">${money("akFinal", "Akumulasi Penghasilan Bruto Sebelumnya")}</div>
            ${money("brutoFinal", "Penghasilan Bruto")}
            <div data-show="kdFinal:21-402-01">${select("golongan", "Golongan", html`${tax.GOLONGAN.map((g) => html`<option value="${g.rate}">${g.label}</option>`)}`)}</div>
          </div>
          <div data-show="mode:tidakfinal" hidden>
            ${select("kdTF", "Kode Objek Pajak", kodeTF)}
            <div data-show="kdTF:21-100-03">${select("jenisTF", "Jenis", html`<option value="harian">Upah harian/mingguan/satuan/borongan (TER harian)</option><option value="bulanan">Upah dibayar bulanan (TER bulanan)</option>`)}</div>
            <div data-hide="ptt-harian">
              ${radios("grossTF", "Skema Penghitungan", [["0", "Gross"], ["1", "Gross Up"]])}
              ${toggle("optAkTF", "Penghasilan yang telah dipotong PPh 21 pada masa pajak yang sama", { target: "akTF" })}
            </div>
            ${money("brutoTF", "Penghasilan Bruto")}
            <div data-show="ptt-harian">${money("hariTF", "Jumlah Hari Kerja", { hint: "Untuk menghitung rata-rata upah sehari (batas Rp450.000 dan Rp2.500.000)." })}</div>
            <div data-show="ptt-bulanan">${select("ptkpTF", "PTKP", ptkpOptions())}</div>
          </div>
          <div data-show="mode:tahunan" hidden>
            ${select("jenisTahunan", "Jenis PPh Tahunan", html`<option value="pegawai">PPh 21 Tahunan Pegawai Tetap (1721-A1)</option><option value="pensiunan">PPh 21 Tahunan Pensiunan (biaya pensiun)</option>`)}
            ${select("ptkpTahunan", "PTKP", ptkpOptions())}
            ${select("metode", "Penghitungan", html`<option value="setahun">Setahun</option><option value="disetahunkan">Disetahunkan</option>`, { hint: "Disetahunkan dipakai bila pegawai bekerja kurang dari setahun, mis. ekspatriat yang pulang ke negaranya." })}
            <div class="calc-row"><span class="calc-row__label" id="l-masa">Masa Penghasilan</span>
              <div class="calc-row__ctl calc-pair" role="group" aria-labelledby="l-masa">
                <select class="select" name="masaAwal" aria-label="Masa awal">${MONTHS.map((m, i) => html`<option value="${i + 1}">${m}</option>`)}</select>
                <span aria-hidden="true">s.d.</span>
                <select class="select" name="masaAkhir" aria-label="Masa akhir">${MONTHS.map((m, i) => html`<option value="${i + 1}" ${i === 11 ? raw("selected") : ""}>${m}</option>`)}</select>
              </div></div>
          </div>
          <div data-hide="mode:tahunan">${submitRow()}</div>
        </div>
        <div data-hide="mode:tahunan">${resultPanel("pph21", "PENGHITUNGAN PPh PASAL 21", { note: "Dasar: PP 58/2023 dan PMK 168/2023 (TER), UU HPP (tarif Pasal 17), PP 68/2009 (pesangon/manfaat pensiun sekaligus)." })}</div>
      </div>
      <div data-show="mode:tahunan" hidden>
        <div class="calc-table-wrap">
          <table class="calc-table">
            <caption class="visually-hidden">Penghitungan PPh 21 tahunan</caption>
            <tbody>${lines.map(([n, label, kind]) => n === "h"
              ? html`<tr class="calc-table__group"><th colspan="3" scope="colgroup">${label}</th></tr>`
              : html`<tr class="${kind === "c" ? "is-calc" : ""}"><td class="calc-table__n">${n}</td><th scope="row">${label}</th>
                  <td><div class="money money--sm"><span aria-hidden="true">Rp</span><input name="${"a" + n}" type="text" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="${label}" data-money ${kind === "c" ? raw("readonly tabindex=\"-1\"") : ""}></div></td></tr>`)}
            </tbody>
          </table>
        </div>
        <p class="calc-note">${icon("book", { size: 14 })}<span>Baris berlatar abu dihitung otomatis. Biaya jabatan 5% maks. Rp500.000 sebulan (biaya pensiun 5% maks. Rp200.000 sebulan). PKP dibulatkan ke bawah ke ribuan. Nilai negatif pada baris 20 berarti lebih dipotong.</span></p>
        ${submitRow()}
      </div>
    </form>`;
}

function flatPanel(id, title, list, { npwp = false, grossUp = false, note, label = "Penghasilan Bruto / DPP" }) {
  return html`
    <form class="calc-panel" id="${id}" data-calc="${id}" novalidate hidden>
      <h2 class="calc-title">${title}</h2>
      <div class="calc-grid">
        <div class="calc-form">
          ${select("obj", "Objek Pajak", objOptions(list))}
          ${grossUp ? radios("gross", "Skema Penghitungan", [["0", "Gross"], ["1", "Gross Up"]]) : ""}
          ${money("dpp", label)}
          ${npwp ? html`<div class="calc-row"><span class="calc-row__label"></span><div class="calc-row__ctl"><label class="calc-check"><input type="checkbox" name="npwp" checked> Penerima penghasilan memiliki NPWP (atau NIK terintegrasi)</label></div></div>` : ""}
          ${submitRow()}
        </div>
        ${resultPanel(id, `PENGHITUNGAN ${title.toUpperCase()}`, { note })}
      </div>
    </form>`;
}

function badanPanel() {
  return html`
    <form class="calc-panel" id="badan" data-calc="badan" novalidate hidden>
      <h2 class="calc-title">PPh Badan</h2>
      <div class="calc-grid">
        <div class="calc-form">
          ${money("peredaran", "Peredaran Bruto Setahun", { hint: "Fasilitas Pasal 31E berlaku untuk peredaran bruto sampai Rp50 miliar." })}
          ${money("pkp", "Penghasilan Kena Pajak")}
          <div class="calc-row"><span class="calc-row__label"></span><div class="calc-row__ctl"><label class="calc-check"><input type="checkbox" name="tbk"> Perseroan terbuka (≥40% saham di bursa) – tarif 19%</label></div></div>
          ${submitRow()}
        </div>
        ${resultPanel("badan", "PENGHITUNGAN PPh BADAN", { note: "Dasar: Pasal 17 ayat (1) huruf b dan Pasal 31E UU PPh s.t.d.t.d. UU HPP (tarif 22%)." })}
      </div>
    </form>`;
}

function ppnPanel(id, luxury) {
  return html`
    <form class="calc-panel" id="${id}" data-calc="${id}" novalidate hidden>
      <h2 class="calc-title">${luxury ? "PPnBM" : "PPN"}</h2>
      <div class="calc-grid">
        <div class="calc-form">
          ${luxury ? select("tarif", "Tarif PPnBM", html`${tax.PPNBM_RATES.map((r) => html`<option value="${r}">${fmtPct(r)}</option>`)}`, { hint: "Tarif mengikuti kelompok barang mewah dalam PP/PMK yang berlaku." })
            : select("jenis", "Jenis Penyerahan", html`<option value="umum">Barang/jasa kena pajak umum (DPP nilai lain 11/12)</option><option value="mewah">Barang mewah (PPN 12% x harga jual)</option>`)}
          ${radios("inklusif", "Harga", [["0", "Belum termasuk pajak"], ["1", "Sudah termasuk pajak"]])}
          ${money("harga", "Harga Jual / Nilai Penggantian")}
          ${submitRow()}
        </div>
        ${resultPanel(id, luxury ? "PENGHITUNGAN PPnBM" : "PENGHITUNGAN PPN", { note: "Dasar: UU PPN s.t.d.t.d. UU HPP dan PMK 131/2024 (tarif 12%; DPP nilai lain 11/12 untuk selain barang mewah)." })}
      </div>
    </form>`;
}

function pageHtml() {
  const main = TABS.filter((t) => t.main), more = TABS.filter((t) => !t.main);
  return html`
    <div class="calc">
      <div class="calc__head">
        <div class="calc__brand"><span class="tone-tile tone--accent">${icon("calculator", { size: 18 })}</span><div><b>Kalkulator Pajak</b><small>PPh, PPN, dan PPnBM</small></div></div>
        <nav class="calc-tabs" aria-label="Jenis pajak">
          ${main.map((t) => html`<button type="button" class="calc-tab" data-tab="${t.id}" aria-controls="${t.id}">${t.label}</button>`)}
          <div class="calc-more">
            <button type="button" class="calc-tab calc-more__btn" data-more aria-expanded="false" aria-controls="calc-more-menu">Lainnya ${icon("chevronDown", { size: 14 })}</button>
            <div class="calc-more__menu" id="calc-more-menu" hidden>${more.map((t) => html`<button type="button" data-tab="${t.id}" aria-controls="${t.id}">${t.label}</button>`)}</div>
          </div>
        </nav>
        <label class="calc-pick"><span class="visually-hidden">Jenis pajak</span><select class="select" data-pick>${TABS.map((t) => html`<option value="${t.id}">${t.label}</option>`)}</select></label>
      </div>
      <div class="calc__body">
        ${pph21Panel()}
        ${flatPanel("pph23", "PPh 23", tax.PPH23, { npwp: true, grossUp: true, note: "Dasar: Pasal 23 UU PPh dan PMK 141/2015. Tanpa NPWP tarif 100% lebih tinggi." })}
        ${flatPanel("pph42", "PPh 4 (2)", tax.PPH42, { grossUp: true, note: "Final. Dasar: PP 34/2017 (sewa tanah/bangunan), PP 9/2022 (jasa konstruksi), PP 55/2022 (UMKM), dan ketentuan sektoral lain." })}
        ${flatPanel("pph22", "PPh 22", tax.PPH22, { npwp: true, label: "Nilai Impor / Harga Pembelian", note: "Dasar: PMK 34/2017 s.t.d.t.d. PMK terakhir. Tanpa NPWP tarif 100% lebih tinggi (selain impor)." })}
        ${flatPanel("pph15", "PPh 15", tax.PPH15, { label: "Peredaran Bruto", note: "Norma penghitungan khusus untuk wajib pajak tertentu (pelayaran dan penerbangan)." })}
        ${badanPanel()}
        ${ppnPanel("ppn", false)}
        ${ppnPanel("ppnbm", true)}
      </div>
    </div>
    <p class="calc-disclaimer">${icon("sparkles", { size: 14 })}<span>Alat bantu edukasi. Hasil bersifat simulasi dan dapat berbeda dari bukti potong resmi bila ada fasilitas, ketentuan peralihan, atau perubahan peraturan. Untuk kepastian, rujuk peraturan terkait atau <a href="${pathTo("contact.html")}">hubungi saya</a>.</span></p>`;
}

// ---------------------------------------------------------------- perilaku
const parseMoney = (v) => Number(String(v || "").replace(/[^\d]/g, "")) || 0;
const fmtInput = new Intl.NumberFormat("id-ID");
const formatMoneyInput = (input) => {
  const n = parseMoney(input.value);
  input.value = input.value.trim() === "" ? "" : fmtInput.format(n);
};

function visibilityKeys(form) {
  const d = new FormData(form);
  const keys = new Set();
  for (const [k, v] of d) keys.add(`${k}:${v}`);
  form.querySelectorAll("input[type=checkbox]").forEach((c) => { if (c.checked) keys.add(`${c.name}:on`); });
  if (form.id === "pph21") {
    const ptt = d.get("kdTF") === "21-100-03";
    if (ptt && d.get("jenisTF") === "harian") keys.add("ptt-harian");
    if (ptt && d.get("jenisTF") === "bulanan") keys.add("ptt-bulanan");
  }
  return keys;
}

function syncVisibility(form) {
  const keys = visibilityKeys(form);
  const match = (spec) => spec.split(",").some((s) => {
    if (s.includes(":")) { const [k, vals] = s.split(":"); return vals.split("|").some((v) => keys.has(`${k}:${v}`)); }
    return keys.has(s);
  });
  // data-show="nama:nilai1|nilai2,kunciLain" -> tampil bila salah satu syarat cocok; data-hide kebalikannya
  form.querySelectorAll("[data-show]").forEach((el) => { el.hidden = !match(el.dataset.show); });
  form.querySelectorAll("[data-hide]").forEach((el) => { el.hidden = match(el.dataset.hide); });
  form.querySelectorAll("[data-toggle-target]").forEach((c) => {
    const row = c.closest(".calc-toggle-wrap");
    const t = row && row.querySelector(".calc-row");
    if (t) t.hidden = !c.checked;
    const txt = c.parentElement.querySelector(".switch__text");
    if (txt) txt.textContent = c.checked ? txt.dataset.on : txt.dataset.off;
  });
}

function showResult(form, r, { label = "Pajak terutang" } = {}) {
  const box = form.querySelector("[data-result]");
  if (!box) return;
  const out = (k) => box.querySelector(`[data-out="${k}"]`);
  const msg = out("msg");
  if (!r) {
    ["dpp", "rate", "pph"].forEach((k) => { out(k).textContent = "–"; });
    setHtml(out("steps"), html`<li class="calc-muted">Isi formulir untuk melihat rincian.</li>`);
    msg.hidden = true;
    return;
  }
  if (r.error) { msg.textContent = r.error; msg.hidden = false; return; }
  msg.hidden = true;
  out("dpp").textContent = rupiah(r.dpp);
  out("rate").textContent = r.rate == null ? "Progresif" : fmtPct(r.rate);
  out("label").textContent = label;
  out("pph").textContent = rupiah(r.pph);
  setHtml(out("steps"), html`${r.steps.map(([k, v]) => html`<li><span>${k}</span><b>${typeof v === "number" ? rupiah(v) : v}</b></li>`)}`);
}

function compute(form) {
  const d = new FormData(form);
  const m = (k) => parseMoney(d.get(k));
  const on = (k) => d.get(k) === "on";
  const id = form.id;
  try {
    if (id === "pph21") {
      const mode = d.get("mode");
      if (mode === "tahunan") return computeTahunan(form, d);
      if (mode === "bulanan") {
        if (!m("brutoBulanan")) return showResult(form, null);
        if (!d.get("ptkpBulanan")) return showResult(form, { error: "Pilih status PTKP untuk menentukan kategori TER." });
        return showResult(form, tax.pph21Bulanan({ bruto: m("brutoBulanan"), ptkp: d.get("ptkpBulanan"), akumulasi: on("optAkBulanan") ? m("akBulanan") : 0, grossUp: d.get("grossBulanan") === "1" }), { label: "PPh 21" });
      }
      if (mode === "final") {
        if (!m("brutoFinal")) return showResult(form, null);
        return showResult(form, tax.pph21Final({ kode: d.get("kdFinal"), bruto: m("brutoFinal"), akumulasi: on("cbDuaTahun") ? m("akFinal") : 0, golongan: d.get("golongan") }), { label: "PPh 21 Final" });
      }
      if (!m("brutoTF")) return showResult(form, null);
      const ptt = d.get("kdTF") === "21-100-03";
      if (ptt && d.get("jenisTF") === "bulanan" && !d.get("ptkpTF")) return showResult(form, { error: "Pilih status PTKP untuk menentukan kategori TER." });
      return showResult(form, tax.pph21TidakFinal({
        kode: d.get("kdTF"), jenis: d.get("jenisTF"), bruto: m("brutoTF"), hari: m("hariTF") || 1, ptkp: d.get("ptkpTF"),
        akumulasi: on("optAkTF") ? m("akTF") : 0, grossUp: d.get("grossTF") === "1",
      }), { label: "PPh 21" });
    }
    if (["pph23", "pph42", "pph22", "pph15"].includes(id)) {
      const list = { pph23: tax.PPH23, pph42: tax.PPH42, pph22: tax.PPH22, pph15: tax.PPH15 }[id];
      const obj = list.find((o) => o.id === d.get("obj"));
      if (!m("dpp")) return showResult(form, null);
      const hasNpwpBox = !!form.querySelector("[name=npwp]");
      return showResult(form, tax.flatTax({ rate: obj.rate, dpp: m("dpp"), npwp: !hasNpwpBox || on("npwp"), npwpMatters: obj.npwpMatters !== false, grossUp: d.get("gross") === "1" }));
    }
    if (id === "badan") {
      if (!m("pkp")) return showResult(form, null);
      if (!m("peredaran")) return showResult(form, { error: "Isi peredaran bruto untuk menentukan fasilitas Pasal 31E." });
      return showResult(form, tax.pphBadan({ peredaran: m("peredaran"), pkp: m("pkp"), tbk: on("tbk") }), { label: "PPh Badan" });
    }
    if (id === "ppn" || id === "ppnbm") {
      if (!m("harga")) return showResult(form, null);
      const luxury = id === "ppnbm" || d.get("jenis") === "mewah";
      const r = tax.ppn({ harga: m("harga"), inklusif: d.get("inklusif") === "1", mewah: luxury, ppnbmRate: id === "ppnbm" ? Number(d.get("tarif")) : 0 });
      return showResult(form, { dpp: r.dpp, rate: id === "ppnbm" ? Number(d.get("tarif")) : luxury ? 12 : 11, pph: id === "ppnbm" ? r.ppnbm : r.ppn, steps: r.steps },
        { label: id === "ppnbm" ? "PPnBM" : "PPN" });
    }
  } catch (e) {
    showResult(form, { error: e.message });
  }
}

function computeTahunan(form, d) {
  const m = (k) => parseMoney(d.get(k));
  const ptkp = d.get("ptkpTahunan");
  const set = (n, v) => { const el = form.querySelector(`[name="a${n}"]`); if (el) el.value = v ? fmtInput.format(v) : v === 0 ? "0" : ""; };
  if (!ptkp) { [8, 9, 12, 13, 15, 16, 17, 18, 20].forEach((n) => set(n, "")); return; }
  const r = tax.pph21Tahunan({
    gaji: m("a1"), tunjPph: m("a2"), tunjLain: m("a3"), honor: m("a4"), premi: m("a5"), natura: m("a6"), bonus: m("a7"),
    iuran: m("a10"), zakat: m("a11"), netoSebelumnya: m("a14"), pphSebelumnya: m("a19"),
    pensiunan: d.get("jenisTahunan") === "pensiunan", ptkp, metode: d.get("metode"), masaAwal: d.get("masaAwal"), masaAkhir: d.get("masaAkhir"),
  });
  [8, 9, 12, 13, 15, 16, 17, 18].forEach((n) => set(n, r.lines[n]));
  const last = form.querySelector('[name="a20"]');
  last.value = (r.lines[20] < 0 ? "-" : "") + fmtInput.format(Math.abs(r.lines[20]));
  last.closest("tr").classList.toggle("is-negative", r.lines[20] < 0);
}

function selectTab(id, { focus = false, push = true } = {}) {
  const tab = TABS.find((t) => t.id === id) || TABS[0];
  document.querySelectorAll(".calc-panel").forEach((p) => { p.hidden = p.id !== tab.id; });
  document.querySelectorAll("[data-tab]").forEach((b) => {
    const on = b.dataset.tab === tab.id;
    b.classList.toggle("is-active", on);
    on ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current");
  });
  const moreBtn = document.querySelector("[data-more]");
  moreBtn.classList.toggle("is-active", !tab.main);
  moreBtn.firstChild.textContent = tab.main ? "Lainnya " : `${tab.label} `;
  document.querySelector("[data-pick]").value = tab.id;
  closeMore();
  if (push && location.hash !== "#" + tab.id) history.replaceState(null, "", "#" + tab.id);
  if (focus) document.getElementById(tab.id)?.querySelector("select, input")?.focus();
}

function closeMore() {
  const btn = document.querySelector("[data-more]");
  document.getElementById("calc-more-menu").hidden = true;
  btn.setAttribute("aria-expanded", "false");
}

function bind(root) {
  root.querySelectorAll("form[data-calc]").forEach((form) => {
    syncVisibility(form);
    form.addEventListener("input", (e) => {
      if (e.target.matches("[data-money]")) formatMoneyInput(e.target);
      syncVisibility(form);
      compute(form);
    });
    form.addEventListener("change", () => { syncVisibility(form); compute(form); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      compute(form);
      const res = form.querySelector("[data-result]");
      if (res && res.getBoundingClientRect().top > innerHeight) res.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    form.addEventListener("reset", () => setTimeout(() => { syncVisibility(form); compute(form); showResult(form, null); }));
  });
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { selectTab(t.dataset.tab, { focus: e.detail === 0 }); return; }
    const more = e.target.closest("[data-more]");
    if (more) {
      const menu = document.getElementById("calc-more-menu");
      menu.hidden = !menu.hidden;
      more.setAttribute("aria-expanded", String(!menu.hidden));
      if (!menu.hidden && e.detail === 0) menu.querySelector("button")?.focus();
    }
  });
  root.querySelector("[data-pick]").addEventListener("change", (e) => selectTab(e.target.value));
  document.addEventListener("click", (e) => { if (!e.target.closest(".calc-more")) closeMore(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMore(); });
  window.addEventListener("hashchange", () => selectTab(location.hash.slice(1), { push: false }));
}

const root = document.getElementById("calc-root");
setHtml(root, pageHtml());
bind(root);
selectTab(location.hash.slice(1) || "pph21", { push: false });
