const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const { z } = require("zod");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";
const allowedOrigin = process.env.ALLOWED_ORIGIN || `http://localhost:${port}`;

const pubgApiKey = process.env.PUBG_API_KEY || "";
const twitchClientId = process.env.TWITCH_CLIENT_ID || "";
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET || "";
const twitchUserAccessToken = process.env.TWITCH_USER_ACCESS_TOKEN || "";
const youtubeApiKey = process.env.YOUTUBE_API_KEY || "";

const pubgHeaders = {
  Authorization: `Bearer ${pubgApiKey}`,
  Accept: "application/vnd.api+json",
};

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin === allowedOrigin || !isProd) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
});

app.use(express.json({ limit: "50kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});

app.use("/api", apiLimiter);

app.use(express.static(path.join(__dirname)));

const scanSchema = z.object({
  playerName: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9_\-]+$/, "Only letters, numbers, underscore, and hyphen are allowed."),
  shard: z.enum(["steam", "xbox", "psn", "kakao", "stadia"]),
  lookbackMatches: z.number().int().min(1).max(20).default(10),
});

const clipSchema = z.object({
  broadcasterId: z.string().trim().min(2).max(40),
});

const smgWeaponTokens = ["ump", "uzi", "vector", "tommy", "mp5", "js9", "p90", "vss", "pp-19", "bizon"];

let twitchTokenCache = { accessToken: "", expiresAtMs: 0 };

function nowMs() {
  return Date.now();
}

function toISOStringSafe(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function looksLikeSmg(weaponName) {
  const normalized = String(weaponName || "").toLowerCase();
  return smgWeaponTokens.some((token) => normalized.includes(token));
}

function parseTwitchDurationSeconds(duration) {
  const text = String(duration || "").toLowerCase();
  const h = Number((text.match(/(\d+)h/) || [])[1] || 0);
  const m = Number((text.match(/(\d+)m/) || [])[1] || 0);
  const s = Number((text.match(/(\d+)s/) || [])[1] || 0);
  return h * 3600 + m * 60 + s;
}

function findMatchingVod(videos, happenedAtIso) {
  const happenedAt = new Date(happenedAtIso || "");
  if (Number.isNaN(happenedAt.getTime())) return null;

  const targetMs = happenedAt.getTime();

  for (const video of videos) {
    const startAt = new Date(video.created_at || "");
    if (Number.isNaN(startAt.getTime())) continue;

    const durationSeconds = parseTwitchDurationSeconds(video.duration);
    if (!durationSeconds) continue;

    const startMs = startAt.getTime();
    const endMs = startMs + durationSeconds * 1000;

    if (targetMs >= startMs - 90_000 && targetMs <= endMs + 90_000) {
      const offsetSeconds = Math.max(0, Math.floor((targetMs - startMs) / 1000));
      return {
        id: video.id,
        title: video.title,
        url: video.url,
        createdAt: video.created_at,
        duration: video.duration,
        offsetSeconds,
      };
    }
  }

  return null;
}

async function getTwitchAppToken() {
  if (!twitchClientId || !twitchClientSecret) {
    return null;
  }

  if (twitchTokenCache.accessToken && twitchTokenCache.expiresAtMs > nowMs() + 30_000) {
    return twitchTokenCache.accessToken;
  }

  const body = new URLSearchParams({
    client_id: twitchClientId,
    client_secret: twitchClientSecret,
    grant_type: "client_credentials",
  }).toString();

  const response = await axios.post("https://id.twitch.tv/oauth2/token", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 12_000,
  });

  const token = response.data?.access_token;
  const expiresIn = Number(response.data?.expires_in || 0);

  if (!token || !expiresIn) return null;

  twitchTokenCache = {
    accessToken: token,
    expiresAtMs: nowMs() + expiresIn * 1000,
  };

  return token;
}

async function getPubgPlayerId(shard, playerName) {
  const url = `https://api.pubg.com/shards/${encodeURIComponent(shard)}/players?filter[playerNames]=${encodeURIComponent(playerName)}`;
  const response = await axios.get(url, {
    headers: pubgHeaders,
    timeout: 15_000,
  });

  const first = response.data?.data?.[0];
  if (!first?.id) return null;
  return first.id;
}

async function getPubgMatchesForPlayer(shard, playerId) {
  const url = `https://api.pubg.com/shards/${encodeURIComponent(shard)}/players/${encodeURIComponent(playerId)}`;
  const response = await axios.get(url, {
    headers: pubgHeaders,
    timeout: 15_000,
  });

  const matchRefs = response.data?.data?.relationships?.matches?.data || [];
  return matchRefs.map((m) => m.id).filter(Boolean);
}

async function getMatchTelemetryUrl(shard, matchId) {
  const url = `https://api.pubg.com/shards/${encodeURIComponent(shard)}/matches/${encodeURIComponent(matchId)}`;
  const response = await axios.get(url, {
    headers: pubgHeaders,
    timeout: 15_000,
  });

  const assets = response.data?.included || [];
  const telemetryAsset = assets.find((asset) => asset.type === "asset" && asset.attributes?.URL);
  return telemetryAsset?.attributes?.URL || null;
}

async function getTelemetryEvents(telemetryUrl) {
  const response = await axios.get(telemetryUrl, { timeout: 20_000 });
  return Array.isArray(response.data) ? response.data : [];
}

function extractSmgDeathEvents(events, playerName, playerId) {
  const targetName = String(playerName || "").toLowerCase();
  const targetAccountId = String(playerId || "").toLowerCase();

  return events
    .filter((e) => e?._T === "LogPlayerKillV2" || e?._T === "LogPlayerKill")
    .map((e) => {
      const victimName = String(e?.victim?.name || "").toLowerCase();
      const victimAccountId = String(
        e?.victim?.accountId || e?.victimGameResult?.accountId || e?.victimAccountId || ""
      ).toLowerCase();

      const matchedByName = Boolean(victimName) && victimName === targetName;
      const matchedByAccount = Boolean(victimAccountId) && victimAccountId === targetAccountId;

      if (!matchedByName && !matchedByAccount) return null;

      const killerName = e?.killer?.name || "Unknown";
      const weapon = e?.damageCauserName || e?.damageTypeCategory || "Unknown";
      if (!looksLikeSmg(weapon)) return null;

      return {
        killerName,
        weapon,
        happenedAt: toISOStringSafe(e?._D),
      };
    })
    .filter(Boolean);
}

async function findTwitchChannelByName(name, appToken) {
  if (!appToken || !twitchClientId) return null;

  const response = await axios.get("https://api.twitch.tv/helix/search/channels", {
    params: { query: name, first: 5 },
    headers: {
      "Client-Id": twitchClientId,
      Authorization: `Bearer ${appToken}`,
    },
    timeout: 12_000,
  });

  const rows = response.data?.data || [];
  const normalized = String(name).toLowerCase();

  const exact = rows.find((row) => String(row.broadcaster_login || "").toLowerCase() === normalized);
  return exact || rows[0] || null;
}

async function getTwitchStreamByUserId(userId, appToken) {
  if (!userId || !appToken || !twitchClientId) return null;

  const response = await axios.get("https://api.twitch.tv/helix/streams", {
    params: { user_id: userId },
    headers: {
      "Client-Id": twitchClientId,
      Authorization: `Bearer ${appToken}`,
    },
    timeout: 12_000,
  });

  return response.data?.data?.[0] || null;
}

async function getTwitchVodsByUserId(userId, appToken) {
  if (!userId || !appToken || !twitchClientId) return [];

  const response = await axios.get("https://api.twitch.tv/helix/videos", {
    params: { user_id: userId, type: "archive", first: 12 },
    headers: {
      "Client-Id": twitchClientId,
      Authorization: `Bearer ${appToken}`,
    },
    timeout: 12_000,
  });

  return Array.isArray(response.data?.data) ? response.data.data : [];
}

async function findTwitchEvidenceForDeath(killerName, happenedAtIso, appToken) {
  const channel = await findTwitchChannelByName(killerName, appToken);
  if (!channel) return null;

  const [liveStream, vods] = await Promise.all([
    getTwitchStreamByUserId(channel.id, appToken),
    getTwitchVodsByUserId(channel.id, appToken),
  ]);

  const matchedVod = findMatchingVod(vods, happenedAtIso);

  return {
    broadcasterId: channel.id,
    displayName: channel.display_name,
    login: channel.broadcaster_login,
    isLive: Boolean(liveStream),
    url: `https://www.twitch.tv/${encodeURIComponent(channel.broadcaster_login)}`,
    matchedVod,
  };
}

async function findYouTubeLiveByName(name, happenedAtIso) {
  if (!youtubeApiKey) return null;

  const happenedAt = new Date(happenedAtIso || "");
  const publishedAfter = Number.isNaN(happenedAt.getTime())
    ? undefined
    : new Date(happenedAt.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const publishedBefore = Number.isNaN(happenedAt.getTime())
    ? undefined
    : new Date(happenedAt.getTime() + 3 * 60 * 60 * 1000).toISOString();

  const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
    params: {
      key: youtubeApiKey,
      part: "snippet",
      q: name,
      type: "video",
      eventType: "live",
      maxResults: 3,
      publishedAfter,
      publishedBefore,
    },
    timeout: 12_000,
  });

  const first = response.data?.items?.[0];
  if (!first?.id?.videoId) return null;

  return {
    videoId: first.id.videoId,
    title: first.snippet?.title || "YouTube live",
    channelTitle: first.snippet?.channelTitle || "Unknown",
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(first.id.videoId)}`,
  };
}

function buildKickSearch(name) {
  return `https://kick.com/search/channels?query=${encodeURIComponent(name)}`;
}

async function tryCreateTwitchClip(broadcasterId) {
  if (!twitchUserAccessToken || !twitchClientId) {
    return {
      attempted: false,
      reason: "Missing TWITCH_USER_ACCESS_TOKEN or Twitch app credentials.",
    };
  }

  try {
    const response = await axios.post(
      "https://api.twitch.tv/helix/clips",
      null,
      {
        params: { broadcaster_id: broadcasterId, has_delay: true },
        headers: {
          "Client-Id": twitchClientId,
          Authorization: `Bearer ${twitchUserAccessToken}`,
        },
        timeout: 12_000,
      }
    );

    const clipId = response.data?.data?.[0]?.id;
    if (!clipId) {
      return {
        attempted: true,
        created: false,
        reason: "Twitch returned no clip id.",
      };
    }

    return {
      attempted: true,
      created: true,
      clipId,
      url: `https://clips.twitch.tv/${encodeURIComponent(clipId)}`,
    };
  } catch (error) {
    return {
      attempted: true,
      created: false,
      reason: sanitizeError(error),
    };
  }
}

function sanitizeError(error) {
  if (!error) return "Unknown error";
  const status = error.response?.status;
  const detail = error.response?.data?.message || error.response?.statusText || error.message;
  if (!status) return "Request failed";
  return `HTTP ${status}: ${String(detail || "Request failed")}`;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/report/scan", async (req, res) => {
  try {
    if (!pubgApiKey) {
      return res.status(503).json({ error: "PUBG_API_KEY is not configured on server." });
    }

    const parsed = scanSchema.parse(req.body);
    const { playerName, shard, lookbackMatches } = parsed;

    const playerId = await getPubgPlayerId(shard, playerName);
    if (!playerId) {
      return res.status(404).json({ error: "Player not found on selected shard." });
    }

    const matchIds = await getPubgMatchesForPlayer(shard, playerId);
    const selectedMatchIds = matchIds.slice(0, lookbackMatches);

    let smgDeaths = [];

    for (const matchId of selectedMatchIds) {
      const telemetryUrl = await getMatchTelemetryUrl(shard, matchId);
      if (!telemetryUrl) continue;
      const events = await getTelemetryEvents(telemetryUrl);
      const deaths = extractSmgDeathEvents(events, playerName, playerId).map((d) => ({
        ...d,
        matchId,
      }));
      smgDeaths = smgDeaths.concat(deaths);
    }

    const appToken = await getTwitchAppToken();
    const killerEvidenceCache = new Map();

    const smgDeathsWithEvidence = [];

    for (const death of smgDeaths) {
      const cacheKey = `${death.killerName.toLowerCase()}::${death.happenedAt || "unknown"}`;

      if (!killerEvidenceCache.has(cacheKey)) {
        const [twitchEvidence, youtubeLive] = await Promise.all([
          findTwitchEvidenceForDeath(death.killerName, death.happenedAt, appToken),
          findYouTubeLiveByName(death.killerName, death.happenedAt),
        ]);

        killerEvidenceCache.set(cacheKey, {
          twitch: twitchEvidence,
          youtube: youtubeLive,
          kick: {
            url: buildKickSearch(death.killerName),
          },
        });
      }

      const evidence = killerEvidenceCache.get(cacheKey);
      smgDeathsWithEvidence.push({
        ...death,
        streamEvidence: evidence,
      });
    }

    const killerAggregated = new Map();
    for (const death of smgDeathsWithEvidence) {
      const key = death.killerName.toLowerCase();
      const existing = killerAggregated.get(key);
      const next = {
        killerName: death.killerName,
        totalKillsOnYou: (existing?.totalKillsOnYou || 0) + 1,
        latestDeathAt: death.happenedAt,
        twitch: death.streamEvidence?.twitch || existing?.twitch || null,
        youtube: death.streamEvidence?.youtube || existing?.youtube || null,
        kick: death.streamEvidence?.kick || existing?.kick || { url: buildKickSearch(death.killerName) },
      };
      killerAggregated.set(key, next);
    }

    const killerReports = Array.from(killerAggregated.values()).sort((a, b) => b.totalKillsOnYou - a.totalKillsOnYou);

    res.json({
      playerName,
      shard,
      scannedMatches: selectedMatchIds.length,
      smgDeathCount: smgDeathsWithEvidence.length,
      smgDeaths: smgDeathsWithEvidence,
      killers: killerReports,
      notes: [
        "This approximates PUBG.report by correlating death timestamps with streamer presence and VOD windows.",
        "Twitch auto-clip requires TWITCH_USER_ACCESS_TOKEN with clips:edit scope.",
        "YouTube clip creation is not generally available via public API in the same way as Twitch.",
        "Kick public API capabilities may change; this uses safe search fallback.",
      ],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

app.post("/api/report/clip/twitch", async (req, res) => {
  try {
    const parsed = clipSchema.parse(req.body);
    const result = await tryCreateTwitchClip(parsed.broadcasterId);
    return res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

app.use((err, req, res, next) => {
  const _ignore = next;
  console.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
  return _ignore;
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
