const STORAGE_KEYS = {
  count: "pubg-smg-death-count",
  logs: "pubg-smg-death-logs",
  seenAutoEvents: "pubg-smg-seen-auto-events",
};

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

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

const autoScanForm = document.getElementById("autoScanForm");
const scanSummary = document.getElementById("scanSummary");
const killerResults = document.getElementById("killerResults");
const apiStatus = document.getElementById("apiStatus");

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
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.seenAutoEvents) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSeenAutoEvents(eventIds) {
  localStorage.setItem(STORAGE_KEYS.seenAutoEvents, JSON.stringify(eventIds));
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

function setApiStatus(label) {
  apiStatus.textContent = label;
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildAutoEventId(eventRow) {
  return [
    String(eventRow.matchId || ""),
    String(eventRow.happenedAt || ""),
    String(eventRow.killerName || ""),
    String(eventRow.weapon || ""),
  ].join("|");
}

function applyAutoDeaths(scanResult, shard) {
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
      platform: shard,
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

function renderKillerCards(scanResult) {
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

      const twitchClipBtn = killer.twitch?.broadcasterId
        ? `<button class="btn btn-ghost twitch-clip-btn" type="button" data-broadcaster-id="${escapeHtml(killer.twitch.broadcasterId)}">Auto-create Twitch Clip</button>`
        : "";

      const youtubeLink = killer.youtube?.url
        ? `<a class="stream-link" href="${escapeHtml(killer.youtube.url)}" target="_blank" rel="noopener noreferrer">YouTube Live</a>`
        : `<span class="note">No live YouTube match</span>`;

      const kickLink = killer.kick?.url
        ? `<a class="stream-link" href="${escapeHtml(killer.kick.url)}" target="_blank" rel="noopener noreferrer">Kick Search</a>`
        : "";

      const liveChip = killer.twitch?.isLive ? '<span class="live-chip">LIVE</span>' : "";

      return `
        <article class="killer-card">
          <p class="killer-title"><strong>${name}</strong>${liveChip}</p>
          <div class="link-row">
            ${twitchLink}
            ${youtubeLink}
            ${kickLink}
            ${twitchClipBtn}
          </div>
          <p class="note">Clip auto-create only works when server has a valid Twitch user token with clips:edit scope.</p>
          <p class="note clip-status" data-killer="${name}"></p>
        </article>
      `;
    })
    .join("");
}

async function autoScan(event) {
  event.preventDefault();

  await runScan(false);
}

async function runScan(silentMode) {

  const playerName = document.getElementById("scanPlayerName").value.trim();
  const shard = document.getElementById("scanShard").value;
  const lookbackMatches = safeNum(document.getElementById("scanLookback").value, 10);

  if (!playerName) return;

  if (!silentMode) {
    setApiStatus("Scanning...");
    scanSummary.textContent = "Scanning PUBG matches and correlating killer channels...";
    killerResults.innerHTML = "";
  }

  try {
    const data = await postJson("/api/report/scan", {
      playerName,
      shard,
      lookbackMatches,
    });

    const autoApplied = applyAutoDeaths(data, shard);

    const baseText = `${data.playerName}: ${data.smgDeathCount} SMG deaths found in ${data.scannedMatches} matches.`;
    const autoText =
      autoApplied.newAutoDeaths > 0
        ? ` Auto-added ${autoApplied.newAutoDeaths} new death${autoApplied.newAutoDeaths > 1 ? "s" : ""} to your counter.`
        : " No new deaths to add.";

    scanSummary.textContent = `${baseText}${autoText}`;
    renderKillerCards(data);

    if (!silentMode) {
      setApiStatus("Scan complete");
    } else {
      setApiStatus("Auto-sync updated");
    }
  } catch (error) {
    scanSummary.textContent = `Scan failed: ${error.message}`;
    setApiStatus("Error");
  }
}

function startAutoSync() {
  setApiStatus("Auto-sync enabled");

  setInterval(() => {
    if (document.hidden) return;
    runScan(true);
  }, AUTO_SYNC_INTERVAL_MS);
}

async function handleClipClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains("twitch-clip-btn")) return;

  const broadcasterId = target.getAttribute("data-broadcaster-id") || "";
  if (!broadcasterId) return;

  target.disabled = true;
  target.textContent = "Creating clip...";

  const statusEl = target.closest(".killer-card")?.querySelector(".clip-status");

  try {
    const result = await postJson("/api/report/clip/twitch", { broadcasterId });
    if (result.created && result.url) {
      if (statusEl) {
        statusEl.innerHTML = `<a class="stream-link" href="${escapeHtml(result.url)}" target="_blank" rel="noopener noreferrer">Open clip ${escapeHtml(result.clipId)}</a>`;
      }
      target.textContent = "Clip created";
    } else {
      if (statusEl) statusEl.textContent = result.reason || "Clip was not created.";
      target.textContent = "Clip unavailable";
    }
  } catch (error) {
    if (statusEl) statusEl.textContent = `Clip error: ${error.message}`;
    target.textContent = "Clip failed";
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

autoScanForm.addEventListener("submit", autoScan);
killerResults.addEventListener("click", handleClipClick);

renderCount();
renderLogs();
pickMessage();
runScan(true);
startAutoSync();
