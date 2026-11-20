import { CheckCircle2, KeyRound, Plus, Trash2, UserCheck } from "lucide-react";
import { useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import { pollMicrosoftLogin, startMicrosoftLogin } from "../lib/tauriBridge";
import type { MicrosoftDeviceCodeSession, ProfileStore } from "../types/launcher";

interface ProfilesPageProps {
  profileStore: ProfileStore;
  onCreateOffline: (username: string) => Promise<void>;
  onSelectProfile: (profileId: string) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onRefreshProfiles: () => Promise<void>;
}

export function ProfilesPage({
  profileStore,
  onCreateOffline,
  onSelectProfile,
  onDeleteProfile,
  onRefreshProfiles,
}: ProfilesPageProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [msaSession, setMsaSession] = useState<MicrosoftDeviceCodeSession | null>(null);

  const handleAddOffline = async () => {
    setError(null);
    setNotice(null);
    try {
      await onCreateOffline(username);
      setUsername("");
      setNotice("Created offline local profile with deterministic UUID v3.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStartMsa = async () => {
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

  const handlePollMsa = async () => {
    if (!msaSession) return;
    setError(null);
    try {
      const profile = await pollMicrosoftLogin(msaSession.deviceCode);
      if (profile) {
        setMsaSession(null);
        await onRefreshProfiles();
        setNotice(`Linked Microsoft account: ${profile.username}`);
      } else {
        setNotice("Waiting for Microsoft sign-in confirmation in your browser...");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Profiles & Authentication</h1>
          <p className="page-subtitle">
            Use offline local profiles anytime or link an optional Microsoft account via Device Code OAuth.
          </p>
        </div>
        <span className="glass-pill">
          <UserCheck size={13} />
          {profileStore.profiles.length} Saved
        </span>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      <div className="two-col-grid">
        <GlassPanel className="panel-pad">
          <h2 className="section-title">Create Offline Local Profile</h2>
          <p className="hero-copy" style={{ marginBottom: 14 }}>
            Offline profiles generate a standard Minecraft UUID v3 locally and never require internet access.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              className="glass-input"
              placeholder="Username (3–16 chars, A-Z, 0-9, _)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <button
              type="button"
              className="glass-button glass-button--primary"
              onClick={() => void handleAddOffline()}
            >
              <Plus size={15} />
              Add
            </button>
          </div>
        </GlassPanel>

        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={16} />
            Optional Microsoft Login
          </h2>
          <p className="hero-copy" style={{ marginBottom: 14 }}>
            Exchanges Microsoft Device Code → Xbox Live → XSTS → Minecraft Services token when{" "}
            <code>SEVENXAIR_MSA_CLIENT_ID</code> is configured.
          </p>
          {!msaSession ? (
            <button
              type="button"
              className="glass-button"
              onClick={() => void handleStartMsa()}
            >
              Start Microsoft Device Code Sign-In
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="path-mono">
                URL: {msaSession.verificationUri} | Code: {msaSession.userCode}
              </div>
              <button
                type="button"
                className="glass-button glass-button--primary"
                onClick={() => void handlePollMsa()}
              >
                Check Sign-In Completion
              </button>
            </div>
          )}
        </GlassPanel>
      </div>

      <GlassPanel className="panel-pad">
        <h2 className="section-title">Saved Profiles</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {profileStore.profiles.map((profile) => {
            const active = profile.id === profileStore.activeProfileId;
            return (
              <div
                key={profile.id}
                className="glass-panel--subtle"
                style={{
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong>{profile.username}</strong>
                    <span className="nav-badge">{profile.provider}</span>
                    {active && (
                      <span className="glass-pill" style={{ padding: "2px 8px", fontSize: 11 }}>
                        <CheckCircle2 size={11} /> Active
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
                    UUID: {profile.uuid}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  {!active && (
                    <button
                      type="button"
                      className="glass-button"
                      onClick={() => void onSelectProfile(profile.id)}
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    type="button"
                    className="glass-button"
                    aria-label={`Delete ${profile.username}`}
                    onClick={() => void onDeleteProfile(profile.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </GlassPanel>
    </div>
  );
}
