require("dotenv").config();

const express = require("express");
const multer = require("multer");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const os = require("os");
const path = require("path");
const fs = require("fs");

const app = express();

/* ================= MIDDLEWARE ================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

/* ================= DATABASE ================= */

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect(err => {
  if (err) {
    console.error("❌ MySQL Error:", err.message);
    process.exit(1);
  }
  console.log("✅ MySQL Connected");
});

/* ================= LOCAL IP ================= */

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

const IP = getLocalIP();

/* ================= UPLOAD FOLDER ================= */

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

/* ================= MULTER ================= */

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) }
});

/* ================= ROUTES ================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

/* ---------- UPLOAD ---------- */

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { password, expiry } = req.body;

    const hashedPassword = password
      ? await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS))
      : null;

    const expiresAt = expiry
      ? new Date(Date.now() + expiry * 60000)
      : null;

    db.query(
      "INSERT INTO files (filename, filepath, password, expires_at) VALUES (?,?,?,?)",
      [req.file.filename, req.file.path, hashedPassword, expiresAt]
    );

    const url = `http://${IP}:${process.env.PORT}/file/${req.file.filename}`;
    const qr = await QRCode.toDataURL(url);

    res.json({ url, qr });
  } catch {
    res.status(500).send("Upload failed");
  }
});

/* ---------- FILE ACCESS ---------- */

app.get("/file/:name", (req, res) => {
  const name = req.params.name;

  db.query("SELECT * FROM files WHERE filename=?", [name], (err, rows) => {
    if (err || rows.length === 0) return res.send("File not found");

    const file = rows[0];

    if (file.expires_at && new Date() > file.expires_at)
      return res.send("File expired");

    /* 🔐 IMPROVED PASSWORD UI */
    if (file.password) {
      return res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Secure Download</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{
  margin:0;
  height:100vh;
  display:flex;
  justify-content:center;
  align-items:center;
  background:linear-gradient(135deg,#667eea,#764ba2);
  font-family:Arial,sans-serif;
}
.card{
  background:#fff;
  padding:30px;
  width:340px;
  border-radius:18px;
  box-shadow:0 25px 50px rgba(0,0,0,.35);
  text-align:center;
}
.lock{
  font-size:42px;
  margin-bottom:10px;
}
h2{
  margin:10px 0;
}
p{
  font-size:14px;
  color:#555;
}
input{
  width:100%;
  padding:12px;
  margin-top:15px;
  border-radius:10px;
  border:1px solid #ccc;
  font-size:15px;
}
button{
  width:100%;
  padding:12px;
  margin-top:18px;
  background:#667eea;
  color:#fff;
  border:none;
  border-radius:10px;
  font-size:16px;
  cursor:pointer;
}
button:hover{
  background:#5563d6;
}
</style>
</head>
<body>

<div class="card">
  <div class="lock">🔒</div>
  <h2>Protected File</h2>
  <p>Enter password to download</p>

  <form method="POST" action="/verify/${name}">
    <input type="password" name="password" placeholder="Enter password" required>
    <button>Unlock & Download</button>
  </form>
</div>

</body>
</html>
      `);
    }

    res.download(path.resolve(file.filepath));
  });
});

/* ---------- VERIFY PASSWORD ---------- */

app.post("/verify/:name", async (req, res) => {
  const name = req.params.name;

  db.query("SELECT * FROM files WHERE filename=?", [name], async (err, rows) => {
    if (err || rows.length === 0) return res.send("File not found");

    const file = rows[0];
    const ok = await bcrypt.compare(req.body.password, file.password);

    if (!ok) return res.send("❌ Wrong password");

    res.download(path.resolve(file.filepath));
  });
});

/* ================= SERVER ================= */

app.listen(process.env.PORT, process.env.HOST, () => {
  console.log("🚀 Server Running");
  console.log(`Local   : http://localhost:${process.env.PORT}`);
  console.log(`Network : http://${IP}:${process.env.PORT}`);
});
