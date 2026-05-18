const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://wfctjfmigareigamzhbqy.supabase.co";
const SUPABASE_KEY = "ISI_ANON_KEY_LU";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const express = require("express");
const path = require("path");
const axios = require("axios");

const app = express();

const API_KEY = "E9B35F56-A487-4634-9C41-2CBAA8A094AC";

const produkMap = {
"SuperMini - Rp52.000":"XLA14",
"Mini - Rp64.000":"XLA32",
"Big - Rp69.000":"XLA39",
"Jumbo V2 - Rp79.000":"XLA51",
"MegaBig - Rp104.000":"XLA89",
"Jumbo - Rp107.000":"XLA65"
};

app.use(express.json());
app.use(express.static(__dirname));

app.post("/beli", async(req,res)=>{

try{

const {nomor,paket}=req.body;

const kodeProduk = produkMap[paket];

const response = await axios.get(
`https://panel.khfy-store.com/api_v2/trx?produk=${kodeProduk}&tujuan=${nomor}&api_key=${API_KEY}`
);

res.json({
sukses:true,
pesan:"Pesanan dikirim 🔥",
data:response.data
});

}catch(e){

res.json({
sukses:false,
pesan:"Transaksi gagal 😭"
});

}

});
app.get("/cek/:id", async(req,res)=>{

try{

const id=req.params.id;

const response=await axios.get(
`https://panel.khfy-store.com/api_v2/history?api_key=${API_KEY}&refid=${id}`
);

res.json(response.data);

}catch{

res.json({
status:"gagal"
});

}

});
app.post("/daftar", async (req, res) => {
  try {
    const { username, password } = req.body;

    const { error } = await db
      .from("users")
      .insert([{ username, password }]);

    if (error) {
      return res.json({
        sukses:false,
        pesan:error.message
      });
    }

    res.json({
      sukses:true,
      pesan:"Akun berhasil dibuat 🔥"
    });

  } catch (err) {

    res.json({
      sukses:false,
      pesan:"SERVER ERROR: "+err.message
    });

  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("username", username)
    .eq("password", password);

  if (error) {
    return res.json({ sukses: false, pesan: error.message });
  }

  if (data.length > 0) {
    return res.json({ sukses: true, pesan: "Login berhasil 🔥" });
  }

  res.json({ sukses: false, pesan: "Username/password salah" });
});
app.get("/",(req,res)=>{
res.sendFile(path.join(__dirname,"index.html"));
});

app.listen(3000,()=>{
console.log("Server jalan di http://localhost:3000");
});