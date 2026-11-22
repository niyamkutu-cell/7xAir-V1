import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  controlSpotifyConnect,
  getMusicState,
  recordMusicPlayed,
  saveMusicPreferences,
} from "../lib/tauriBridge";
import type {
  MusicPreferences,
  MusicRepeatMode,
  MusicStateSnapshot,
  MusicTrack,
} from "../types/launcher";

export interface CustomMusicPlaylist {
  id: string;
  name: string;
  tracks: MusicTrack[];
}

const CUSTOM_PLAYLISTS_KEY = "7xair.customMusicPlaylists.v1";

export interface MusicPlayerContextValue {
  customPlaylists: CustomMusicPlaylist[];
  createCustomPlaylist: (name: string) => void;
  deleteCustomPlaylist: (id: string) => void;
  addTrackToCustomPlaylist: (playlistId: string, track: MusicTrack) => void;
  musicState: MusicStateSnapshot | null;
  currentTrack: MusicTrack | null;
  queue: MusicTrack[];
  queueIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTimeSec: number;
  durationSec: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeatMode: MusicRepeatMode;
  expanded: boolean;
  playbackError: string | null;
  playbackNotice: string | null;
  setExpanded: (open: boolean) => void;
  playTrack: (track: MusicTrack, nextQueue?: MusicTrack[]) => Promise<void>;
  togglePlay: () => Promise<void>;
  pausePlayback: () => void;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  seekTo: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  updatePreferences: (patch: Partial<MusicPreferences>) => Promise<void>;
  refreshMusicState: () => Promise<void>;
  onMinecraftLaunch: () => void;
  clearPlaybackError: () => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

export function formatTrackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicState, setMusicState] = useState<MusicStateSnapshot | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [volume, setVolumeState] = useState(0.75);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<MusicRepeatMode>("off");
  const [expanded, setExpanded] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null);
  const [customPlaylists, setCustomPlaylists] = useState<CustomMusicPlaylist[]>(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_PLAYLISTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as CustomMusicPlaylist[]) : [];
    } catch {
      return [];
    }
  });

  const persistPlaylists = (next: CustomMusicPlaylist[]) => {
    setCustomPlaylists(next);
    try {
      window.localStorage.setItem(CUSTOM_PLAYLISTS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const createCustomPlaylist = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setCustomPlaylists((prev) => {
      const next = [...prev, { id: `pl-${Date.now()}`, name: clean, tracks: [] }];
      try { window.localStorage.setItem(CUSTOM_PLAYLISTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const deleteCustomPlaylist = useCallback((id: string) => {
    setCustomPlaylists((prev) => {
      const next = prev.filter((p) => p.id !== id);
      try { window.localStorage.setItem(CUSTOM_PLAYLISTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const addTrackToCustomPlaylist = useCallback((playlistId: string, track: MusicTrack) => {
    setCustomPlaylists((prev) => {
      const next = prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (pl.tracks.some((t) => t.id === track.id && t.provider === track.provider)) return pl;
        return { ...pl, tracks: [...pl.tracks, track] };
      });
      try { window.localStorage.setItem(CUSTOM_PLAYLISTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setPlaybackNotice(`Added "${track.title}" to custom playlist.`);
  }, []);
  void persistPlaylists;

  const queueRef = useRef<MusicTrack[]>(queue);
  const queueIndexRef = useRef<number>(queueIndex);
  const shuffleRef = useRef<boolean>(shuffle);
  const repeatRef = useRef<MusicRepeatMode>(repeatMode);
  const prefsRef = useRef<MusicPreferences | null>(null);

  queueRef.current = queue;
  queueIndexRef.current = queueIndex;
  shuffleRef.current = shuffle;
  repeatRef.current = repeatMode;
  prefsRef.current = musicState?.preferences ?? null;

  const currentTrack =
    queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;

  const refreshMusicState = useCallback(async () => {
    try {
      const snap = await getMusicState();
      setMusicState(snap);
      setVolumeState(snap.preferences.volume);
      setShuffle(snap.preferences.shuffle);
      setRepeatMode(snap.preferences.repeatMode);
      if (audioRef.current) {
        audioRef.current.volume = snap.preferences.volume;
      }
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => {
    void refreshMusicState();
  }, [refreshMusicState]);

  const updatePreferences = useCallback(async (patch: Partial<MusicPreferences>) => {
    const base: MusicPreferences = prefsRef.current ?? {
      preferredProvider: "audius",
      volume: 0.75,
      shuffle: false,
      repeatMode: "off",
      pauseOnMinecraftLaunch: false,
      stopOnLauncherClose: true,
    };
    const next: MusicPreferences = { ...base, ...patch };
    setVolumeState(next.volume);
    setShuffle(next.shuffle);
    setRepeatMode(next.repeatMode);
    if (audioRef.current) {
      audioRef.current.volume = next.volume;
    }
    try {
      const snap = await saveMusicPreferences(next);
      setMusicState(snap);
    } catch {
      // best effort
    }
  }, []);

  const startAudioForTrack = useCallback(
    async (track: MusicTrack) => {
      setPlaybackError(null);
      setPlaybackNotice(null);

      // Record in recently played
      void recordMusicPlayed(track)
        .then(setMusicState)
        .catch(() => {});

      if (!track.streamUrl) {
        if (track.provider === "spotify" && track.uri) {
          try {
            const msg = await controlSpotifyConnect("play", track.uri);
            setIsPlaying(true);
            setPlaybackNotice(msg);
            return;
          } catch (err) {
            setIsPlaying(false);
            setPlaybackError(
              err instanceof Error
                ? err.message
                : "Spotify direct playback requires Premium + an active Spotify device."
            );
            return;
          }
        }
        setIsPlaying(false);
        setPlaybackError(
          `No direct audio stream is available for "${track.title}" from ${track.provider}. Try searching on Audius for full-length open-licensed streams.`
        );
        return;
      }

      const audio = audioRef.current;
      if (!audio) return;
      setIsBuffering(true);
      setCurrentTimeSec(0);
      setDurationSec(track.durationSec || 0);
      audio.src = track.streamUrl;
      audio.volume = muted ? 0 : volume;
      audio.load();
      try {
        await audio.play();
        setIsPlaying(true);
        setIsBuffering(false);
      } catch (err) {
        setIsPlaying(false);
        setIsBuffering(false);
        setPlaybackError(
          err instanceof Error
            ? `Playback interrupted: ${err.message}`
            : "Unable to start audio stream. Check your internet connection or try another track."
        );
      }
    },
    [muted, volume]
  );

  const playTrack = useCallback(
    async (track: MusicTrack, nextQueue?: MusicTrack[]) => {
      if (nextQueue && nextQueue.length > 0) {
        const idx = nextQueue.findIndex(
          (t) => t.id === track.id && t.provider === track.provider
        );
        const finalQueue = idx >= 0 ? nextQueue : [track, ...nextQueue];
        const finalIdx = idx >= 0 ? idx : 0;
        setQueue(finalQueue);
        setQueueIndex(finalIdx);
      } else {
        const existingIdx = queueRef.current.findIndex(
          (t) => t.id === track.id && t.provider === track.provider
        );
        if (existingIdx >= 0) {
          setQueueIndex(existingIdx);
        } else {
          setQueue([track]);
          setQueueIndex(0);
        }
      }
      await startAudioForTrack(track);
    },
    [startAudioForTrack]
  );

  const nextTrack = useCallback(async () => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const idx = queueIndexRef.current;
    let nextIdx: number;
    if (shuffleRef.current && q.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * q.length);
      } while (nextIdx === idx);
    } else if (idx + 1 < q.length) {
      nextIdx = idx + 1;
    } else if (repeatRef.current === "all") {
      nextIdx = 0;
    } else {
      setIsPlaying(false);
      return;
    }
    setQueueIndex(nextIdx);
    await startAudioForTrack(q[nextIdx]);
  }, [startAudioForTrack]);

  const prevTrack = useCallback(async () => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTimeSec(0);
      return;
    }
    const q = queueRef.current;
    if (q.length === 0) return;
    const idx = queueIndexRef.current;
    const prevIdx = idx > 0 ? idx - 1 : repeatRef.current === "all" ? q.length - 1 : 0;
    setQueueIndex(prevIdx);
    await startAudioForTrack(q[prevIdx]);
  }, [startAudioForTrack]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    setPlaybackError(null);
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (!audio.src && currentTrack.streamUrl) {
        await startAudioForTrack(currentTrack);
        return;
      }
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        setPlaybackError(
          err instanceof Error ? `Unable to resume playback: ${err.message}` : "Unable to resume playback."
        );
      }
    }
  }, [currentTrack, isPlaying, startAudioForTrack]);

  const pausePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const maxDur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durationSec;
    const clamped = Math.max(0, Math.min(seconds, maxDur || seconds));
    audio.currentTime = clamped;
    setCurrentTimeSec(clamped);
  }, [durationSec]);

  const setVolume = useCallback(
    (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      setVolumeState(clamped);
      if (clamped > 0 && muted) setMuted(false);
      if (audioRef.current) {
        audioRef.current.volume = clamped;
      }
      void updatePreferences({ volume: clamped });
    },
    [muted, updatePreferences]
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volume;
      }
      return next;
    });
  }, [volume]);

  const toggleShuffle = useCallback(() => {
    const next = !shuffleRef.current;
    setShuffle(next);
    void updatePreferences({ shuffle: next });
  }, [updatePreferences]);

  const cycleRepeat = useCallback(() => {
    const order: MusicRepeatMode[] = ["off", "all", "one"];
    const next = order[(order.indexOf(repeatRef.current) + 1) % order.length];
    setRepeatMode(next);
    void updatePreferences({ repeatMode: next });
  }, [updatePreferences]);

  const onMinecraftLaunch = useCallback(() => {
    if (prefsRef.current?.pauseOnMinecraftLaunch) {
      pausePlayback();
      setPlaybackNotice("Music paused automatically because Minecraft launched (configurable in Music Services).");
    }
  }, [pausePlayback]);

  // Initialize persistent HTML5 Audio element once for the lifetime of the launcher
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const handleTime = () => setCurrentTimeSec(audio.currentTime || 0);
    const handleMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSec(audio.duration);
      }
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      if (repeatRef.current === "one") {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      } else {
        void nextTrack();
      }
    };
    const handleError = () => {
      setIsBuffering(false);
      setIsPlaying(false);
      setPlaybackError(
        "Audio stream failed to load or buffer. Check your connection or try another track."
      );
    };

    audio.addEventListener("timeupdate", handleTime);
    audio.addEventListener("loadedmetadata", handleMeta);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    const handleBeforeUnload = () => {
      if (prefsRef.current?.stopOnLauncherClose ?? true) {
        audio.pause();
        audio.src = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      audio.removeEventListener("timeupdate", handleTime);
      audio.removeEventListener("loadedmetadata", handleMeta);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.pause();
      audio.src = "";
    };
  }, [nextTrack]);

  return (
    <MusicPlayerContext.Provider
      value={{
        customPlaylists,
        createCustomPlaylist,
        deleteCustomPlaylist,
        addTrackToCustomPlaylist,
        musicState,
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
        playbackNotice,
        setExpanded,
        playTrack,
        togglePlay,
        pausePlayback,
        nextTrack,
        prevTrack,
        seekTo,
        setVolume,
        toggleMute,
        toggleShuffle,
        cycleRepeat,
        updatePreferences,
        refreshMusicState,
        onMinecraftLaunch,
        clearPlaybackError: () => setPlaybackError(null),
      }}
    >
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) {
    throw new Error("useMusicPlayer must be used inside MusicPlayerProvider");
  }
  return ctx;
}
