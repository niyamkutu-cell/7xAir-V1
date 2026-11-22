const AUDIUS_API_BASE = "https://discoveryprovider.audius.co/v1";
const DEEZER_API_BASE = "https://api.deezer.com";

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function parseAudiusTrack(item) {
  if (!item || !item.id || !item.title) return null;
  const art =
    item.artwork?.["480x480"] ||
    item.artwork?.["150x150"] ||
    item.artwork?.["1000x1000"] ||
    null;
  return {
    id: String(item.id),
    provider: "audius",
    title: String(item.title).trim(),
    artist: String(item.user?.name || "Unknown Artist").trim(),
    album: String(item.genre || "Audius Single").trim(),
    artworkUrl: art,
    durationSec: Number(item.duration || 0),
    streamUrl: `${AUDIUS_API_BASE}/tracks/${encodeURIComponent(item.id)}/stream?app_name=7xAir`,
    externalUrl: item.permalink ? `https://audius.co${item.permalink}` : null,
    playbackQuality: "Audius Official Stream (Full Track)",
    isPreview: false,
  };
}

function parseDeezerTrack(item) {
  if (!item || !item.id || !item.title) return null;
  const preview = item.preview || null;
  return {
    id: String(item.id),
    provider: "deezer",
    title: String(item.title).trim(),
    artist: String(item.artist?.name || "Unknown Artist").trim(),
    album: String(item.album?.title || "Single").trim(),
    artworkUrl:
      item.album?.cover_big ||
      item.album?.cover_medium ||
      item.album?.cover ||
      null,
    durationSec: preview ? 30 : Number(item.duration || 30),
    streamUrl: preview,
    externalUrl: item.link || null,
    playbackQuality: "Deezer Official Preview (30s MP3)",
    isPreview: true,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const parsedUrl = new URL(req.url || "/api/music", "http://localhost");
  const action = (parsedUrl.searchParams.get("action") || "status").toLowerCase();
  const provider = (parsedUrl.searchParams.get("provider") || "audius").toLowerCase();

  // Public provider status & PKCE client ID (never exposes any secret!)
  if (action === "status" || action === "spotify-config") {
    const publicSpotifyClientId = (
      process.env.SEVENXAIR_SPOTIFY_CLIENT_ID ||
      process.env.SPOTIFY_CLIENT_ID ||
      ""
    ).trim();
    return sendJson(res, 200, {
      providers: [
        {
          id: "audius",
          name: "Audius Official Open API",
          ready: true,
          playbackType: "Full-length artist-authorized streams",
        },
        {
          id: "deezer",
          name: "Deezer Official Public Catalog",
          ready: true,
          playbackType: "Official 30-second MP3 previews",
        },
        {
          id: "spotify",
          name: "Spotify Official OAuth 2.0 (PKCE)",
          ready: publicSpotifyClientId.length > 0,
          playbackType: "Requires Spotify Premium + active playback device",
        },
      ],
      spotify: {
        clientIdConfigured: publicSpotifyClientId.length > 0,
        clientId: publicSpotifyClientId || null,
        premiumRequiredNote:
          "Official Spotify playback requires a Spotify Premium subscription and a supported Spotify playback device. Free accounts can still use Audius or Deezer playback directly on 7xAir.",
      },
    });
  }

  if (action === "discover") {
    try {
      if (provider === "deezer") {
        const resp = await fetch(`${DEEZER_API_BASE}/chart`, {
          headers: { "User-Agent": "7xAir-Website/0.1.0" },
        });
        if (!resp.ok) throw new Error(`Deezer HTTP ${resp.status}`);
        const data = await resp.json();
        const tracks = (data?.tracks?.data || [])
          .map(parseDeezerTrack)
          .filter(Boolean);
        return sendJson(res, 200, {
          provider: "deezer",
          tracks,
          notice:
            "Deezer Official Public API provides 30-second MP3 previews. Switch to Audius for full-length open-licensed streams.",
        });
      }

      const resp = await fetch(
        `${AUDIUS_API_BASE}/tracks/trending?app_name=7xAir&limit=18`,
        { headers: { "User-Agent": "7xAir-Website/0.1.0" } }
      );
      if (!resp.ok) throw new Error(`Audius HTTP ${resp.status}`);
      const data = await resp.json();
      const tracks = (data?.data || []).map(parseAudiusTrack).filter(Boolean);
      return sendJson(res, 200, {
        provider: "audius",
        tracks,
        notice:
          "Streaming full-length, artist-authorized tracks via the official Audius Open API.",
      });
    } catch (err) {
      return sendJson(res, 502, {
        error: `Unable to reach ${provider} catalog right now: ${err.message}`,
      });
    }
  }

  if (action === "search") {
    const q = (parsedUrl.searchParams.get("q") || "").trim();
    const mode = (parsedUrl.searchParams.get("mode") || "all").toLowerCase();
    if (!q) {
      return sendJson(res, 200, { provider, query: "", mode, tracks: [] });
    }
    try {
      if (provider === "deezer") {
        const scoped =
          mode === "artist"
            ? `artist:"${q}"`
            : mode === "song"
              ? `track:"${q}"`
              : q;
        const resp = await fetch(
          `${DEEZER_API_BASE}/search?q=${encodeURIComponent(scoped)}&limit=20`,
          { headers: { "User-Agent": "7xAir-Website/0.1.0" } }
        );
        if (!resp.ok) throw new Error(`Deezer HTTP ${resp.status}`);
        const data = await resp.json();
        const tracks = (data?.data || []).map(parseDeezerTrack).filter(Boolean);
        return sendJson(res, 200, { provider: "deezer", query: q, mode, tracks });
      }

      const resp = await fetch(
        `${AUDIUS_API_BASE}/tracks/search?query=${encodeURIComponent(q)}&app_name=7xAir&limit=20`,
        { headers: { "User-Agent": "7xAir-Website/0.1.0" } }
      );
      if (!resp.ok) throw new Error(`Audius HTTP ${resp.status}`);
      const data = await resp.json();
      let tracks = (data?.data || []).map(parseAudiusTrack).filter(Boolean);
      if (mode === "artist") {
        const lower = q.toLowerCase();
        tracks.sort(
          (a, b) =>
            Number(!a.artist.toLowerCase().includes(lower)) -
            Number(!b.artist.toLowerCase().includes(lower))
        );
      }
      return sendJson(res, 200, { provider: "audius", query: q, mode, tracks });
    } catch (err) {
      return sendJson(res, 502, {
        error: `Music search failed on ${provider}: ${err.message}`,
      });
    }
  }

  return sendJson(res, 400, { error: `Unsupported music action '${action}'` });
}
