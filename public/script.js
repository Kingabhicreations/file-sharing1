require("dotenv").config();
const fileInput = document.getElementById("file");
const fileInfo = document.getElementById("fileInfo");
const themeToggle = document.getElementById("themeToggle");

if (localStorage.theme === "light") {
  document.body.classList.add("light");
  themeToggle.textContent = "🌞";
}

themeToggle.onclick = () => {
  document.body.classList.toggle("light");
  const light = document.body.classList.contains("light");
  localStorage.theme = light ? "light" : "dark";
  themeToggle.textContent = light ? "🌞" : "🌙";
};

fileInput.onchange = () => {
  const f = fileInput.files[0];
  if (!f) return;
  const size = (f.size / (1024 * 1024)).toFixed(2);
  fileInfo.innerHTML = `<p><b>${f.name}</b><br>${size} MB</p>`;
};

function upload() {
  const f = fileInput.files[0];
  if (!f) return alert("Select file");

  const data = new FormData();
  data.append("file", f);
  data.append("password", password.value);
  data.append("expiry", expiry.value);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload");

  xhr.upload.onprogress = e => {
    if (e.lengthComputable)
      progress.value = (e.loaded / e.total) * 100;
  };

  xhr.onload = () => {
    const res = JSON.parse(xhr.responseText);
    result.innerHTML = `
      <p>✅ Upload Success</p>
      <a href="${res.url}" target="_blank">${res.url}</a>
      <br><img src="${res.qr}" width="180">
    `;
  };

  xhr.send(data);
}
