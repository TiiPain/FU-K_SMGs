const STORAGE_KEYS = {
  count: "pubg-smg-death-count",
  logs: "pubg-smg-death-logs",
};

const trollMessages = [
  "TiiPain patch request: SMGs currently ignore the concept of recoil.",
  "Dear devs, my vest is not a coupon for free SMG damage.",
  "Breaking news: TiiPain eliminated by another pocket-sized laser beam.",
  "Please tune SMGs so they stop deleting me like old patch files.",
  "I did tactical positioning. The SMG did tactical time travel.",
  "SMG balance note: less blender, more gun.",
];

const deathCountEl = document.getElementById("deathCount");
const addDeathBtn = document.getElementById("addDeathBtn");
const undoDeathBtn = document.getElementById("undoDeathBtn");
const resetDeathBtn = document.getElementById("resetDeathBtn");
const trollMessageEl = document.getElementById("trollMessage");
const newMessageBtn = document.getElementById("newMessageBtn");

const deathForm = document.getElementById("deathForm");
const deathLogList = document.getElementById("deathLogList");
const clearLogsBtn = document.getElementById("clearLogsBtn");

function readCount() {
  const raw = Number(localStorage.getItem(STORAGE_KEYS.count));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function writeCount(value) {
  localStorage.setItem(STORAGE_KEYS.count, String(Math.max(0, value)));
}

function readLogs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.logs) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(logs) {
  localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(logs));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

function renderCount() {
  deathCountEl.textContent = String(readCount());
}

function renderLogs() {
  const logs = readLogs();
  if (!logs.length) {
    deathLogList.innerHTML = '<li class="log-item">No manual logs yet.</li>';
    return;
  }

  deathLogList.innerHTML = logs
    .slice()
    .reverse()
    .map((entry) => {
      const killer = escapeHtml(entry.killerName || "Unknown");
      const platform = escapeHtml(entry.platform || "other");
      const happenedAt = formatDate(entry.matchTime);
      return `<li class="log-item"><strong>${killer}</strong> (${platform}) ended your run at ${happenedAt}</li>`;
    })
    .join("");
}

function pickMessage() {
  const i = Math.floor(Math.random() * trollMessages.length);
  trollMessageEl.textContent = trollMessages[i];
}

function setFutureClipState() {
  const clipButton = document.querySelector(".killer-card .btn");
  if (clipButton) {
    clipButton.title = "Clipping will be implemented later.";
  }
}

addDeathBtn.addEventListener("click", () => {
  writeCount(readCount() + 1);
  renderCount();
});

undoDeathBtn.addEventListener("click", () => {
  writeCount(Math.max(0, readCount() - 1));
  renderCount();
});

resetDeathBtn.addEventListener("click", () => {
  writeCount(0);
  renderCount();
});

newMessageBtn.addEventListener("click", pickMessage);

deathForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const killerName = document.getElementById("killerName").value.trim();
  const platform = document.getElementById("platform").value;
  const matchTime = document.getElementById("matchTime").value;
  if (!killerName || !matchTime) return;

  const logs = readLogs();
  logs.push({ killerName, platform, matchTime });
  writeLogs(logs);
  writeCount(readCount() + 1);
  deathForm.reset();
  renderCount();
  renderLogs();
});

clearLogsBtn.addEventListener("click", () => {
  writeLogs([]);
  renderLogs();
});

renderCount();
renderLogs();
pickMessage();
setFutureClipState();
