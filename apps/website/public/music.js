(function initSevenXAirWebMusic() {
  const VOLUME_KEY = "sevenxair.web.musicVolume.v1";
  const SPOTIFY_STATE_KEY = "sevenxair.web.spotifyPkce.v1";

  const audio = new Audio();
  audio.preload = "none"; // Respect autoplay & avoid unnecessary network requests

  let provider = "audius";
  let queue = [];
  let queueIndex = -1;
  let isPlaying = false;
  let shuffle = false;
  let repeatMode = "off"; // "off" | "all" | "one"
  let volume = loadVolume();
  let muted = false;
  let spotifyConfig = null;
  let catalogLoaded = false;

  audio.volume = volume;

  function loadVolume() {
    try {
      const saved = Number(window.localStorage.getItem(VOLUME_KEY));
      return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 0.7;
    } catch {
      return 0.7;
    }
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const whole = Math.floor(sec);
    const m = Math.floor(whole / 60);
    const s = whole % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function currentTrack() {
    return queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;
  }

  function setFeedback(message, isError = false) {
    const el = document.getElementById("web-music-feedback");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("error", isError);
    if (message && window.SevenXAirSound) {
      window.SevenXAirSound.play(isError ? "error" : "success");
    }
  }

  function updatePlayerUI() {
    const track = currentTrack();
    const mini = document.getElementById("web-music-mini");
    const openFullBtn = document.getElementById("web-music-open-expanded");
    if (mini) mini.classList.toggle("hidden", !track);
    if (openFullBtn) openFullBtn.classList.toggle("hidden", !track);
    if (!track) return;

    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : track.durationSec || 0;
    const cur = audio.currentTime || 0;

    // Mini-player bindings
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    const setSrc = (id, url) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (url) {
        el.src = url;
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    };

    setText("mini-track-title", track.title);
    setText("mini-track-artist", track.artist);
    setText("mini-time-cur", formatTime(cur));
    setText("mini-time-dur", formatTime(dur));
    setSrc("mini-track-art", track.artworkUrl);

    setText("exp-track-title", track.title);
    setText("exp-track-artist", `${track.artist} · ${track.album}`);
    setText("exp-track-quality", track.playbackQuality);
    setText("exp-time-cur", formatTime(cur));
    setText("exp-time-dur", formatTime(dur));
    setSrc("exp-track-art", track.artworkUrl);

    const miniSeek = document.getElementById("mini-seek");
    const expSeek = document.getElementById("exp-seek");
    if (miniSeek) {
      miniSeek.max = String(dur || 1);
      miniSeek.value = String(Math.min(cur, dur || 1));
    }
    if (expSeek) {
      expSeek.max = String(dur || 1);
      expSeek.value = String(Math.min(cur, dur || 1));
    }

    const playLabel = isPlaying ? "Pause" : "Play";
    const miniPlay = document.getElementById("mini-play-btn");
    const expPlay = document.getElementById("exp-play-btn");
    if (miniPlay) miniPlay.textContent = playLabel;
    if (expPlay) expPlay.textContent = playLabel;

    const miniVol = document.getElementById("mini-vol");
    const expVol = document.getElementById("exp-vol");
    const volPct = String(Math.round((muted ? 0 : volume) * 100));
    if (miniVol) miniVol.value = volPct;
    if (expVol) expVol.value = volPct;

    const shufBtn = document.getElementById("exp-shuffle-btn");
    const repBtn = document.getElementById("exp-repeat-btn");
    if (shufBtn) shufBtn.classList.toggle("active-chip", shuffle);
    if (repBtn) {
      repBtn.classList.toggle("active-chip", repeatMode !== "off");
      repBtn.textContent = repeatMode === "one" ? "Repeat: 1" : repeatMode === "all" ? "Repeat: All" : "Repeat: Off";
    }
  }

  async function startTrack(track) {
    if (!track.streamUrl) {
      setFeedback(`No direct stream available for "${track.title}".`, true);
      return;
    }
    audio.src = track.streamUrl;
    audio.volume = muted ? 0 : volume;
    audio.load();
    try {
      await audio.play();
      isPlaying = true;
      updatePlayerUI();
      setFeedback(`Playing "${track.title}" — ${track.artist}`);
    } catch (err) {
      isPlaying = false;
      updatePlayerUI();
      setFeedback(`Playback blocked or failed: ${err.message}`, true);
    }
  }

  function renderTrackList(containerId, tracks) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    if (!tracks || tracks.length === 0) {
      grid.innerHTML = `<p class="muted">No tracks found. Try a different search or switch provider.</p>`;
      return;
    }
    grid.innerHTML = tracks
      .map((t, idx) => {
        const active = currentTrack()?.id === t.id && currentTrack()?.provider === t.provider;
        return `
          <article class="music-track-card ${active ? "music-track-card--active" : ""}">
            <div class="music-art-box">
              ${
                t.artworkUrl
                  ? `<img src="${escapeHtml(t.artworkUrl)}" alt="${escapeHtml(t.title)}" loading="lazy" />`
                  : `<span class="music-art-fallback">7X</span>`
              }
            </div>
            <div class="music-track-meta">
              <div class="music-track-title">${escapeHtml(t.title)}</div>
              <div class="music-track-artist">${escapeHtml(t.artist)}</div>
              <div class="music-track-sub">${formatTime(t.durationSec)} · ${escapeHtml(t.playbackQuality)}</div>
            </div>
            <button type="button" class="btn-music-play" data-track-idx="${idx}" aria-label="Play ${escapeHtml(t.title)}">
              ${active && isPlaying ? "Pause" : "Play"}
            </button>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll(".btn-music-play").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-track-idx"));
        const picked = tracks[idx];
        if (!picked) return;
        if (currentTrack()?.id === picked.id && currentTrack()?.provider === picked.provider) {
          togglePlay();
          return;
        }
        queue = tracks.slice();
        queueIndex = idx;
        void startTrack(picked);
      });
    });
  }

  async function togglePlay() {
    const track = currentTrack();
    if (!track) return;
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      updatePlayerUI();
    } else {
      try {
        await audio.play();
        isPlaying = true;
        updatePlayerUI();
      } catch (err) {
        setFeedback(`Unable to resume audio: ${err.message}`, true);
      }
    }
  }

  function nextTrack() {
    if (queue.length === 0) return;
    if (shuffle && queue.length > 1) {
      let nextIdx = queueIndex;
      while (nextIdx === queueIndex) nextIdx = Math.floor(Math.random() * queue.length);
      queueIndex = nextIdx;
    } else if (queueIndex + 1 < queue.length) {
      queueIndex += 1;
    } else if (repeatMode === "all") {
      queueIndex = 0;
    } else {
      isPlaying = false;
      updatePlayerUI();
      return;
    }
    void startTrack(queue[queueIndex]);
  }

  function prevTrack() {
    if (queue.length === 0) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      updatePlayerUI();
      return;
    }
    queueIndex = queueIndex > 0 ? queueIndex - 1 : repeatMode === "all" ? queue.length - 1 : 0;
    void startTrack(queue[queueIndex]);
  }

  async function loadProviderStatus() {
    try {
      const resp = await fetch("/api/music?action=status");
      const data = await resp.json();
      spotifyConfig = data.spotify || null;
      const noteEl = document.getElementById("web-spotify-note");
      const statusEl = document.getElementById("web-spotify-status");
      if (noteEl && spotifyConfig?.premiumRequiredNote) {
        noteEl.textContent = spotifyConfig.premiumRequiredNote;
      }
      if (statusEl) {
        statusEl.textContent = spotifyConfig?.clientIdConfigured
          ? "Official Spotify OAuth 2.0 (PKCE) is configured and ready."
          : "Spotify Client ID is not configured on this deployment. Audius & Deezer work immediately.";
      }
    } catch {
      // ignore offline preview
    }
  }

  async function loadDiscovery() {
    const grid = document.getElementById("web-music-grid");
    if (grid) grid.innerHTML = `<p class="muted">Loading popular tracks from ${provider}...</p>`;
    try {
      const resp = await fetch(`/api/music?action=discover&provider=${encodeURIComponent(provider)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      catalogLoaded = true;
      const noticeEl = document.getElementById("web-music-notice");
      if (noticeEl) noticeEl.textContent = data.notice || "";
      renderTrackList("web-music-grid", data.tracks || []);
    } catch (err) {
      if (grid) grid.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
      setFeedback(err.message, true);
    }
  }

  async function runSearch() {
    const input = document.getElementById("web-music-search-input");
    const modeSel = document.getElementById("web-music-search-mode");
    const q = (input?.value || "").trim();
    const mode = modeSel?.value || "all";
    if (!q) {
      void loadDiscovery();
      return;
    }
    const grid = document.getElementById("web-music-grid");
    if (grid) grid.innerHTML = `<p class="muted">Searching "${escapeHtml(q)}" on ${provider}...</p>`;
    try {
      const resp = await fetch(
        `/api/music?action=search&provider=${encodeURIComponent(provider)}&q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}`
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      renderTrackList("web-music-grid", data.tracks || []);
      setFeedback(`Found ${(data.tracks || []).length} track(s) for "${q}".`);
    } catch (err) {
      if (grid) grid.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
      setFeedback(err.message, true);
    }
  }

  async function startSpotifyPkce() {
    if (!spotifyConfig?.clientId) {
      setFeedback(
        "Spotify OAuth requires SEVENXAIR_SPOTIFY_CLIENT_ID configured in website environment variables (zero secrets exposed in browser).",
        true
      );
      return;
    }
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const verifier = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    window.sessionStorage.setItem(SPOTIFY_STATE_KEY, verifier);
    const redirectUri = `${window.location.origin}/#music`;
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${encodeURIComponent(
      spotifyConfig.clientId
    )}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&code_challenge_method=S256&code_challenge=${encodeURIComponent(
      challenge
    )}&scope=${encodeURIComponent("user-read-private playlist-read-private")}`;
    window.location.href = authUrl;
  }

  function bindMusicEvents() {
    audio.addEventListener("timeupdate", updatePlayerUI);
    audio.addEventListener("loadedmetadata", updatePlayerUI);
    audio.addEventListener("ended", () => {
      if (repeatMode === "one") {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      } else {
        nextTrack();
      }
    });
    audio.addEventListener("error", () => {
      isPlaying = false;
      updatePlayerUI();
      setFeedback("Unable to stream this track right now. Try another song.", true);
    });

    document.getElementById("web-music-provider")?.addEventListener("change", (ev) => {
      provider = ev.target.value;
      void loadDiscovery();
    });

    document.getElementById("web-music-search-btn")?.addEventListener("click", () => {
      void runSearch();
    });
    document.getElementById("web-music-search-input")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") void runSearch();
    });
    document.getElementById("web-music-refresh-btn")?.addEventListener("click", () => {
      void loadDiscovery();
    });
    document.getElementById("web-spotify-connect-btn")?.addEventListener("click", () => {
      void startSpotifyPkce();
    });

    // Mini & Expanded player controls
    const bindPlay = (id) => document.getElementById(id)?.addEventListener("click", () => void togglePlay());
    const bindNext = (id) => document.getElementById(id)?.addEventListener("click", nextTrack);
    const bindPrev = (id) => document.getElementById(id)?.addEventListener("click", prevTrack);
    bindPlay("mini-play-btn");
    bindPlay("exp-play-btn");
    bindNext("mini-next-btn");
    bindNext("exp-next-btn");
    bindPrev("mini-prev-btn");
    bindPrev("exp-prev-btn");

    const bindSeek = (id) => {
      document.getElementById(id)?.addEventListener("input", (ev) => {
        audio.currentTime = Number(ev.target.value);
        updatePlayerUI();
      });
    };
    bindSeek("mini-seek");
    bindSeek("exp-seek");

    const bindVol = (id) => {
      document.getElementById(id)?.addEventListener("input", (ev) => {
        volume = Math.max(0, Math.min(1, Number(ev.target.value) / 100));
        muted = volume === 0;
        audio.volume = volume;
        try {
          window.localStorage.setItem(VOLUME_KEY, String(volume));
        } catch {
          // ignore
        }
        updatePlayerUI();
      });
    };
    bindVol("mini-vol");
    bindVol("exp-vol");

    document.getElementById("exp-shuffle-btn")?.addEventListener("click", () => {
      shuffle = !shuffle;
      updatePlayerUI();
    });
    document.getElementById("exp-repeat-btn")?.addEventListener("click", () => {
      const order = ["off", "all", "one"];
      repeatMode = order[(order.indexOf(repeatMode) + 1) % order.length];
      updatePlayerUI();
    });

    const expandedModal = document.getElementById("web-music-expanded");
    document.getElementById("mini-expand-btn")?.addEventListener("click", () => {
      expandedModal?.classList.remove("hidden");
    });
    document.getElementById("web-music-open-expanded")?.addEventListener("click", () => {
      expandedModal?.classList.remove("hidden");
    });
    document.getElementById("web-music-collapse")?.addEventListener("click", () => {
      expandedModal?.classList.add("hidden");
      window.SevenXAirSound?.play("modalClose");
    });

    void loadProviderStatus();
  }

  window.SevenXAirMusic = {
    onEnterMusicPage: () => {
      if (!catalogLoaded) {
        void loadDiscovery();
      }
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindMusicEvents);
  } else {
    bindMusicEvents();
  }
})();
