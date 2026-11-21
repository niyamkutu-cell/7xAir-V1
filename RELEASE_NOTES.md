# 7xAir v0.1.0 Release Notes

**Release Date:** 2026-11-20  
**Target Platform:** Windows 10/11 (64-bit, NSIS `.exe` installer)  
**Minecraft Compatibility Targets:** `1.21.11` and `26.2` (subject to official Mojang & Fabric availability)

## Highlights
1. **Frameless Translucent Glass Launcher (Tauri 2 + Rust + React + TypeScript):** Seven synchronized color themes (`Obsidian Cyan`, `Aurora Emerald`, `Crimson Ember`, `Violet Nebula`, `Solar Amber`, `Frost Silver`, `Sakura Rose`), customizable glass opacity, and `%APPDATA%\7xAir` isolation.
2. **Real Minecraft Runtime & Launching:** Mojang Piston Meta v2 caching, OS-filtered library downloads, Java 21+ detection, Fabric Meta loader selection, offline RFC 4122 UUID v3 profiles, optional Microsoft Device Code OAuth, independent instance cloning, and live launch console.
3. **Modrinth Mods & Resource Packs:** Faceted search, recursive required dependency resolution, SHA-512 hash verification, `.disabled` toggling, one-click updates, and compatibility auditing.
4. **Managed Translucent Glass Fabric Client:** Multi-target Fabric Loom project (`1.21.11` & `26.2`) featuring genuinely translucent floating glass panels (capped at 72% opacity), 8 HUD modules, drag-and-drop HUD Editor, keybinds, and automatic per-instance lifecycle management (global ON/OFF, tri-state overrides, update, repair, removal, SHA-256 integrity).
5. **Performance Center & Auto-Updater:** Live `sysinfo` telemetry, G1GC presets, 0–100 diagnostics, 6-signature crash-log analyzer, and verified background updates with atomic rollback.
6. **Vercel Website & Supabase Backend:** Account signup/login, showcase gallery + Supabase Storage uploads, admin RBAC moderation, changelog, and Windows `.exe` downloads (no separate client `.jar` download).
