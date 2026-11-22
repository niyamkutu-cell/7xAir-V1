# 7xAir Architecture

## Repository Layout

```text
7xair/
├── ARCHITECTURE.md
├── BUILD_STATUS.md
├── SETUP.md                  # Beginner-friendly Supabase + GitHub + Vercel setup guide
├── TODO.md
├── package.json
├── .github/workflows/
│   ├── ci.yml                # Automated checks, tests, TS build, and Rust cargo check
│   └── release.yml           # Fabric internal bundle build + Windows NSIS EXE GitHub Release
├── supabase/
│   └── schema.sql            # PostgreSQL tables, RLS policies, and screenshots Storage bucket
├── scripts/
│   ├── check.mjs             # Structural & parity check suite (30 checks)
│   ├── dev-server.mjs        # Local launcher HTTP dev preview server (port 1420)
│   └── website-server.mjs    # Local Vercel-compatible website + API server (port 3000)
├── tests/
│   └── stage1.test.mjs ... stage9.test.mjs
├── apps/
│   ├── launcher/             # Windows 10/11 Tauri 2 + React + TypeScript launcher
│   └── website/              # Vercel website + Serverless APIs (Supabase-backed + local fallback)
│       ├── .env.example
│       ├── package.json
│       ├── vercel.json
│       ├── api/
│       │   ├── _store.mjs        # Local fallback store, scrypt auth & release merge
│       │   ├── _supabase.mjs     # Zero-dependency Supabase Auth, PostgREST & Storage client
│       │   ├── auth.mjs          # Signup/login/logout/session + admin role resolution
│       │   ├── screenshots.mjs   # Showcase gallery + Supabase Storage PNG/JPG/WebP uploads
│       │   ├── releases.mjs      # Windows EXE download metadata, version info & changelog
│       │   └── admin.mjs         # RBAC admin API (moderation, release publish, user roles)
│       └── public/
│           ├── index.html, styles.css, app.js
│           └── releases/latest.json
└── client/
    └── 7xair-fabric/         # Separate Fabric client mod (multi-target 1.21.11 & 26.2)
```
