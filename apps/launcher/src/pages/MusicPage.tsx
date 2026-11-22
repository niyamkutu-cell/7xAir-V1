import {
  Clock,
  Disc3,
  ExternalLink,
  Flame,
  Headphones,
  Link2,
  ListMusic,
  Music2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Unlink,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import { formatTrackTime, useMusicPlayer } from "../context/MusicPlayerContext";
import {
  connectSpotifyAccount,
  disconnectSpotifyAccount,
  fetchMusicCollectionTracks,
  fetchMusicDiscovery,
  searchMusicCatalog,
  setSpotifyClientId,
} from "../lib/tauriBridge";
import type {
  MusicCollection,
  MusicDiscoveryResponse,
  MusicProviderId,
  MusicSearchMode,
  MusicSearchResponse,
  MusicTrack,
} from "../types/launcher";

type MusicSubTab = "discover" | "search" | "collections" | "recent" | "services";

export function MusicPage() {
  const {
    customPlaylists,
    createCustomPlaylist,
    deleteCustomPlaylist,
    addTrackToCustomPlaylist,
    musicState,
    currentTrack,
    isPlaying,
    isBuffering,
    volume,
    playbackError,
    playbackNotice,
    playTrack,
    togglePlay,
    setVolume,
    setExpanded,
    updatePreferences,
    refreshMusicState,
    clearPlaybackError,
  } = useMusicPlayer();

  const [subTab, setSubTab] = useState<MusicSubTab>("discover");
  const [provider, setProvider] = useState<MusicProviderId>(
    musicState?.preferences.preferredProvider ?? "audius"
  );
  const [discovery, setDiscovery] = useState<MusicDiscoveryResponse | null>(null);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<MusicSearchMode>("all");
  const [searchResult, setSearchResult] = useState<MusicSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeCollection, setActiveCollection] = useState<MusicCollection | null>(null);
  const [collectionTracks, setCollectionTracks] = useState<MusicTrack[]>([]);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [spotifyClientIdInput, setSpotifyClientIdInput] = useState("");
  const [serviceBusy, setServiceBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  useEffect(() => {
    if (musicState?.preferences.preferredProvider) {
      setProvider(musicState.preferences.preferredProvider);
    }
  }, [musicState?.preferences.preferredProvider]);

  const loadDiscovery = async (targetProvider: MusicProviderId) => {
    setLoadingDiscovery(true);
    setPageError(null);
    try {
      const res = await fetchMusicDiscovery(targetProvider);
      setDiscovery(res);
    } catch (err) {
      setDiscovery(null);
      setPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDiscovery(false);
    }
  };

  useEffect(() => {
    void loadDiscovery(provider);
  }, [provider]);

  const handleProviderChange = async (nextProvider: MusicProviderId) => {
    setProvider(nextProvider);
    setActiveCollection(null);
    setCollectionTracks([]);
    await updatePreferences({ preferredProvider: nextProvider });
  };

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setPageError(null);
    setSubTab("search");
    try {
      const res = await searchMusicCatalog(provider, trimmed, searchMode);
      setSearchResult(res);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const handleOpenCollection = async (col: MusicCollection) => {
    setActiveCollection(col);
    setLoadingCollection(true);
    setPageError(null);
    try {
      const tracks = await fetchMusicCollectionTracks(col.provider, col.kind, col.id);
      setCollectionTracks(tracks);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
      setCollectionTracks([]);
    } finally {
      setLoadingCollection(false);
    }
  };

  const handleSaveSpotifyClientId = async () => {
    setServiceBusy(true);
    setPageError(null);
    setPageNotice(null);
    try {
      await setSpotifyClientId(spotifyClientIdInput);
      await refreshMusicState();
      setPageNotice("Saved Spotify Client ID for PKCE OAuth.");
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setServiceBusy(false);
    }
  };

  const handleConnectSpotify = async () => {
    setServiceBusy(true);
    setPageError(null);
    setPageNotice(null);
    try {
      const snap = await connectSpotifyAccount();
      await refreshMusicState();
      setPageNotice(
        `Connected Spotify account${snap.spotify.displayName ? ` (${snap.spotify.displayName})` : ""}.`
      );
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setServiceBusy(false);
    }
  };

  const handleDisconnectSpotify = async () => {
    setServiceBusy(true);
    setPageError(null);
    setPageNotice(null);
    try {
      await disconnectSpotifyAccount();
      await refreshMusicState();
      setPageNotice("Disconnected Spotify account.");
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setServiceBusy(false);
    }
  };

  const renderTrackCard = (track: MusicTrack, list: MusicTrack[]) => {
    const isCurrent =
      currentTrack?.id === track.id && currentTrack?.provider === track.provider;
    return (
      <div
        key={`${track.provider}-${track.id}`}
        style={{
          background: isCurrent
            ? "linear-gradient(135deg, rgba(220, 38, 38, 0.22), rgba(14, 10, 12, 0.9))"
            : "rgba(10, 10, 14, 0.78)",
          border: isCurrent
            ? "1px solid rgba(239, 68, 68, 0.58)"
            : "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 14,
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          transition: "border-color 0.2s ease, transform 0.2s ease",
        }}
      >
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 10,
            overflow: "hidden",
            flexShrink: 0,
            border: "1px solid rgba(239, 68, 68, 0.28)",
            background: "#130a0c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {track.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt={track.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Disc3 size={22} style={{ color: "#ef4444" }} />
          )}
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13.5,
              color: "#fff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {track.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#fca5a5",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
            }}
          >
            {track.artist} · {track.album}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: "var(--text-muted)",
              marginTop: 3,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{formatTrackTime(track.durationSec)}</span>
            <span>·</span>
            <span>{track.playbackQuality}</span>
          </div>
        </div>

        {customPlaylists.length > 0 && (
          <button
            type="button"
            className="glass-button"
            style={{ padding: "6px 8px", fontSize: 11 }}
            title={`Add to ${customPlaylists[0].name}`}
            onClick={() => addTrackToCustomPlaylist(customPlaylists[0].id, track)}
          >
            + List
          </button>
        )}
        <button
          type="button"
          className="glass-button"
          style={{
            padding: "8px 12px",
            background:
              isCurrent && isPlaying
                ? "linear-gradient(135deg, #ef4444, #991b1b)"
                : "rgba(220, 38, 38, 0.16)",
            borderColor: "rgba(239, 68, 68, 0.48)",
            color: "#fff",
          }}
          onClick={() => {
            if (isCurrent) {
              void togglePlay();
            } else {
              void playTrack(track, list);
            }
          }}
          aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        >
          {isCurrent && isBuffering ? (
            <span className="spinner-ring" />
          ) : isCurrent && isPlaying ? (
            <Pause size={14} />
          ) : (
            <Play size={14} />
          )}
        </button>
      </div>
    );
  };

  const renderCollectionCard = (col: MusicCollection) => (
    <button
      key={`${col.provider}-${col.kind}-${col.id}`}
      type="button"
      onClick={() => {
        setSubTab("collections");
        void handleOpenCollection(col);
      }}
      style={{
        background: "rgba(10, 10, 14, 0.8)",
        border: "1px solid rgba(239, 68, 68, 0.22)",
        borderRadius: 14,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        cursor: "pointer",
        textAlign: "left",
        color: "#fff",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 10,
          overflow: "hidden",
          background: "#14090c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {col.artworkUrl ? (
          <img
            src={col.artworkUrl}
            alt={col.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <ListMusic size={34} style={{ color: "#ef4444" }} />
        )}
      </div>
      <div>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {col.title}
        </div>
        <div style={{ fontSize: 11.5, color: "#fca5a5", marginTop: 2 }}>
          {col.subtitle} · {col.kind === "album" ? "Album" : "Playlist"}
          {col.trackCount > 0 ? ` (${col.trackCount})` : ""}
        </div>
      </div>
    </button>
  );

  const prefs = musicState?.preferences;
  const spotify = musicState?.spotify;
  const recent = musicState?.recentlyPlayed ?? [];

  return (
    <div
      className="page-enter"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        paddingBottom: currentTrack ? 96 : 16,
      }}
    >
      {/* Black & Red Liquid-Glass Music Hero */}
      <GlassPanel
        className="panel-pad"
        style={{
          background:
            "radial-gradient(circle at 85% 15%, rgba(220, 38, 38, 0.24), rgba(8, 8, 12, 0.88) 55%)",
          borderColor: "rgba(239, 68, 68, 0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span
                className="glass-pill"
                style={{
                  borderColor: "rgba(239, 68, 68, 0.45)",
                  background: "rgba(220, 38, 38, 0.18)",
                  color: "#fecaca",
                }}
              >
                <Music2 size={12} /> 7xAir Music
              </span>
              <span className="glass-pill" style={{ fontSize: 11 }}>
                Provider: {provider.toUpperCase()}
              </span>
            </div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>
              Integrated Music Player
            </h1>
            <p className="page-subtitle">
              Stream official catalogs in the background while playing Minecraft — zero scraping, full playback controls.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              aria-label="Active music provider"
              className="glass-select"
              style={{ width: 175 }}
              value={provider}
              onChange={(e) => void handleProviderChange(e.target.value as MusicProviderId)}
            >
              <option value="audius">Audius (Full Streams)</option>
              <option value="deezer">Deezer (30s Previews)</option>
              <option value="spotify">Spotify (OAuth / Connect)</option>
            </select>
            {currentTrack && (
              <button
                type="button"
                className="glass-button"
                style={{
                  borderColor: "rgba(239, 68, 68, 0.5)",
                  background: "rgba(220, 38, 38, 0.2)",
                  color: "#fff",
                }}
                onClick={() => setExpanded(true)}
              >
                <Headphones size={14} /> Open Full Player
              </button>
            )}
            <button
              type="button"
              className="glass-button"
              disabled={loadingDiscovery}
              onClick={() => void loadDiscovery(provider)}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* Search Bar + Search Mode */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 14,
            alignItems: "center",
          }}
        >
          <div style={{ position: "relative", flex: "1 1 260px" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#fca5a5",
              }}
            />
            <input
              type="text"
              className="glass-input"
              style={{ paddingLeft: 34, borderColor: "rgba(239, 68, 68, 0.28)" }}
              placeholder="Search songs, artists, albums, or playlists..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSearch();
              }}
            />
          </div>
          <select
            aria-label="Search filter mode"
            className="glass-select"
            style={{ width: 145 }}
            value={searchMode}
            onChange={(e) => setSearchMode(e.target.value as MusicSearchMode)}
          >
            <option value="all">All Results</option>
            <option value="song">By Song Name</option>
            <option value="artist">By Artist</option>
          </select>
          <button
            type="button"
            className="glass-button"
            disabled={searching || !query.trim()}
            style={{
              background: "linear-gradient(135deg, #ef4444, #991b1b)",
              borderColor: "rgba(248, 113, 113, 0.55)",
              color: "#fff",
            }}
            onClick={() => void handleSearch()}
          >
            {searching ? <span className="spinner-ring" /> : <Search size={14} />}
            Search
          </button>
        </div>

        {/* Section Tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {(
            [
              ["discover", "Discover", Flame],
              ["search", "Search Results", Search],
              ["collections", "Playlists & Albums", ListMusic],
              ["recent", `Recently Played (${recent.length})`, Clock],
              ["services", "Music Services", Settings2],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={`toggle-btn ${subTab === id ? "toggle-btn--on" : ""}`}
              style={
                subTab === id
                  ? {
                      borderColor: "rgba(239, 68, 68, 0.65)",
                      background: "rgba(220, 38, 38, 0.24)",
                      color: "#fff",
                    }
                  : undefined
              }
              onClick={() => setSubTab(id)}
            >
              <Icon size={13} style={{ marginRight: 6 }} />
              {label}
            </button>
          ))}
        </div>
      </GlassPanel>

      {(pageError || playbackError) && (
        <div
          className="toast-banner"
          style={{
            borderColor: "rgba(239, 68, 68, 0.6)",
            color: "#fecaca",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>{playbackError ?? pageError}</span>
          <button
            type="button"
            className="glass-button"
            style={{ padding: "4px 8px", fontSize: 11 }}
            onClick={() => {
              setPageError(null);
              clearPlaybackError();
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {(pageNotice || playbackNotice || discovery?.notice) && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.3)" }}>
          {pageNotice ?? playbackNotice ?? discovery?.notice}
        </div>
      )}

      {/* DISCOVER TAB */}
      {subTab === "discover" && (
        <>
          <GlassPanel className="panel-pad">
            <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Flame size={16} style={{ color: "#ef4444" }} />
              Popular Music
            </h2>
            {loadingDiscovery ? (
              <p className="hero-copy">Loading live popular tracks from {provider}...</p>
            ) : !discovery || discovery.popular.length === 0 ? (
              <p className="hero-copy">
                No tracks loaded yet. Click Refresh or switch providers in Music Services.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
                  gap: 10,
                }}
              >
                {discovery.popular.map((t) => renderTrackCard(t, discovery.popular))}
              </div>
            )}
          </GlassPanel>

          <GlassPanel className="panel-pad">
            <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} style={{ color: "#ef4444" }} />
              Recommended Music
            </h2>
            {!discovery || discovery.recommended.length === 0 ? (
              <p className="hero-copy">Recommended tracks will appear once the catalog loads.</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
                  gap: 10,
                }}
              >
                {discovery.recommended.map((t) => renderTrackCard(t, discovery.recommended))}
              </div>
            )}
          </GlassPanel>
        </>
      )}

      {/* SEARCH TAB */}
      {subTab === "search" && (
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={16} style={{ color: "#ef4444" }} />
            Search Results {searchResult?.query ? `for "${searchResult.query}"` : ""}
          </h2>
          {searching ? (
            <p className="hero-copy">Searching {provider} catalog...</p>
          ) : !searchResult || searchResult.tracks.length === 0 ? (
            <p className="hero-copy">
              Enter a song title or artist name in the search bar above to query {provider}.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
                  gap: 10,
                }}
              >
                {searchResult.tracks.map((t) => renderTrackCard(t, searchResult.tracks))}
              </div>

              {(searchResult.albums.length > 0 || searchResult.playlists.length > 0) && (
                <div>
                  <h3 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10, color: "#fca5a5" }}>
                    Matching Playlists &amp; Albums
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {[...searchResult.albums, ...searchResult.playlists].map(renderCollectionCard)}
                  </div>
                </div>
              )}
            </div>
          )}
        </GlassPanel>
      )}

      {/* PLAYLISTS & ALBUMS TAB */}
      {subTab === "collections" && (
        <GlassPanel className="panel-pad">
          {activeCollection ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 className="section-title" style={{ marginBottom: 2 }}>
                    {activeCollection.title}
                  </h2>
                  <div style={{ fontSize: 12, color: "#fca5a5" }}>
                    {activeCollection.subtitle} · {activeCollection.kind.toUpperCase()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {collectionTracks.length > 0 && (
                    <button
                      type="button"
                      className="glass-button"
                      style={{
                        background: "linear-gradient(135deg, #ef4444, #991b1b)",
                        borderColor: "rgba(248, 113, 113, 0.55)",
                        color: "#fff",
                      }}
                      onClick={() => void playTrack(collectionTracks[0], collectionTracks)}
                    >
                      <Play size={14} /> Play All ({collectionTracks.length})
                    </button>
                  )}
                  <button
                    type="button"
                    className="glass-button"
                    onClick={() => {
                      setActiveCollection(null);
                      setCollectionTracks([]);
                    }}
                  >
                    Back to Playlists &amp; Albums
                  </button>
                </div>
              </div>

              {loadingCollection ? (
                <p className="hero-copy">Loading tracks...</p>
              ) : collectionTracks.length === 0 ? (
                <p className="hero-copy">No playable tracks returned for this collection.</p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
                    gap: 10,
                  }}
                >
                  {collectionTracks.map((t) => renderTrackCard(t, collectionTracks))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ marginBottom: 14 }}>
                <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ListMusic size={16} style={{ color: "#ef4444" }} />
                  My Custom Playlists ({customPlaylists.length})
                </h2>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <input
                    type="text"
                    className="glass-input"
                    style={{ flex: "1 1 220px" }}
                    placeholder="New custom playlist name..."
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="glass-button glass-button--primary"
                    onClick={() => {
                      if (!newPlaylistName.trim()) return;
                      createCustomPlaylist(newPlaylistName);
                      setNewPlaylistName("");
                      setPageNotice("Created custom playlist.");
                    }}
                  >
                    Create Playlist
                  </button>
                </div>
                {customPlaylists.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {customPlaylists.map((pl) => (
                      <div key={pl.id} className="glass-panel--subtle" style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                        <strong>{pl.name}</strong> ({pl.tracks.length})
                        {pl.tracks.length > 0 && (
                          <button type="button" className="glass-button" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => void playTrack(pl.tracks[0], pl.tracks)}>
                            Play
                          </button>
                        )}
                        <button type="button" className="glass-button" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => deleteCustomPlaylist(pl.id)}>
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ListMusic size={16} style={{ color: "#ef4444" }} />
                  Playlists
                </h2>
                {!discovery || discovery.playlists.length === 0 ? (
                  <p className="hero-copy">No playlists loaded for {provider} yet.</p>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {discovery.playlists.map(renderCollectionCard)}
                  </div>
                )}
              </div>

              <div>
                <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Disc3 size={16} style={{ color: "#ef4444" }} />
                  Albums
                </h2>
                {!discovery || discovery.albums.length === 0 ? (
                  <p className="hero-copy">
                    No albums returned for {provider}. Switch to Deezer or search by album name.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {discovery.albums.map(renderCollectionCard)}
                  </div>
                )}
              </div>
            </div>
          )}
        </GlassPanel>
      )}

      {/* RECENTLY PLAYED TAB */}
      {subTab === "recent" && (
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} style={{ color: "#ef4444" }} />
            Recently Played
          </h2>
          {recent.length === 0 ? (
            <p className="hero-copy">
              Tracks you play in 7xAir will appear here automatically.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
                gap: 10,
              }}
            >
              {recent.map((t) => renderTrackCard(t, recent))}
            </div>
          )}
        </GlassPanel>
      )}

      {/* MUSIC SERVICES & BACKGROUND PLAYBACK SETTINGS TAB */}
      {subTab === "services" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <GlassPanel className="panel-pad">
            <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Radio size={16} style={{ color: "#ef4444" }} />
              Connected Music Services (Official APIs &amp; OAuth)
            </h2>

            <div className="setting-row">
              <div>
                <div className="setting-label">Audius Official Open API (Ready)</div>
                <div className="setting-desc">
                  Full-length, artist-authorized streaming with no account or password required.
                </div>
              </div>
              <button
                type="button"
                className={`toggle-btn ${provider === "audius" ? "toggle-btn--on" : ""}`}
                onClick={() => void handleProviderChange("audius")}
              >
                {provider === "audius" ? "Active" : "Use Audius"}
              </button>
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-label">Deezer Official Public Catalog (Ready)</div>
                <div className="setting-desc">
                  Global charts, albums, playlists, and search with official 30-second MP3 previews.
                </div>
              </div>
              <button
                type="button"
                className={`toggle-btn ${provider === "deezer" ? "toggle-btn--on" : ""}`}
                onClick={() => void handleProviderChange("deezer")}
              >
                {provider === "deezer" ? "Active" : "Use Deezer"}
              </button>
            </div>

            {/* Spotify Official PKCE OAuth Card */}
            <div
              className="glass-panel--subtle"
              style={{
                marginTop: 12,
                padding: 16,
                borderColor: "rgba(239, 68, 68, 0.28)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div className="setting-label">Spotify Official OAuth 2.0 (PKCE)</div>
                  <div className="setting-desc">
                    {spotify?.connected
                      ? `Connected as ${spotify.displayName ?? "Spotify User"} (Plan: ${spotify.product ?? "unknown"})`
                      : "Sign in securely through Spotify's official browser OAuth — 7xAir never asks for your Spotify password."}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {spotify?.connected ? (
                    <button
                      type="button"
                      className="glass-button"
                      disabled={serviceBusy}
                      onClick={() => void handleDisconnectSpotify()}
                    >
                      <Unlink size={14} /> Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="glass-button"
                      disabled={serviceBusy}
                      style={{
                        background: "linear-gradient(135deg, #ef4444, #991b1b)",
                        borderColor: "rgba(248, 113, 113, 0.55)",
                        color: "#fff",
                      }}
                      onClick={() => void handleConnectSpotify()}
                    >
                      <Link2 size={14} /> Connect Spotify
                    </button>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 11.5, color: "#fca5a5" }}>
                {spotify?.premiumRequiredNote}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="text"
                  className="glass-input"
                  style={{ flex: "1 1 240px" }}
                  placeholder={
                    spotify?.clientIdConfigured
                      ? `Spotify Client ID configured (${spotify.clientIdSource}) — enter new ID to replace`
                      : "Enter your Spotify App Client ID (no client secret needed)"
                  }
                  value={spotifyClientIdInput}
                  onChange={(e) => setSpotifyClientIdInput(e.target.value)}
                />
                <button
                  type="button"
                  className="glass-button"
                  disabled={serviceBusy || !spotifyClientIdInput.trim()}
                  onClick={() => void handleSaveSpotifyClientId()}
                >
                  Save Client ID
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                <ExternalLink size={11} />
                OAuth Redirect URI for Spotify Developer Dashboard:{" "}
                <code>{spotify?.redirectUri ?? "http://127.0.0.1:43821/callback"}</code>
              </div>
            </div>
          </GlassPanel>

          {/* Background Playback Preferences */}
          <GlassPanel className="panel-pad">
            <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Headphones size={16} style={{ color: "#ef4444" }} />
              Background Playback &amp; Minecraft Integration
            </h2>

            <div className="setting-row">
              <div>
                <div className="setting-label">Pause Music When Minecraft Launches</div>
                <div className="setting-desc">
                  OFF: Music continues playing smoothly in the background while Minecraft runs. ON: Automatically pauses playback when a Minecraft instance launches.
                </div>
              </div>
              <button
                type="button"
                className={`toggle-btn ${prefs?.pauseOnMinecraftLaunch ? "toggle-btn--on" : ""}`}
                onClick={() =>
                  void updatePreferences({
                    pauseOnMinecraftLaunch: !(prefs?.pauseOnMinecraftLaunch ?? false),
                  })
                }
              >
                {prefs?.pauseOnMinecraftLaunch ? "ON" : "OFF"}
              </button>
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-label">Stop Playback When Launcher Closes</div>
                <div className="setting-desc">
                  Cleanly stops and releases the audio stream when you close 7xAir.
                </div>
              </div>
              <button
                type="button"
                className={`toggle-btn ${(prefs?.stopOnLauncherClose ?? true) ? "toggle-btn--on" : ""}`}
                onClick={() =>
                  void updatePreferences({
                    stopOnLauncherClose: !(prefs?.stopOnLauncherClose ?? true),
                  })
                }
              >
                {(prefs?.stopOnLauncherClose ?? true) ? "ON" : "OFF"}
              </button>
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-label">
                  Independent Music Volume ({Math.round(volume * 100)}%)
                </div>
                <div className="setting-desc">
                  Controls launcher music volume independently from Minecraft&apos;s in-game audio.
                </div>
              </div>
              <input
                type="range"
                aria-label="Independent music volume"
                min={0}
                max={1}
                step={0.02}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{ width: 200, accentColor: "#ef4444" }}
              />
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
