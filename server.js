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
app.use(express.static("public"));

/* ================= DATABASE ================= */

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect(err => {
  if (err) {
    console.error("❌ MySQL Connection Failed:", err.message);
    process.exit(1);
  }
  console.log("✅ MySQL Connected");
});

/* ================= LOCAL IP ================= */

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

const IP = getLocalIP();

/* ================= UPLOAD FOLDER ================= */

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

/* ================= MULTER ================= */

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) }
});

/* ================= UPLOAD API ================= */

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

    const fileUrl = `http://${IP}:${process.env.PORT}/file/${req.file.filename}`;
    const qr = await QRCode.toDataURL(fileUrl);

    res.json({ url: fileUrl, qr });
  } catch (err) {
    res.status(500).send("Upload failed");
  }
});

/* ================= FILE ACCESS ================= */

app.get("/file/:name", (req, res) => {
  const filename = req.params.name;

  db.query(
    "SELECT * FROM files WHERE filename=?",
    [filename],
    (err, rows) => {
      if (err || rows.length === 0)
        return res.send("File not found");

      const file = rows[0];

      if (file.expires_at && new Date() > file.expires_at)
        return res.send("File expired");

      if (file.password) {
        return res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Secure Download</title>
<style>
body{
  margin:0;
  font-family:Arial;
  background:#667eea;
  height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
}
.card{
  background:#fff;
  padding:25px;
  border-radius:12px;
  width:320px;
  text-align:center;
}
input,button{
  width:100%;
  padding:12px;
  margin-top:10px;
}
button{
  background:#00e6a8;
  border:none;
  font-weight:bold;
  cursor:pointer;
}
</style>
</head>
<body>
<div class="card">
<h3>🔒 Protected File</h3>
<form method="POST" action="/verify/${filename}">
<input type="password" name="password" placeholder="Enter password" required>
<button>Download</button>
</form>
</div>
</body>
</html>
        `);
      }

      db.query(
        "UPDATE files SET downloads = downloads + 1 WHERE filename=?",
        [filename]
      );

      res.download(path.resolve(file.filepath), file.filename);
    }
  );
});

/* ================= VERIFY PASSWORD ================= */

app.post("/verify/:name", async (req, res) => {
  const filename = req.params.name;

  db.query(
    "SELECT * FROM files WHERE filename=?",
    [filename],
    async (err, rows) => {
      if (err || rows.length === 0)
        return res.send("File not found");

      const file = rows[0];
      const match = await bcrypt.compare(req.body.password, file.password);

      if (!match) return res.send("Wrong password");

      db.query(
        "UPDATE files SET downloads = downloads + 1 WHERE filename=?",
        [filename]
      );

      res.download(path.resolve(file.filepath), file.filename);
    }
  );
});

/* ================= ADMIN PANEL ================= */

app.get("/admin", (req, res) => {
  db.query("SELECT * FROM files ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.send("Database error");

    let html = `
<html>
<head>
<title>Admin Dashboard</title>
</head>
<body>
<h2>📊 File Analytics</h2>
<table border="1" cellpadding="10">
<tr>
<th>File</th>
<th>Uploaded</th>
<th>Expiry</th>
<th>Downloads</th>
</tr>
`;

    rows.forEach(f => {
      html += `
<tr>
<td>${f.filename}</td>
<td>${f.created_at}</td>
<td>${f.expires_at || "Never"}</td>
<td>${f.downloads}</td>
</tr>`;
    });

    html += "</table></body></html>";
    res.send(html);
  });
});

/* ================= AUTO DELETE ================= */

setInterval(() => {
  db.query(
    "DELETE FROM files WHERE expires_at IS NOT NULL AND expires_at < NOW()"
  );
}, 60000);

/* ================= SERVER ================= */

app.listen(process.env.PORT, process.env.HOST, () => {
  console.log("🚀 Server Running");
  console.log(`Local   : http://localhost:${process.env.PORT}`);
  console.log(`Network : http://${IP}:${process.env.PORT}`);
});
