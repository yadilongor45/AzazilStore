require("dotenv").config();
const express = require("express");
const path = require("path");
const axios = require("axios");

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const API_KEY = process.env.API_KEY;
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "KunciRahasiaAdmin123!!"; // TAMBAHKAN DI .ENV LO
const BASE_URL = "https://panel.khfy-store.com/api_v2";

const produkMap = {
  "SuperMini - Rp45.000": "XLA14",
  "Mini - Rp58.000": "XLA32",
  "Big - Rp62.000": "XLA39",
  "Jumbo V2 - Rp72.000": "XLA51",
  "MegaBig - Rp97.000": "XLA89",
  "Jumbo - Rp99.000": "XLA65"
};

const hargaMap = {
  "SuperMini - Rp45.000": 45000,
  "Mini - Rp58.000": 58000,
  "Big - Rp62.000": 62000,
  "Jumbo V2 - Rp72.000": 72000,
  "MegaBig - Rp97.000": 97000,
  "Jumbo - Rp99.000": 99000
};

app.use(express.json());
app.use(express.static(__dirname));

// Header bawaan untuk Supabase Axios
const supabaseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json"
};

// ==================== ENDPOINT: BELI ====================
app.post("/beli", async (req, res) => {
  try {
    const { nomor, paket, username } = req.body;
    console.log("USER BELI:", username);

    const kodeProduk = produkMap[paket];
    const harga = hargaMap[paket];

    if (!nomor || !kodeProduk || !harga) {
      return res.json({ sukses: false, pesan: "❌ Paket atau data tidak valid" });
    }

    // Ambil data user
    const userResponse = await axios.get(
      `${SUPABASE_URL}/rest/v1/users?username=eq.${encodeURIComponent(username)}`,
      { headers: supabaseHeaders }
    );
    const user = userResponse.data[0];

    if (!user) {
      return res.json({ sukses: false, pesan: "User tidak ditemukan" });
    }

    if (Number(user.saldo) < harga) {
      return res.json({ sukses: false, pesan: "Saldo tidak cukup, top up dulu tod!" });
    }

    // Tembak API Supplier
    const response = await axios.get(
      `${BASE_URL}/trx?produk=${kodeProduk}&tujuan=${nomor}&api_key=${API_KEY}`
    );

    const dataKhfy = response.data;
    const trxid = dataKhfy.data?.trxid || "-";
    const kode_produk = dataKhfy.data?.produk || kodeProduk;
    console.log("RESPON KHFY:", dataKhfy);

    const teks = JSON.stringify(dataKhfy).toLowerCase();

    let reffid = dataKhfy.data?.reffid || dataKhfy.reffid || dataKhfy.refid || "-";
    if (dataKhfy.msg && dataKhfy.msg.includes("RC=")) {
      const match = dataKhfy.msg.match(/RC=([a-f0-9-]+)/i);
      if (match) reffid = match[1];
    }

    const gagal =
      dataKhfy.ok === false ||
      teks.includes("saldo tidak mencukupi") ||
      teks.includes("stok kosong") ||
      teks.includes("produk salah") ||
      teks.includes("gagal") ||
      teks.includes("error");

    const sukses = dataKhfy.ok === true && !gagal;
    let saldoBaru = Number(user.saldo);

    if (sukses) {
      saldoBaru = Number(user.saldo) - harga;

      // UPDATE SALDO (Amankan dengan filter ID)
      const updateSaldo = await axios.patch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${user.id}`,
        { saldo: saldoBaru },
        { headers: { ...supabaseHeaders, Prefer: "return=representation" } }
      );

      if (!updateSaldo.data || updateSaldo.data.length === 0) {
        return res.json({ sukses: false, pesan: "❌ Gagal memotong saldo, coba lagi" });
      }
    }

    // SIMPAN TRANSAKSI
    await axios.post(
      `${SUPABASE_URL}/rest/v1/transaksi`,
      {
        username,
        nomor,
        paket,
        harga,
        status: sukses ? "pending_dipotong" : "gagal",
        reffid,
        trxid,
        kode_produk,
        keterangan: dataKhfy.msg || "-"
      },
      { headers: { ...supabaseHeaders, Prefer: "return=minimal" } }
    );

    return res.json({
      sukses,
      pesan: teks.includes("stok kosong")
        ? "📦 Stok paket sedang kosong 😭"
        : gagal
        ? "Transaksi gagal, cek nomor atau coba lagi"
        : `✅ Pesanan dikirim 🔥\n🆔 ID: ${reffid}\n⏳ Mengecek status...\n\n📦 Status Pesanan\n📱 Nomor: ${nomor}\n📦 Paket: ${paket}\n📊 Status: PENDING`,
      data: { reffid, saldo: saldoBaru }
    });

  } catch (err) {
    console.log("ERROR BELI:", err.response?.data || err.message);
    return res.json({ sukses: false, pesan: "SERVER ERROR" });
  }
});

// Helper pembersih teks
function bersihkanKeteranganKhfy(teks) {
  if (!teks) return "-";
  teks = String(teks);
  teks = teks.replace(/password=([^&\s]+)/gi, "password=***");
  teks = teks.replace(/pin=([^&\s]+)/gi, "pin=***");
  teks = teks.replace(/kodereseller=([^&\s]+)/gi, "kodereseller=***");

  if (teks.includes("#")) {
    teks = teks.split("#").pop().trim();
  }
  if (teks.toLowerCase().includes("trx?")) {
    return "Transaksi gagal / provider gangguan";
  }
  return teks;
}

// ==================== ENDPOINT: CEK STATUS ====================
app.get("/cek/:reffid", async (req, res) => {
  try {
    const refid = req.params.reffid;

    const cek = await axios.get(
      `https://panel.khfy-store.com/api_v2/history?api_key=${API_KEY}&refid=${refid}`
    );

    const trxKhfy = cek.data.data?.[0];
    if (!trxKhfy) return res.json(cek.data);

    const statusKhfy = String(trxKhfy.status_text || "").toUpperCase();

    // Sync info detail transaksi ke Supabase
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/transaksi?reffid=eq.${refid}`,
      {
        trxid: String(trxKhfy.kode || ""),
        kode_produk: trxKhfy.kode_produk || "",
        keterangan: bersihkanKeteranganKhfy(trxKhfy.keterangan || trxKhfy.sn || "-"),
        sn: trxKhfy.sn || ""
      },
      { headers: supabaseHeaders }
    );

    // Dapatkan data transaksi internal saat ini
    const transaksiRes = await axios.get(
      `${SUPABASE_URL}/rest/v1/transaksi?reffid=eq.${refid}&limit=1`,
      { headers: supabaseHeaders }
    );
    const transaksi = transaksiRes.data[0];

    if (!transaksi) return res.json(cek.data);

    if (statusKhfy === "SUKSES" && transaksi.status !== "sukses") {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/transaksi?reffid=eq.${refid}`,
        { status: "sukses" },
        { headers: supabaseHeaders }
      );
    }

    if (statusKhfy === "GAGAL" && transaksi.status === "pending_dipotong") {
      const username = String(transaksi.username || "").trim();
      const harga = Number(transaksi.harga);

      const userRes = await axios.get(
        `${SUPABASE_URL}/rest/v1/users?username=eq.${encodeURIComponent(username)}&limit=1`,
        { headers: supabaseHeaders }
      );
      const user = userRes.data[0];

      if (user) {
        const saldoRefund = Number(user.saldo) + harga;

        // Refund saldo
        await axios.patch(
          `${SUPABASE_URL}/rest/v1/users?id=eq.${user.id}`,
          { saldo: saldoRefund },
          { headers: { ...supabaseHeaders, Prefer: "return=representation" } }
        );

        cek.data.saldo_refund = true;
        cek.data.saldo_baru = saldoRefund;
      }

      // Set status internal jadi gagal agar tidak di-refund berkali-kali
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/transaksi?reffid=eq.${refid}`,
        { status: "gagal" },
        { headers: supabaseHeaders }
      );
    }

    return res.json(cek.data);
  } catch (err) {
    console.log("ERROR CEK:", err.response?.data || err.message);
    return res.json({ ok: false });
  }
});

// ==================== ENDPOINT: DAFTAR & LOGIN ====================
app.post("/daftar", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || username.includes("<") || username.includes(">") || username.toLowerCase().includes("script")) {
      return res.json({ sukses: false, pesan: "❌ Username/Password tidak valid" });
    }

    const cekUser = await axios.get(
      `${SUPABASE_URL}/rest/v1/users?username=eq.${encodeURIComponent(username)}`,
      { headers: supabaseHeaders }
    );

    if (cekUser.data.length > 0) {
      return res.json({ sukses: false, pesan: "❌ Username sudah dipakai" });
    }

    await axios.post(
      `${SUPABASE_URL}/rest/v1/users`,
      { username, password, saldo: 0 }, // Catatan Guru: Next time kita pakai bcrypt di sini!
      { headers: { ...supabaseHeaders, Prefer: "return=minimal" } }
    );

    return res.json({ sukses: true, pesan: "Akun berhasil dibuat 🔥" });
  } catch (err) {
    return res.json({ sukses: false, pesan: "SERVER ERROR" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/users?username=eq.${encodeURIComponent(username)}&password=eq.${encodeURIComponent(password)}`,
      { headers: supabaseHeaders }
    );

    if (response.data.length > 0) {
      const user = response.data[0];
      return res.json({
        sukses: true,
        pesan: "Login berhasil 🔥",
        username: user.username,
        saldo: user.saldo || 0
      });
    }

    return res.json({ sukses: false, pesan: "Username/password salah" });
  } catch (err) {
    return res.json({ sukses: false, pesan: "SERVER ERROR" });
  }
});

// ==================== ENDPOINT: TAMBAH SALDO (DIAMANKAN!) ====================
app.post("/tambahsaldo", async (req, res) => {
  try {
    const { username, nominal, secret_key } = req.body;

    // VALIDASI 1: Harus menyertakan Secret Key admin
    if (!secret_key || secret_key !== ADMIN_SECRET_KEY) {
      return res.status(403).json({ sukses: false, pesan: "⛔ Lu bukan admin, dilarang tembak API!" });
    }

    // VALIDASI 2: Nominal harus berupa angka positif
    if (!nominal || Number(nominal) <= 0) {
      return res.json({ sukses: false, pesan: "❌ Nominal harus lebih dari 0" });
    }

    const userResponse = await axios.get(
      `${SUPABASE_URL}/rest/v1/users?username=eq.${encodeURIComponent(username)}`,
      { headers: supabaseHeaders }
    );
    const user = userResponse.data[0];

    if (!user) {
      return res.json({ sukses: false, pesan: "User tidak ditemukan" });
    }

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${user.id}`,
      { saldo: Number(user.saldo) + Number(nominal) },
      { headers: { ...supabaseHeaders, Prefer: "return=minimal" } }
    );

    return res.json({ sukses: true, pesan: "Saldo berhasil ditambah 😭🔥" });
  } catch (err) {
    console.log("ERROR TAMBAH SALDO:", err.response?.data || err.message);
    return res.json({ sukses: false, pesan: "Server error" });
  }
});

// ==================== GET DATA UTILITY ====================
app.get("/riwayat/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/transaksi?username=eq.${encodeURIComponent(username)}&order=id.desc&limit=50`,
      { headers: supabaseHeaders }
    );
    return res.json(response.data);
  } catch (err) {
    return res.json([]);
  }
});

app.get("/saldo/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/users?username=eq.${encodeURIComponent(username)}&limit=1`,
      { headers: supabaseHeaders }
    );
    const user = response.data[0];

    if (!user) return res.json({ sukses: false, pesan: "User tidak ditemukan" });
    return res.json({ sukses: true, saldo: user.saldo });
  } catch (err) {
    return res.json({ sukses: false, pesan: "Gagal refresh saldo" });
  }
});

app.get("/cekstok", async (req, res) => {
  try {
    const response = await axios.get("https://panel.khfy-store.com/api_v3/cek_stock_akrab", {
      params: { api_key: API_KEY }
    });
    return res.json({ sukses: true, data: response.data });
  } catch (err) {
    return res.json({ sukses: false, pesan: "Gagal cek stok" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
});