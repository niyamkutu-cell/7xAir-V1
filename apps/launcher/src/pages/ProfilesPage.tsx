import {
  CheckCircle2,
  Copy,
  KeyRound,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import { getMsaAuthStatus, pollMicrosoftLogin, signInMicrosoftBrowser, startMicrosoftLogin } from "../lib/tauriBridge";
import type { MicrosoftDeviceCodeSession, MsaAuthConfigStatus, ProfileStore } from "../types/launcher";

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
  const [msaStatus, setMsaStatus] = useState<MsaAuthConfigStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [browserSigningIn, setBrowserSigningIn] = useState(false);

  useEffect(() => {
    let active = true;
    void getMsaAuthStatus()
      .then((st) => {
        if (active) setMsaStatus(st);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const activeProfile =
    profileStore.profiles.find((p) => p.id === profileStore.activeProfileId) ?? null;

  // Automatically poll official Microsoft Device Code token endpoint while waiting for browser confirmation
  useEffect(() => {
    if (!msaSession) return;
    let active = true;
    const intervalMs = Math.max(3, msaSession.interval || 5) * 1000;
    const timer = window.setInterval(async () => {
      if (!active) return;
      try {
        const profile = await pollMicrosoftLogin(msaSession.deviceCode);
        if (profile && active) {
          setMsaSession(null);
          await onRefreshProfiles();
          setNotice(`Signed in with Microsoft Minecraft account: ${profile.username}`);
        }
      } catch (err) {
        if (active) {
          setMsaSession(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }, intervalMs);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [msaSession]);

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

  const handleBrowserMsa = async () => {
    setError(null);
    setNotice(null);
    if (msaStatus && !msaStatus.configured) {
      setError(msaStatus.diagnostic);
      return;
    }
    setBrowserSigningIn(true);
    setNotice("Opened Microsoft sign-in in your browser. Select your email and enter your password to finish.");
    try {
      const profile = await signInMicrosoftBrowser();
      await onRefreshProfiles();
      setNotice(`Signed in with Microsoft Minecraft account: ${profile.username}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNotice(null);
    } finally {
      setBrowserSigningIn(false);
    }
  };

  const handleStartMsa = async () => {
    setError(null);
    setNotice(null);
    if (msaStatus && !msaStatus.configured) {
      setError(msaStatus.diagnostic);
      return;
    }
    try {
      const session = await startMicrosoftLogin();
      setMsaSession(session);
      setNotice("Opened official Microsoft sign-in page. Enter the code below to authenticate.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleManualPoll = async () => {
    if (!msaSession) return;
    setPolling(true);
    setError(null);
    try {
      const profile = await pollMicrosoftLogin(msaSession.deviceCode);
      if (profile) {
        setMsaSession(null);
        await onRefreshProfiles();
        setNotice(`Linked Microsoft Minecraft account: ${profile.username}`);
      } else {
        setNotice("Waiting for Microsoft sign-in confirmation in your browser...");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPolling(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`Copied Microsoft device code: ${code}`);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Account</h1>
          <p className="page-subtitle">
            Authenticate your official Microsoft Minecraft account or switch between remembered offline profiles. Separate from 7xAir website login.
          </p>
        </div>
        <span className="glass-pill">
          <UserCheck size={13} />
          {profileStore.profiles.length} Account{profileStore.profiles.length === 1 ? "" : "s"}
        </span>
      </div>

      {notice && <div className="toast-banner">{notice}</div>}
      {error && (
        <div className="toast-banner" style={{ borderColor: "rgba(239, 68, 68, 0.55)" }}>
          {error}
        </div>
      )}

      {/* Active Account Overview Card */}
      <GlassPanel className="panel-pad">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="instance-icon-badge" style={{ width: 56, height: 56, overflow: "hidden" }}>
              {activeProfile ? (
                <img
                  src={`https://minotar.net/helm/${encodeURIComponent(activeProfile.username)}/64.png`}
                  alt={activeProfile.username}
                  style={{ width: 48, height: 48, borderRadius: 9, imageRendering: "pixelated" }}
                />
              ) : (
                <UserCheck size={24} />
              )}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 18 }}>
                  {activeProfile ? activeProfile.username : "No Active Account"}
                </strong>
                {activeProfile && (
                  <span
                    className={`auth-status-badge ${
                      activeProfile.provider === "microsoft"
                        ? "auth-status-badge--verified"
                        : "auth-status-badge--offline"
                    }`}
                  >
                    {activeProfile.provider === "microsoft" ? (
                      <>
                        <ShieldCheck size={12} /> Premium Microsoft Verified
                      </>
                    ) : (
                      <>
                        <UserCheck size={12} /> Offline Local Profile
                      </>
                    )}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                {activeProfile
                  ? `UUID: ${activeProfile.uuid}`
                  : "Sign in with Microsoft or create a local profile below to launch Minecraft."}
              </div>
            </div>
          </div>

          {activeProfile && (
            <button
              type="button"
              className="glass-button"
              onClick={() => void onDeleteProfile(activeProfile.id)}
            >
              <LogOut size={14} /> Sign Out
            </button>
          )}
        </div>
      </GlassPanel>

      <div className="two-col-grid">
        {/* Official Microsoft Premium Authentication */}
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={16} />
            Microsoft Premium Account (Official OAuth)
          </h2>
          <p className="hero-copy" style={{ marginBottom: 12 }}>
            Opens Microsoft&apos;s official login page, exchanges Xbox Live → XSTS → Minecraft Services tokens, verifies Minecraft Java Edition ownership, and never stores passwords. Separate from 7xAir website accounts.
          </p>
          {msaStatus && !msaStatus.configured && (
            <div
              className="toast-banner"
              style={{ borderColor: "rgba(251, 146, 60, 0.55)", marginBottom: 12, fontSize: 12 }}
            >
              <strong>Microsoft Sign-In Setup Required ({msaStatus.source}):</strong> {msaStatus.diagnostic}
            </div>
          )}
          {!msaSession ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="glass-button glass-button--primary"
                disabled={browserSigningIn}
                onClick={() => void handleBrowserMsa()}
              >
                {browserSigningIn ? (
                  <span className="spinner-ring" style={{ borderTopColor: "#050c14" }} />
                ) : (
                  <KeyRound size={14} />
                )}
                {browserSigningIn ? "Waiting for Browser Sign-In..." : "Sign In / Sign Up with Microsoft"}
              </button>
              <button
                type="button"
                className="glass-button"
                style={{ fontSize: 12 }}
                disabled={browserSigningIn}
                onClick={() => void handleStartMsa()}
              >
                Use Device Code Instead
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="path-mono" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span>
                  Page: {msaSession.verificationUri}
                  <br />
                  Code: <strong style={{ fontSize: 14, color: "var(--accent)" }}>{msaSession.userCode}</strong>
                </span>
                <button
                  type="button"
                  className="glass-button"
                  style={{ padding: "6px 10px" }}
                  onClick={() => void handleCopyCode(msaSession.userCode)}
                >
                  <Copy size={13} /> Copy
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  className="glass-button glass-button--primary"
                  disabled={polling}
                  onClick={() => void handleManualPoll()}
                >
                  {polling ? <span className="spinner-ring" style={{ borderTopColor: "#050c14" }} /> : null}
                  Verify Sign-In Now
                </button>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span className="spinner-ring" /> Auto-checking...
                </span>
              </div>
            </div>
          )}
        </GlassPanel>

        {/* Offline Local Profile */}
        <GlassPanel className="panel-pad">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserCheck size={16} />
            Play Locally (Offline Profile)
          </h2>
          <p className="hero-copy" style={{ marginBottom: 14 }}>
            Create a remembered offline profile with a deterministic Minecraft UUID v3. No account registration required.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              className="glass-input"
              placeholder="Minecraft IGN (3–16 chars)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddOffline();
              }}
            />
            <button
              type="button"
              className="glass-button"
              onClick={() => void handleAddOffline()}
            >
              <Plus size={15} />
              Add
            </button>
          </div>
        </GlassPanel>
      </div>

      {/* Account Switcher */}
      <GlassPanel className="panel-pad">
        <h2 className="section-title">Saved Accounts & Account Switching</h2>
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
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <img
                    src={`https://minotar.net/helm/${encodeURIComponent(profile.username)}/40.png`}
                    alt={profile.username}
                    style={{ width: 36, height: 36, borderRadius: 8, imageRendering: "pixelated" }}
                  />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{profile.username}</strong>
                      <span
                        className={`auth-status-badge ${
                          profile.provider === "microsoft"
                            ? "auth-status-badge--verified"
                            : "auth-status-badge--offline"
                        }`}
                      >
                        {profile.provider === "microsoft" ? "Microsoft Verified" : "Offline Local"}
                      </span>
                      {active && (
                        <span className="glass-pill" style={{ padding: "2px 8px", fontSize: 10.5 }}>
                          <CheckCircle2 size={11} /> Active
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
                      UUID: {profile.uuid}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  {!active && (
                    <button
                      type="button"
                      className="glass-button glass-button--primary"
                      onClick={() => void onSelectProfile(profile.id)}
                    >
                      Switch Account
                    </button>
                  )}
                  <button
                    type="button"
                    className="glass-button"
                    aria-label={`Sign out ${profile.username}`}
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
