import {
  Boxes,
  Gauge,
  Home,
  Layers,
  Music2,
  Palette,
  Settings,
  Sparkles,
  UserCircle2,
} from "lucide-react";
import type { ReactNode } from "react";
import { NAV_ITEMS } from "../lib/defaults";
import type { NavRoute, PlayerProfile } from "../types/launcher";
import { GlassPanel } from "./GlassPanel";

interface SidebarProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  activeThemeName: string;
  autoInstallClient: boolean;
  activeProfile: PlayerProfile | null;
  instanceCount: number;
}

const ROUTE_ICONS: Record<NavRoute, ReactNode> = {
  home: <Home size={16} />,
  instances: <Boxes size={16} />,
  modrinth: <Sparkles size={16} />,
  music: <Music2 size={16} />,
  performance: <Gauge size={16} />,
  client: <Layers size={16} />,
  profiles: <UserCircle2 size={16} />,
  themes: <Palette size={16} />,
  settings: <Settings size={16} />,
};

const NAV_GROUPS: readonly { label: string; routes: NavRoute[] }[] = [
  { label: "Play", routes: ["home", "instances", "modrinth", "music"] },
  { label: "Client & System", routes: ["performance", "client", "themes"] },
  { label: "Account & App", routes: ["profiles", "settings"] },
];

export function Sidebar({
  activeRoute,
  onNavigate,
  activeThemeName,
  autoInstallClient,
  activeProfile,
  instanceCount,
}: SidebarProps) {
  const monogram = (activeProfile?.username ?? "7X").slice(0, 2).toUpperCase();

  return (
    <GlassPanel className="sidebar">
      <nav className="nav-list" aria-label="Launcher navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="nav-section-label">{group.label}</div>
            {group.routes.map((routeId) => {
              const item = NAV_ITEMS.find((n) => n.id === routeId);
              if (!item) return null;
              const isActive = item.id === activeRoute;
              const countBadge =
                item.id === "instances" && instanceCount > 0
                  ? String(instanceCount)
                  : item.badge;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item ${isActive ? "nav-item--active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <span className="nav-item-left">
                    {ROUTE_ICONS[item.id]}
                    <span>{item.label}</span>
                  </span>
                  {countBadge && <span className="nav-badge">{countBadge}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <GlassPanel subtle className="sidebar-footer">
        <button
          type="button"
          className="profile-mini-btn"
          onClick={() => onNavigate("profiles")}
        >
          <span className="avatar-monogram">{monogram}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 12.5,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {activeProfile ? activeProfile.username : "Select Account"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>
              {activeProfile ? `${activeProfile.provider} account` : "No active account"}
            </div>
          </span>
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span className={`status-dot ${autoInstallClient ? "" : "status-dot--off"}`} />
            <strong style={{ color: "var(--text-primary)", fontSize: 11.5 }}>
              7xAir Client {autoInstallClient ? "ON" : "OFF"}
            </strong>
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{activeThemeName}</span>
        </div>
      </GlassPanel>
    </GlassPanel>
  );
}
