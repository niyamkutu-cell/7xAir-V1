import { CheckCircle2, KeyRound, Plus, UserCheck, X } from "lucide-react";
import { useState } from "react";
import { pollMicrosoftLogin, signInMicrosoftBrowser, startMicrosoftLogin } from "../lib/tauriBridge";
import type { MicrosoftDeviceCodeSession, ProfileStore } from "../types/launcher";
import { GlassPanel } from "./GlassPanel";

interface AuthQuickModalProps {
  mode: "microsoft" | "local";
  profileStore: ProfileStore;
  onClose: () => void;
  onCreateOffline: (username: string) => Promise<void>;
  onSelectProfile: (profileId: string) => Promise<void>;
  onRefreshProfiles: () => Promise<void>;
}

export function AuthQuickModal({
  mode,
  profileStore,
  onClose,
  onCreateOffline,
  onSelectProfile,
  onRefreshProfiles,
}: AuthQuickModalProps) {
  const [username, setUsername] = useState("");
  const [msaSession, setMsaSession] = useState<MicrosoftDeviceCodeSession | null>(null);
  const [browserSigningIn, setBrowserSigningIn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreateLocal = async () => {
    setError(null);
    setNotice(null);
    try {
      await onCreateOffline(username);
      setUsername("");
      setNotice("Offline local profile created and activated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBrowserMicrosoft = async () => {
    setError(null);
    setNotice("Opening Microsoft sign-in in your browser... Select your email and sign in.");
    setBrowserSigningIn(true);
    try {
      const profile = await signInMicrosoftBrowser();
      await onRefreshProfiles();
      setNotice(`Signed in with Microsoft account: ${profile.username}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNotice(null);
    } finally {
      setBrowserSigningIn(false);
    }
  };

  const handleStartMicrosoft = async () => {
    setError(null);
    setNotice(null);
    try {
      const session = await startMicrosoftLogin();
      setMsaSession(session);
      setNotice(session.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePollMicrosoft = async () => {
    if (!msaSession) return;
    setError(null);
    try {
      const profile = await pollMicrosoftLogin(msaSession.deviceCode);
      if (profile) {
        setMsaSession(null);
        await onRefreshProfiles();
        setNotice(`Signed in with Microsoft account: ${profile.username}`);
      } else {
        setNotice("Waiting for browser confirmation...");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(4, 8, 18, 0.58)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
    >
      <GlassPanel className="panel-pad" style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            {mode === "microsoft" ? <KeyRound size={16} /> : <UserCheck size={16} />}
            {mode === "microsoft" ? "Sign In with Microsoft" : "Play Locally (Offline Profiles)"}
          </h2>
          <button type="button" className="window-btn" aria-label="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {notice && <div className="toast-banner" style={{ marginBottom: 12 }}>{notice}</div>}
        {error && (
          <div
            className="toast-banner"
            style={{ marginBottom: 12, borderColor: "rgba(239, 68, 68, 0.55)" }}
          >
            {error}
          </div>
        )}

        {mode === "microsoft" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="hero-copy">
              Click below to open Microsoft sign-in in your browser. Choose your email, enter your password, and 7xAir will sign you in automatically. No passwords are ever stored by 7xAir.
            </p>
            {!msaSession ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  className="glass-button glass-button--primary"
                  disabled={browserSigningIn}
                  onClick={() => void handleBrowserMicrosoft()}
                >
                  {browserSigningIn ? "Waiting for Browser Sign-In..." : "Sign In with Microsoft"}
                </button>
                <button
                  type="button"
                  className="glass-button"
                  style={{ fontSize: 12, opacity: 0.85 }}
                  disabled={browserSigningIn}
                  onClick={() => void handleStartMicrosoft()}
                >
                  Use Device Code Instead
                </button>
              </div>
            ) : (
              <>
                <div className="path-mono">
                  Open: {msaSession.verificationUri}
                  <br />
                  Code: <strong>{msaSession.userCode}</strong>
                </div>
                <button
                  type="button"
                  className="glass-button glass-button--primary"
                  onClick={() => void handlePollMicrosoft()}
                >
                  Confirm Microsoft Sign In
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="hero-copy">
              Play without an account using remembered local profiles (offline UUID v3). Your 3D skin
              still previews by Minecraft IGN.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                className="glass-input"
                placeholder="Enter Minecraft IGN (3–16 chars)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateLocal();
                }}
              />
              <button
                type="button"
                className="glass-button glass-button--primary"
                onClick={() => void handleCreateLocal()}
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {profileStore.profiles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 190, overflowY: "auto" }}>
                {profileStore.profiles.map((p) => {
                  const active = p.id === profileStore.activeProfileId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="profile-mini-btn"
                      onClick={() => void onSelectProfile(p.id)}
                    >
                      <span className="avatar-monogram">{p.username.slice(0, 2).toUpperCase()}</span>
                      <span style={{ flex: 1 }}>
                        <strong>{p.username}</strong>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {p.provider === "microsoft" ? "Microsoft Verified" : "Offline Local Profile"}
                        </div>
                      </span>
                      {active && (
                        <span className="glass-pill" style={{ padding: "2px 8px", fontSize: 10.5 }}>
                          <CheckCircle2 size={11} /> Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
