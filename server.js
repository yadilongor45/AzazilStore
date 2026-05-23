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
  "SuperMini - Rp52.000": "XLA14",
  "Mini - Rp64.000": "XLA32",
  "Big - Rp69.000": "XLA39",
  "Jumbo V2 - Rp79.000": "XLA51",
  "MegaBig - Rp104.000": "XLA89",
  "Jumbo - Rp107.000": "XLA65"
};

app.use(express.json());
app.use(express.static(__dirname));

app.post("/beli", async(req,res)=>{
try{

const {nomor,paket,username}=req.body;
const kodeProduk=produkMap[paket];
const hargaMap = {
"SuperMini - Rp52.000":52000,
"Mini - Rp64.000":64000,
"Big - Rp69.000":69000,
"Jumbo V2 - Rp79.000":79000,
"MegaBig - Rp104.000":104000,
"Jumbo - Rp107.000":107000
};

const harga=hargaMap[paket];
const userResponse=await axios.get(
`${SUPABASE_URL}/rest/v1/users?username=eq.${username}`,
{
headers:{
apikey:SUPABASE_KEY,
Authorization:`Bearer ${SUPABASE_KEY}`
}
}
);

const user=userResponse.data[0];

if(!user){

return res.json({
sukses:false,
pesan:"User tidak ditemukan"
});

}

if(user.saldo < harga){

return res.json({
sukses:false,
pesan:"Saldo tidak cukup top up dulu tod"
});

}
const response=await axios.get(
`${BASE_URL}/trx?produk=${kodeProduk}&tujuan=${nomor}&api_key=${API_KEY}`
);

const dataKhfy=response.data;

console.log("RESPON KHFY:",dataKhfy);

const teks=JSON.stringify(dataKhfy).toLowerCase();

const gagal=
teks.includes("saldo tidak mencukupi") ||
teks.includes("stok kosong") ||
teks.includes("gagal") ||
teks.includes("error");

if(!gagal){

await axios.patch(
`${SUPABASE_URL}/rest/v1/users?username=eq.${username}`,
{
saldo:user.saldo-harga
},
{
headers:{
apikey:SUPABASE_KEY,
Authorization:`Bearer ${SUPABASE_KEY}`,
"Content-Type":"application/json",
Prefer:"return=representation"
}
}
);

}

await axios.post(
`${SUPABASE_URL}/rest/v1/transaksi`,
{
username,
nomor,
paket,
harga,
status:gagal ? "gagal":"sukses",
reffid:dataKhfy.data?.reffid || "-"
},
{
headers:{
apikey:SUPABASE_KEY,
Authorization:`Bearer ${SUPABASE_KEY}`,
"Content-Type":"application/json"
}
}
);

return res.json({
sukses:!gagal,
pesan: teks.includes("stok kosong")
? "📦 Stok paket sedang kosong 😭"
: gagal
? "❌ Transaksi gagal, cek nomor atau coba lagi"
: "✅ Pesanan dikirim 🔥",

data:{
reffid:dataKhfy.data?.reffid || "-"
}

});
}catch(err){

res.json({
sukses:false,
pesan:"SERVER ERROR"
});

}

});

app.get("/cek/:refid", async(req,res)=>{
try{

const refid=req.params.refid;
console.log("REFID DICEK:", refid);
console.log("STATUS:", response.data);

const response=await axios.get(
`${BASE_URL}/history?api_key=${API_KEY}&refid=${refid}`
);

res.json(response.data);

}catch(err){

console.log("ERROR CEK STATUS:", err.response?.data);
console.log("STATUS CODE:", err.response?.status);

res.json({
sukses:false,
pesan:"Gagal cek status",
status:err.response?.status,
detail:err.response?.data
});

}

});
app.post("/daftar", async (req, res) => {
  try {
    const { username, password } = req.body;

    await axios.post(
      `${SUPABASE_URL}/rest/v1/users`,
      { username, password },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }
      }
    );

    res.json({ sukses: true, pesan: "Akun berhasil dibuat 🔥" });
  } catch (err) {
    res.json({
      sukses: false,
      pesan: "SERVER ERROR: " + err.message,
      status: err.response?.status,
      detail: err.response?.data
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

const user=response.data[0];

return res.json({
sukses:true,
pesan:"Login berhasil 🔥",
username:user.username,
saldo:user.saldo
});

}

    res.json({ sukses: false, pesan: "Username/password salah" });
  } catch (err) {
    res.json({
      sukses: false,
      pesan: "SERVER ERROR: " + err.message,
      status: err.response?.status,
      detail: err.response?.data
    });
  }
});

app.post("/tambahsaldo", async(req,res)=>{

try{

const {
username,
nominal
}=req.body;

const userResponse=
await axios.get(

`${SUPABASE_URL}/rest/v1/users?username=eq.${username}`,

{
headers:{
apikey:SUPABASE_KEY,
Authorization:`Bearer ${SUPABASE_KEY}`,
"Content-Type":"application/json",
Prefer:"return=representation"
}

}

);

const user=
userResponse.data[0];

if(!user){

return res.json({

sukses:false,
pesan:"User tidak ditemukan"

});

}

const updateResponse = await axios.patch(

`${SUPABASE_URL}/rest/v1/users?username=eq.${username}`,

{
saldo:
Number(
user.saldo
)+
Number(
nominal
)
},

{
headers:{
apikey:SUPABASE_KEY,
Authorization:
`Bearer ${SUPABASE_KEY}`,
"Content-Type":
"application/json"
}
}

);

console.log("UPDATE SALDO:", updateResponse.data);

return res.json({

sukses:true,
pesan:
"Saldo berhasil ditambah 😭🔥"

});

}catch(err){

console.log("ERROR TAMBAH SALDO:", err.response?.data || err.message);

return res.json({
sukses:false,
pesan:"Server error"
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