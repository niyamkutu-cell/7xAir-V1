import {
  ChevronDown,
  ChevronUp,
  Disc3,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { formatTrackTime, useMusicPlayer } from "../context/MusicPlayerContext";

export function MusicPlayerBar() {
  const {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    isBuffering,
    currentTimeSec,
    durationSec,
    volume,
    muted,
    shuffle,
    repeatMode,
    expanded,
    playbackError,
    setExpanded,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
  } = useMusicPlayer();

  if (!currentTrack) return null;

  const effectiveDuration = durationSec > 0 ? durationSec : currentTrack.durationSec || 0;

  return (
    <>
      {/* Expandable Full-Screen Black & Red Liquid-Glass Player Overlay */}
      {expanded && (
        <div
          className="music-full-overlay"
          role="dialog"
          aria-label="Expanded 7xAir Music Player"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background:
              "radial-gradient(circle at 30% 20%, rgba(220, 38, 38, 0.28), rgba(7, 7, 10, 0.96) 58%, #040406 100%)",
            backdropFilter: "blur(24px)",
            display: "flex",
            flexDirection: "column",
            padding: "28px 36px",
            gap: 20,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                className="glass-pill"
                style={{
                  borderColor: "rgba(239, 68, 68, 0.45)",
                  background: "rgba(220, 38, 38, 0.16)",
                  color: "#fecaca",
                }}
              >
                <Disc3 size={13} />
                {currentTrack.playbackQuality}
              </span>
            </div>
            <button
              type="button"
              className="glass-button"
              onClick={() => setExpanded(false)}
              aria-label="Collapse full player"
            >
              <ChevronDown size={15} /> Minimize Player
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(260px, 380px) minmax(280px, 1fr)",
              gap: 32,
              alignItems: "center",
              flex: 1,
              maxWidth: 1040,
              width: "100%",
              margin: "0 auto",
            }}
          >
            {/* Large Album Artwork with Red Accent Glow */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  width: 310,
                  height: 310,
                  borderRadius: 22,
                  overflow: "hidden",
                  border: "1px solid rgba(239, 68, 68, 0.42)",
                  boxShadow:
                    "0 22px 60px rgba(220, 38, 38, 0.32), 0 0 0 1px rgba(255,255,255,0.06)",
                  background: "rgba(18, 12, 14, 0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {currentTrack.artworkUrl ? (
                  <img
                    src={currentTrack.artworkUrl}
                    alt={currentTrack.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <Disc3 size={78} style={{ color: "#ef4444" }} />
                )}
              </div>

              <div style={{ textAlign: "center", maxWidth: 340 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
                  {currentTrack.title}
                </div>
                <div style={{ fontSize: 14, color: "#fca5a5", marginTop: 4 }}>
                  {currentTrack.artist} · {currentTrack.album}
                </div>
              </div>
            </div>

            {/* Playback Controls + Up Next Queue */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {playbackError && (
                <div
                  className="toast-banner"
                  style={{ borderColor: "rgba(239, 68, 68, 0.6)", color: "#fecaca" }}
                >
                  {playbackError}
                </div>
              )}

              {/* Seek Bar */}
              <div
                style={{
                  background: "rgba(12, 12, 16, 0.72)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: 16,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 38 }}>
                    {formatTrackTime(currentTimeSec)}
                  </span>
                  <input
                    type="range"
                    aria-label="Seek track position"
                    min={0}
                    max={effectiveDuration || 1}
                    step={0.5}
                    value={Math.min(currentTimeSec, effectiveDuration || 1)}
                    onChange={(e) => seekTo(Number(e.target.value))}
                    style={{ flex: 1, accentColor: "#ef4444" }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 38 }}>
                    {formatTrackTime(effectiveDuration)}
                  </span>
                </div>

                {/* Main Transport Controls */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 14,
                  }}
                >
                  <button
                    type="button"
                    className={`glass-button ${shuffle ? "glass-button--primary" : ""}`}
                    onClick={toggleShuffle}
                    aria-label="Toggle shuffle"
                    title="Shuffle"
                  >
                    <Shuffle size={15} />
                  </button>
                  <button
                    type="button"
                    className="glass-button"
                    onClick={() => void prevTrack()}
                    aria-label="Previous track"
                  >
                    <SkipBack size={17} />
                  </button>
                  <button
                    type="button"
                    className="glass-button"
                    onClick={() => void togglePlay()}
                    aria-label={isPlaying ? "Pause" : "Play"}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      justifyContent: "center",
                      background: "linear-gradient(135deg, #ef4444, #991b1b)",
                      borderColor: "rgba(248, 113, 113, 0.65)",
                      color: "#fff",
                      boxShadow: "0 0 24px rgba(239, 68, 68, 0.45)",
                    }}
                  >
                    {isBuffering ? (
                      <span className="spinner-ring" />
                    ) : isPlaying ? (
                      <Pause size={22} />
                    ) : (
                      <Play size={22} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="glass-button"
                    onClick={() => void nextTrack()}
                    aria-label="Next track"
                  >
                    <SkipForward size={17} />
                  </button>
                  <button
                    type="button"
                    className={`glass-button ${repeatMode !== "off" ? "glass-button--primary" : ""}`}
                    onClick={cycleRepeat}
                    aria-label="Cycle repeat mode"
                    title={`Repeat: ${repeatMode}`}
                  >
                    {repeatMode === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
                  </button>
                </div>

                {/* Volume Row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                  <button
                    type="button"
                    className="glass-button"
                    onClick={toggleMute}
                    aria-label={muted ? "Unmute" : "Mute"}
                  >
                    {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                  <input
                    type="range"
                    aria-label="Music volume"
                    min={0}
                    max={1}
                    step={0.02}
                    value={muted ? 0 : volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    style={{ width: 180, accentColor: "#ef4444" }}
                  />
                  <span style={{ fontSize: 11.5, color: "var(--text-secondary)", minWidth: 36 }}>
                    {Math.round((muted ? 0 : volume) * 100)}%
                  </span>
                </div>
              </div>

              {/* Queue Preview */}
              <div
                style={{
                  background: "rgba(10, 10, 14, 0.72)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 16,
                  padding: 14,
                  maxHeight: 230,
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fca5a5",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <ListMusic size={14} /> Up Next Queue ({queue.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {queue.map((t, i) => (
                    <button
                      key={`${t.provider}-${t.id}-${i}`}
                      type="button"
                      onClick={() => void playTrack(t, queue)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "7px 10px",
                        borderRadius: 10,
                        border:
                          i === queueIndex
                            ? "1px solid rgba(239, 68, 68, 0.55)"
                            : "1px solid transparent",
                        background:
                          i === queueIndex
                            ? "rgba(220, 38, 38, 0.18)"
                            : "rgba(255, 255, 255, 0.03)",
                        color: "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5 }}>
                        <strong>{t.title}</strong>{" "}
                        <span style={{ color: "var(--text-muted)" }}>— {t.artist}</span>
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {formatTrackTime(t.durationSec)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Floating Black & Red Liquid-Glass Mini-Player */}
      <div
        className="music-mini-player"
        aria-label="7xAir Mini Music Player"
        style={{
          position: "fixed",
          left: 248,
          right: 18,
          bottom: 14,
          zIndex: 45,
          background:
            "linear-gradient(135deg, rgba(10, 10, 14, 0.9), rgba(28, 8, 12, 0.88))",
          border: "1px solid rgba(239, 68, 68, 0.38)",
          boxShadow: "0 12px 34px rgba(0, 0, 0, 0.65), 0 0 22px rgba(220, 38, 38, 0.18)",
          backdropFilter: "blur(18px)",
          borderRadius: 16,
          padding: "10px 16px",
          display: "grid",
          gridTemplateColumns: "minmax(180px, 1.1fr) minmax(240px, 1.6fr) minmax(150px, 0.9fr)",
          alignItems: "center",
          gap: 14,
        }}
      >
        {/* Track Info */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              overflow: "hidden",
              flexShrink: 0,
              border: "1px solid rgba(239, 68, 68, 0.35)",
              background: "#14090c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {currentTrack.artworkUrl ? (
              <img
                src={currentTrack.artworkUrl}
                alt={currentTrack.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <Disc3 size={20} style={{ color: "#ef4444" }} />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {isPlaying && (
                <span className="eq-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
              )}
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: "#fff",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentTrack.title}
              </div>
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "#fca5a5",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {currentTrack.artist}
            </div>
          </div>
        </div>

        {/* Center Controls + Seek Bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <button
              type="button"
              className={`glass-button ${shuffle ? "glass-button--primary" : ""}`}
              style={{ padding: "4px 7px" }}
              onClick={toggleShuffle}
              aria-label="Shuffle"
            >
              <Shuffle size={12} />
            </button>
            <button
              type="button"
              className="glass-button"
              style={{ padding: "4px 7px" }}
              onClick={() => void prevTrack()}
              aria-label="Previous"
            >
              <SkipBack size={13} />
            </button>
            <button
              type="button"
              className="glass-button"
              style={{
                padding: "6px 10px",
                background: "linear-gradient(135deg, #ef4444, #991b1b)",
                borderColor: "rgba(248, 113, 113, 0.55)",
                color: "#fff",
              }}
              onClick={() => void togglePlay()}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isBuffering ? (
                <span className="spinner-ring" />
              ) : isPlaying ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}
            </button>
            <button
              type="button"
              className="glass-button"
              style={{ padding: "4px 7px" }}
              onClick={() => void nextTrack()}
              aria-label="Next"
            >
              <SkipForward size={13} />
            </button>
            <button
              type="button"
              className={`glass-button ${repeatMode !== "off" ? "glass-button--primary" : ""}`}
              style={{ padding: "4px 7px" }}
              onClick={cycleRepeat}
              aria-label="Repeat"
            >
              {repeatMode === "one" ? <Repeat1 size={12} /> : <Repeat size={12} />}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10.5, color: "var(--text-muted)", minWidth: 32 }}>
              {formatTrackTime(currentTimeSec)}
            </span>
            <input
              type="range"
              aria-label="Mini player seek bar"
              min={0}
              max={effectiveDuration || 1}
              step={0.5}
              value={Math.min(currentTimeSec, effectiveDuration || 1)}
              onChange={(e) => seekTo(Number(e.target.value))}
              style={{ flex: 1, height: 4, accentColor: "#ef4444" }}
            />
            <span style={{ fontSize: 10.5, color: "var(--text-muted)", minWidth: 32 }}>
              {formatTrackTime(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Right Volume + Expand */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            className="glass-button"
            style={{ padding: "5px 7px" }}
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          <input
            type="range"
            aria-label="Mini player volume"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ width: 78, accentColor: "#ef4444" }}
          />
          <button
            type="button"
            className="glass-button"
            style={{ padding: "5px 9px" }}
            onClick={() => setExpanded(true)}
            aria-label="Expand full player"
            title="Expand full player"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
