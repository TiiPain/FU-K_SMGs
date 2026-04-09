const STORAGE_KEYS = {
  count: "pubg-smg-death-count",
  logs: "pubg-smg-death-logs",
};

const trollMessages = [
  "Dear PUBG devs: my armor is decorative and SMGs are a philosophical problem.",
  "At this point SMG bullets have my home address.",
  "Please nerf whatever laser beam shredded me in 0.2 seconds.",
  "My strategy is solid. Your SMGs are just built different.",
  "I did not lose that fight. The SMG won a legal loophole.",
  "Patch notes request: make SMGs respect personal space.",
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
const clipFinderForm = document.getElementById("clipFinderForm");
const clipResults = document.getElementById("clipResults");

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

function renderCount() {
  deathCountEl.textContent = String(readCount());
}

function formatDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderLogs() {
  const logs = readLogs();
  if (!logs.length) {
    deathLogList.innerHTML = "<li class=\"log-item\">No deaths logged yet. Blessed run.</li>";
    return;
  }

  deathLogList.innerHTML = logs
    .slice()
    .reverse()
    .map((entry) => {
      const killer = escapeHtml(entry.killerName || "Unknown");
      const platform = escapeHtml(entry.platform || "other");
      const happenedAt = formatDate(entry.matchTime);

      return `<li class="log-item"><strong>${killer}</strong> (${platform}) deleted you on ${happenedAt}</li>`;
    })
    .join("");
}

function pickMessage() {
  const index = Math.floor(Math.random() * trollMessages.length);
  trollMessageEl.textContent = trollMessages[index];
}

function buildSearchLinks(killerName, deathTimeISO) {
  const killer = encodeURIComponent(killerName.trim());
  const deathTime = new Date(deathTimeISO);
  const readableTime = Number.isNaN(deathTime.getTime())
    ? "unknown"
    : deathTime.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return [
    {
      label: `Search Twitch videos for ${killerName}`,
      url: `https://www.twitch.tv/search?term=${killer}`,
      hint: `Check VOD timestamps near ${readableTime}.`,
    },
    {
      label: `Search YouTube live for ${killerName}`,
      url: `https://www.youtube.com/results?search_query=${killer}+live`,
      hint: `Open channels and look for streams around ${readableTime}.`,
    },
    {
      label: `Search Kick for ${killerName}`,
      url: `https://kick.com/search/channels?query=${killer}`,
      hint: `If they were live, clip near ${readableTime}.`,
    },
  ];
}

function renderClipResults(links) {
  clipResults.innerHTML = links
    .map(
      (link) =>
        `<div><a class="clip-link" href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a><p>${link.hint}</p></div>`
    )
    .join("");
}

addDeathBtn.addEventListener("click", () => {
  const current = readCount();
  writeCount(current + 1);
  renderCount();
});

undoDeathBtn.addEventListener("click", () => {
  const current = readCount();
  writeCount(Math.max(0, current - 1));
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

  const current = readCount();
  writeCount(current + 1);

  deathForm.reset();
  renderCount();
  renderLogs();
});

clearLogsBtn.addEventListener("click", () => {
  writeLogs([]);
  renderLogs();
});

clipFinderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const killerName = document.getElementById("clipKiller").value.trim();
  const deathTimeISO = document.getElementById("clipTime").value;
  if (!killerName || !deathTimeISO) return;

  const links = buildSearchLinks(killerName, deathTimeISO);
  renderClipResults(links);
});

renderCount();
renderLogs();
pickMessage();
