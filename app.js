const STORAGE_KEYS = {
  count: "pubg-smg-death-count",
  logs: "pubg-smg-death-logs",
};

const AUTO_SCAN_INTERVAL_MS = 60 * 1000;
const AUTO_PLAYER_NAME = "TiiPain";
const AUTO_SHARD = "steam";
const AUTO_LOOKBACK_MATCHES = 3;
const MESSAGE_ROTATE_MS = 7000;
const COUNTER_REFRESH_MS = 6000;

const trollMessages = [
  "TiiPain patch request: SMGs currently ignore the concept of recoil.",
  "Dear devs, my vest is not a coupon for free SMG damage.",
  "Breaking news: TiiPain eliminated by another pocket-sized laser beam.",
  "Please tune SMGs so they stop deleting me like old patch files.",
  "I did tactical positioning. The SMG did tactical time travel.",
  "SMG balance note: less blender, more gun.",
];

const deathCountEl = document.getElementById("deathCount");
const trollMessageEl = document.getElementById("trollMessage");
const killerFeedEl = document.getElementById("killerFeed");

const deathForm = document.getElementById("deathForm");
const deathLogList = document.getElementById("deathLogList");
const clearLogsBtn = document.getElementById("clearLogsBtn");

const scanSummary = document.getElementById("scanSummary");
const killerResults = document.getElementById("killerResults");
const apiStatus = document.getElementById("apiStatus");

const API_BASE_CANDIDATES = ["", "http://localhost:3000"];

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

function readSeenAutoEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem("pubg-smg-seen-auto-events") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSeenAutoEvents(eventIds) {
  localStorage.setItem("pubg-smg-seen-auto-events", JSON.stringify(eventIds));
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
  if (deathCountEl) {
    deathCountEl.textContent = String(readCount());
  }
}

function setApiStatus(label) {
  if (apiStatus) {
    apiStatus.textContent = label;
  }
}

function setScanSummary(text) {
  if (scanSummary) {
    scanSummary.textContent = text;
  }
}

function buildAutoEventId(eventRow) {
  return [
    String(eventRow.matchId || ""),
    String(eventRow.happenedAt || ""),
    String(eventRow.killerName || ""),
    String(eventRow.weapon || ""),
  ].join("|");
}

function applyAutoDeaths(scanResult) {
  const deaths = Array.isArray(scanResult?.smgDeaths) ? scanResult.smgDeaths : [];
  if (!deaths.length) {
    return { newAutoDeaths: 0 };
  }

  const seen = new Set(readSeenAutoEvents());
  const logs = readLogs();
  const newIds = [];
  const newLogRows = [];

  for (const death of deaths) {
    const id = buildAutoEventId(death);
    if (!id || seen.has(id)) continue;

    seen.add(id);
    newIds.push(id);

    newLogRows.push({
      killerName: death.killerName || "Unknown",
      platform: scanResult.shard || AUTO_SHARD,
      matchTime: death.happenedAt || new Date().toISOString(),
      source: "auto",
      autoEventId: id,
      matchId: death.matchId || "",
      weapon: death.weapon || "Unknown",
    });
  }

  if (!newIds.length) {
    return { newAutoDeaths: 0 };
  }

  writeSeenAutoEvents(Array.from(seen));
  writeLogs(logs.concat(newLogRows));
  writeCount(readCount() + newIds.length);
  renderLogs();
  renderKillerFeed();
  renderCount();

  return { newAutoDeaths: newIds.length };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }

  return body;
}

async function getJson(url) {
  const response = await fetch(url, { method: "GET" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function withBase(base, pathWithQuery) {
  return `${base}${pathWithQuery}`;
}

async function requestScan() {
  const params = new URLSearchParams({
    playerName: AUTO_PLAYER_NAME,
    shard: AUTO_SHARD,
    lookbackMatches: String(AUTO_LOOKBACK_MATCHES),
  });

  const pathWithQuery = `/api/report/scan?${params.toString()}`;
  const requestBody = {
    playerName: AUTO_PLAYER_NAME,
    shard: AUTO_SHARD,
    lookbackMatches: AUTO_LOOKBACK_MATCHES,
  };

  let lastError = null;

  for (const base of API_BASE_CANDIDATES) {
    const getUrl = withBase(base, pathWithQuery);
    const postUrl = withBase(base, "/api/report/scan");

    try {
      return await getJson(getUrl);
    } catch (error) {
      lastError = error;

      if (error?.status === 404 || error?.status === 405) {
        try {
          return await postJson(postUrl, requestBody);
        } catch (postError) {
          lastError = postError;
          continue;
        }
      }

      continue;
    }
  }

  if (lastError) throw lastError;
  throw new Error("No API endpoint available");
}

function renderLogs() {
  if (!deathLogList) return;

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

function renderKillerFeed() {
  if (!killerFeedEl) return;

  const logs = readLogs();
  if (!logs.length) {
    killerFeedEl.innerHTML = '<li class="killer-feed-item">No killers yet</li>';
    return;
  }

  const counts = new Map();
  for (const row of logs) {
    const killer = String(row?.killerName || "Unknown").trim() || "Unknown";
    counts.set(killer, (counts.get(killer) || 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  killerFeedEl.innerHTML = sorted
    .map(([killer, deaths]) => `<li class="killer-feed-item">${escapeHtml(killer)} x${deaths}</li>`)
    .join("");
}

function pickMessage() {
  if (!trollMessageEl) return;
  const i = Math.floor(Math.random() * trollMessages.length);
  trollMessageEl.textContent = trollMessages[i];
}

function startAutoMessageRotation() {
  pickMessage();
  setInterval(pickMessage, MESSAGE_ROTATE_MS);
}

function startCounterRefresh() {
  renderCount();
  setInterval(renderCount, COUNTER_REFRESH_MS);
}

function renderKillerCards(scanResult) {
  if (!killerResults) return;

  const killers = Array.isArray(scanResult.killers) ? scanResult.killers : [];
  if (!killers.length) {
    killerResults.innerHTML = '<div class="killer-card">No killers found in scanned SMG deaths.</div>';
    return;
  }

  killerResults.innerHTML = killers
    .map((killer) => {
      const name = escapeHtml(killer.killerName || "Unknown");
      const twitchLink = killer.twitch
        ? `<a class="stream-link" href="${escapeHtml(killer.twitch.url)}" target="_blank" rel="noopener noreferrer">Twitch: ${escapeHtml(killer.twitch.displayName || killer.twitch.login || name)}</a>`
        : `<span class="note">No Twitch match</span>`;

      const youtubeLink = killer.youtube?.url
        ? `<a class="stream-link" href="${escapeHtml(killer.youtube.url)}" target="_blank" rel="noopener noreferrer">YouTube Live</a>`
        : `<span class="note">No live YouTube match</span>`;

      const kickLink = killer.kick?.url
        ? `<a class="stream-link" href="${escapeHtml(killer.kick.url)}" target="_blank" rel="noopener noreferrer">Kick Search</a>`
        : "";

      return `
        <article class="killer-card">
          <p class="killer-title"><strong>${name}</strong></p>
          <div class="link-row">
            ${twitchLink}
            ${youtubeLink}
            ${kickLink}
          </div>
          <p class="note">Auto hunt preview from the PUBG API.</p>
        </article>
      `;
    })
    .join("");
}

async function runAutoScan(silentMode = true) {
  if (!silentMode) {
    setApiStatus("Scanning...");
    setScanSummary("Scanning PUBG matches...");
  }

  try {
    const data = await requestScan();

    const autoApplied = applyAutoDeaths(data);
    setScanSummary(`${data.playerName}: ${data.smgDeathCount} SMG deaths found. ${autoApplied.newAutoDeaths > 0 ? `Auto-added ${autoApplied.newAutoDeaths} new death${autoApplied.newAutoDeaths > 1 ? "s" : ""}.` : "No new deaths to add."}`);
    renderKillerCards(data);
    setApiStatus(silentMode ? "Auto-sync active" : "Scan complete");
  } catch (error) {
    setScanSummary(`Scan failed: ${error.message}`);
    setApiStatus("Error");
  }
}

function startAutoScan() {
  runAutoScan(true);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      runAutoScan(true);
    }
  });

  setInterval(() => {
    if (document.hidden) return;
    runAutoScan(true);
  }, AUTO_SCAN_INTERVAL_MS);
}

if (deathForm) {
  deathForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const killerName = document.getElementById("killerName")?.value.trim() || "";
    const platform = document.getElementById("platform")?.value || "other";
    const matchTime = document.getElementById("matchTime")?.value || "";
    if (!killerName || !matchTime) return;

    const logs = readLogs();
    logs.push({ killerName, platform, matchTime });
    writeLogs(logs);
    writeCount(readCount() + 1);
    deathForm.reset();
    renderCount();
    renderLogs();
  });
}

if (clearLogsBtn) {
  clearLogsBtn.addEventListener("click", () => {
    writeLogs([]);
    renderLogs();
    renderKillerFeed();
  });
}

startCounterRefresh();
renderLogs();
renderKillerFeed();
startAutoMessageRotation();
startAutoScan();
