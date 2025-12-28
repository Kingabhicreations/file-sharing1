const fileInput = document.getElementById("file");
const fileInfo = document.getElementById("fileInfo");
const progress = document.getElementById("progress");
const result = document.getElementById("result");
const password = document.getElementById("password");
const expiry = document.getElementById("expiry");
const themeToggle = document.getElementById("themeToggle");

themeToggle.onclick = () => {
  document.body.classList.toggle("light");
};

fileInput.onchange = () => {
  const f = fileInput.files[0];
  if (f) fileInfo.innerHTML = `<b>${f.name}</b>`;
};

function upload() {
  const f = fileInput.files[0];
  if (!f) return alert("Select a file");

  const data = new FormData();
  data.append("file", f);
  data.append("password", password.value);
  data.append("expiry", expiry.value);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload");

  xhr.upload.onprogress = e => {
    progress.value = (e.loaded / e.total) * 100;
  };

  xhr.onload = () => {
    const r = JSON.parse(xhr.responseText);
    result.innerHTML = `<a href="${r.url}" target="_blank">${r.url}</a><br><img src="${r.qr}" width="150">`;
  };

  xhr.send(data);
}
