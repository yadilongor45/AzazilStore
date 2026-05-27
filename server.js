require("dotenv").config();

const express = require("express");
const path = require("path");
const axios = require("axios");

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const API_KEY = process.env.API_KEY;
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

app.post("/beli", async (req, res) => {
  try {
    const { nomor, paket, username } = req.body;
    console.log("USER BELI:", username);

    const kodeProduk = produkMap[paket];
    const harga = hargaMap[paket];

    if (!kodeProduk || !harga) {
      return res.json({
        sukses: false,
        pesan: "❌ Paket tidak valid"
      });
    }

    const userResponse = await axios.get(
      `${SUPABASE_URL}/rest/v1/users?username=eq.${username}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const user = userResponse.data[0];

    if (!user) {
      return res.json({
        sukses: false,
        pesan: "User tidak ditemukan"
      });
    }

    if (user.saldo < harga) {
      return res.json({
        sukses: false,
        pesan: "Saldo tidak cukup top up dulu tod"
      });
    }

    const response = await axios.get(
      `${BASE_URL}/trx?produk=${kodeProduk}&tujuan=${nomor}&api_key=${API_KEY}`
    );

    const dataKhfy = response.data;
    console.log("RESPON KHFY:", dataKhfy);

    const teks = JSON.stringify(dataKhfy).toLowerCase();

    const reffid =
      dataKhfy.data?.reffid ||
      dataKhfy.reffid ||
      dataKhfy.refid ||
      "-";

    const gagal =
      dataKhfy.ok === false ||
      teks.includes("saldo tidak mencukupi") ||
      teks.includes("stok kosong") ||
      teks.includes("produk salah") ||
      teks.includes("gagal") ||
      teks.includes("error");

    const sukses = dataKhfy.ok === true && !gagal;

    let saldoBaru = Number(user.saldo);

    await axios.post(
  `${SUPABASE_URL}/rest/v1/transaksi`,
  {
    username,
    nomor,
    paket,
    harga,
    status: gagal ? "gagal" : "pending",
    reffid
  },
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    }
  }
);

return res.json({
  sukses,
  pesan: teks.includes("stok kosong")
    ? "📦 Stok paket sedang kosong 😭"
    : gagal
    ? "Transaksi gagal, cek nomor atau coba lagi"
    : `✅ Pesanan dikirim 🔥
🆔 ID: ${reffid}
⏳ Mengecek status...

📦 Status Pesanan
📱 Nomor: ${nomor}
📦 Paket: ${paket}
📊 Status: PENDING`,
  data: {
    reffid
  }
});

} catch (err) {
  console.log("ERROR BELI:", err.response?.data || err.message);

  return res.json({
    sukses: false,
    pesan: "SERVER ERROR"
  });
}
});

app.get("/cek/:reffid", async (req, res) => {
  try {
    const refid = req.params.reffid;

    const cek = await axios.get(
      `https://panel.khfy-store.com/api_v2/history?api_key=${API_KEY}&refid=${refid}`
    );

    console.log("REFID DICEK:", refid);
    console.log("STATUS:", cek.data);

    const trxKhfy = cek.data.data?.[0];

    if (!trxKhfy) {
      return res.json(cek.data);
    }

    const statusKhfy = String(trxKhfy.status_text || "").toUpperCase();

    if (statusKhfy === "SUKSES") {
      const transaksiRes = await axios.get(
        `${SUPABASE_URL}/rest/v1/transaksi?reffid=eq.${refid}&limit=1`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`
          }
        }
      );

      const transaksi = transaksiRes.data[0];

      if (transaksi && transaksi.status !== "sukses") {
        const username = transaksi.username;
        const harga = Number(transaksi.harga);

        const userRes = await axios.get(
          `${SUPABASE_URL}/rest/v1/users?username=eq.${username}&limit=1`,
          {
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`
            }
          }
        );

        const user = userRes.data[0];

        if (user) {
          const saldoBaru = Number(user.saldo) - harga;

          const updateSaldo = await axios.patch(
            `${SUPABASE_URL}/rest/v1/users?username=eq.${username}`,
            {
              saldo: saldoBaru
            },
            {
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=representation"
              }
            }
          );

          console.log("SALDO DIPOTONG:", updateSaldo.data);

          await axios.patch(
            `${SUPABASE_URL}/rest/v1/transaksi?reffid=eq.${refid}`,
            {
              status: "sukses"
            },
            {
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
              }
            }
          );

          cek.data.saldo_baru = saldoBaru;
          cek.data.saldo_dipotong = true;
        }
      }
    }

    if (statusKhfy === "GAGAL") {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/transaksi?reffid=eq.${refid}`,
        {
          status: "gagal"
        },
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );
    }

    return res.json(cek.data);

  } catch (err) {
    console.log("ERROR CEK:", err.response?.data || err.message);

    return res.json({
      ok: false
    });
  }
});

app.post("/daftar", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (
      username.includes("<") ||
      username.includes(">") ||
      username.toLowerCase().includes("script")
    ) {
      return res.json({
        sukses: false,
        pesan: "❌ Username tidak valid"
      });
    }

    const cekUser = await axios.get(
      `${SUPABASE_URL}/rest/v1/users?username=eq.${username}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (cekUser.data.length > 0) {
      return res.json({
        sukses: false,
        pesan: "❌ Username sudah dipakai"
      });
    }

    await axios.post(
      `${SUPABASE_URL}/rest/v1/users`,
      { username, password, saldo: 0 },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }
      }
    );

    return res.json({
      sukses: true,
      pesan: "Akun berhasil dibuat 🔥"
    });
  } catch (err) {
    return res.json({
      sukses: false,
      pesan: "SERVER ERROR: " + err.message
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/users?username=eq.${username}&password=eq.${password}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
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

    return res.json({
      sukses: false,
      pesan: "Username/password salah"
    });
  } catch (err) {
    return res.json({
      sukses: false,
      pesan: "SERVER ERROR: " + err.message
    });
  }
});

app.post("/tambahsaldo", async (req, res) => {
  try {
    const { username, nominal } = req.body;

    const userResponse = await axios.get(
      `${SUPABASE_URL}/rest/v1/users?username=eq.${username}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const user = userResponse.data[0];

    if (!user) {
      return res.json({
        sukses: false,
        pesan: "User tidak ditemukan"
      });
    }

    const updateResponse = await axios.patch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${user.id}`,
      {
        saldo: Number(user.saldo) + Number(nominal)
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }
      }
    );

    console.log("UPDATE SALDO:", updateResponse.data);

    return res.json({
      sukses: true,
      pesan: "Saldo berhasil ditambah 😭🔥"
    });
  } catch (err) {
    console.log("ERROR TAMBAH SALDO:", err.response?.data || err.message);

    return res.json({
      sukses: false,
      pesan: "Server error"
    });
  }
});

app.get("/riwayat/:username", async (req, res) => {
  try {
    const username = req.params.username;

    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/transaksi?username=eq.${username}&order=id.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    return res.json(response.data);
  } catch (err) {
    return res.json([]);
  }
});

app.get("/cekstok", async (req, res) => {
  try {
    const response = await axios.get(
      "https://panel.khfy-store.com/api_v3/cek_stock_akrab",
      {
        params: {
          api_key: API_KEY
        }
      }
    );

    return res.json({
      sukses: true,
      data: response.data
    });
  } catch (err) {
    return res.json({
      sukses: false,
      pesan: "Gagal cek stok"
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server jalan");
});