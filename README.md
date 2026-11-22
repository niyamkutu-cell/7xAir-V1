# 7xAir (7X Launcher)

**7xAir** is a Windows 10/11 Minecraft launcher, custom translucent floating glass Fabric client, and Vercel-hosted web platform targeting **Minecraft 1.21.11** and **26.2** (with full Fabric loader support).

## What's New in the Redesign
- **Anime-Inspired Nature UI & 7 Persistent Themes:** Full-screen layered mountain/river/forest/sky scenes with frosted glassmorphism and smooth transitions across **Azure Mountains**, **Sakura Valley**, **Emerald Wilderness**, **Frozen Peaks**, **Sunset Horizon**, **Midnight Forest**, and **Dreamy Anime**.
- **Redesigned Home Screen & Interactive 3D Character:** Real-time 3D Minecraft character (`skinview3d` / Three.js) fetching skins by IGN (classic, slim, auto-detect, and offline default fallback), large **PLAY** hero button, and top-right **SIGN IN** (official Microsoft Device Code OAuth) + **PLAY LOCALLY** (remembered offline local profiles).
- **Performance-Tuned Animations & Complete Settings:** GPU-friendly `16px` glass blur, lazy-mounted SVG backgrounds, subtle floating particles, environmental lighting, and automatic pausing of animations and the 3D WebGL render loop whenever the window is minimized or Minecraft is running. All theme, animation, particle, rotation, startup, performance, and update preferences persist in `%APPDATA%\7xAir\settings.json`.
- **New `7X` Blue Branding:** Transparent blue-gradient `7X` PNG logo, multi-resolution Windows `.ico` (16–256px for taskbar, window, and NSIS installer), and website favicons.
- **GitHub Releases Auto-Updater:** Checks GitHub Releases (`stable` and `beta` pre-release channels, with manifest fallback), compares SemVer, streams real download progress, verifies SHA-256 + Windows PE headers before staging and installing, creates a config rollback snapshot without touching user instances, and runs a silent NSIS install + automatic relaunch.
- **Crash & Stability Fixes:** Automatic LWJGL/native `.dll` extraction into `<instance>\natives\`, `-Dorg.lwjgl.librarypath`, asset index downloads, classpath deduplication, and hidden Windows child processes (`CREATE_NO_WINDOW`) to eliminate PowerShell flashes.

## Quick Commands
- Run structural checks: `npm run check`
- Run full test suite: `npm test`
- Regenerate `7X` PNG/ICO/favicon icons: `python3 scripts/generate-7x-branding.py`
- Package complete source ZIP: `npm run package:zip`
- Build Windows NSIS `.exe` + Fabric client bundles on Windows 10/11: `powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1`

## Updating GitHub & Using the Auto-Updater
1. **Push updates to GitHub (`main`):**
   ```bash
   git add -A
   git commit -m "Update 7X Launcher UI redesign, 3D skin viewer, and branding"
   git push origin main
   ```
   Pushing automatically runs `.github/workflows/ci.yml` (`npm run check`, `npm test`, `tsc --noEmit`, `vite build`, and `cargo check` on Windows).
2. **Test the Auto-Updater Safely (Separate Pre-Release):**
   - Go to **GitHub → Actions → `7xAir Updater Safe Test Pre-Release` → Run workflow**.
   - Enter a test version higher than your installed version (e.g., `0.1.1-test.1`).
   - In 7xAir **Settings → Release Channel**, switch to **Beta** and click **Check for Updates** to test real GitHub release detection, download progress, SHA-256 verification, install + restart, and rollback without affecting `Stable` users.
3. **Publish a Production Windows `.exe` Release (Auto-Update for All Users):**
   - Bump `"version"` in `apps/launcher/package.json`, `apps/launcher/src-tauri/tauri.conf.json`, and `apps/launcher/src-tauri/Cargo.toml` (e.g., `0.1.1`).
   - Push a matching SemVer tag:
     ```bash
     git tag v0.1.1
     git push origin v0.1.1
     ```
   - `.github/workflows/release.yml` automatically builds the Windows NSIS `.exe` installer, generates `SHA256SUMS.txt`, and publishes a GitHub Release that installed launchers detect on the **Stable** channel.

## Documentation
- `SETUP.md` — Supabase + GitHub Actions + Vercel setup guide
- `ARCHITECTURE.md` — Repository structure, IPC boundary, and module layout
- `BUILD_STATUS.md` — Verification results and environment notes
- `RELEASE_NOTES.md` — Release notes
- `TODO.md` — Project roadmap tracker
