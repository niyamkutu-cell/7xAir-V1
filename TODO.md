# 7xAir TODO

## Completed Stages (1–10)
- [x] Stage 1: Tauri 2 + Rust + React + TypeScript launcher, glass design system, 7 themes, Windows layout
- [x] Stage 2: Mojang Piston Meta v2 (`1.21.11` & `26.2`), Java scanner, Fabric Meta loader, offline UUID v3 + Microsoft Device Code auth, instances, game launch
- [x] Stage 3: Independent instance cloning, Modrinth v2 mods & resource packs, dependencies, SHA-512 verification, updates, compatibility audit
- [x] Stage 4: Separate multi-target Fabric mod (`1.21.11` & `26.2`), translucent floating glass GUI & 7 themes, 8 HUD modules, HUD editor, keybinds, config persistence
- [x] Stage 5: Automatic per-instance client installation, global ON/OFF resync, tri-state overrides, update, repair, removal, SHA-256 & ZIP header integrity
- [x] Stage 6: Performance Center (`sysinfo` telemetry, optimization presets, diagnostics, compatibility scoring, crash-log analysis)
- [x] Stage 7: Automatic updates, background download, SHA-256 + PE/ZIP verification, atomic staging, safe install, and rollback
- [x] Stage 8: Vercel website, signup/login, showcase gallery, screenshot uploads, changelog, version info, and Windows EXE downloads
- [x] Stage 9: Supabase schema/RLS/Storage, Vercel env template, GitHub Actions CI & Windows Release workflows, admin RBAC, beginner `SETUP.md`
- [x] Stage 10: Complete source ZIP (`dist/7xAir-source-v0.1.0.zip`) + SHA-256, `scripts/build-release.ps1`, `README.md`, `RELEASE_NOTES.md`, full verification suite

## Host / CI Execution Remaining (Requires Windows 10/11 + Rust + JDK 21 + Internet)
- [ ] Run `scripts/build-release.ps1` on Windows 10/11 (or push tag `v0.1.0` to GitHub Actions `.github/workflows/release.yml`) to compile the native Windows NSIS `.exe` installer and `1.21.11` / `26.2` Fabric client JARs (subject to official Mojang/Fabric release availability).
