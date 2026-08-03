# 🚀 AI Prompt Vault — Implementation & Architecture Roadmap

This document serves as the master specification, architectural roadmap, and execution changelog (`Logging`) for **AI Prompt Vault**.

---

## 📌 1. Logging & Changelog (ประวัติการแก้ไขและปรับปรุง)

### 🗓️ Version 1.3.0 — PWA Desktop Installation & Implementation Documentation (Latest)
- **Progressive Web App (PWA) Support**:
  - Created `/public/manifest.json` defining standalone app display, dark theme branding (`#8b5cf6`), and SVG app icons.
  - Built `/public/sw.js` Service Worker with offline caching, asset pre-fetching, and background sync support.
  - Linked manifest and SW registration inside `index.html`.
  - Created `src/components/PWAInstall.tsx` widget supporting native `beforeinstallprompt` installation for Chrome, Edge, Brave, Arc, iOS Safari, and Android Chrome.
  - Integrated PWA Desktop App install widget directly into the sidebar footer.
- **Documentation**:
  - Created `implement.md` containing architectural recommendations and complete execution history log.

### 🗓️ Version 1.2.0 — Realtime Auto-Sync Engine & UI Fallback
- **Auto-Sync System Integration**:
  - Added background auto-synchronization engine (`triggerAutoSync`) in `src/lib/sync.ts`.
  - Auto-Sync triggers automatically on tab/window focus, data CRUD operations, timer intervals (configurable 15s - 300s), and Supabase Realtime WebSocket changes.
  - Created UI toggle and interval setting inside `ImportExport.tsx`.
  - Added live `Auto-Sync Active` / `Auto-Syncing...` status widget in sidebar.
- **Loading Screen Timeout & Direct Client Fallback**:
  - Added `AbortController` timeout (4s limit) to `refreshData()` in `App.tsx` to prevent perpetual loading screen ("Retrieving Vault Database Models...") when Express API endpoints fail or delay.
  - Auto-switches gracefully to Direct Supabase Client + LocalStorage cache if Express server endpoints are unavailable.

### 🗓️ Version 1.1.0 — Offline-First Vault Engine & Two-Way Sync
- **Client-Side Local Storage Vault**:
  - Implemented local caching engine for prompts, versions, and markdown documents.
  - Added offline pending queue (`vault_offline_sync_queue`) tracking offline CRUD operations (`insert`, `update`, `delete`).
- **Two-Way Synchronization Hub**:
  - Conflict resolution strategies (`latest_wins`, `local_wins`, `cloud_wins`).
  - Raw JSON and ZIP export/import utilities for database migration.

### 🗓️ Version 1.0.0 — Initial Full-Stack Architecture
- Express + TypeScript backend server (`server.ts`).
- Supabase Cloud PostgreSQL database schemas (`prompts`, `markdown_docs`).
- Prompt version control, tag manager, and Markdown documentation vault.

---

## 💡 2. Recommended Future Enhancements (หัวข้อแนะนำเพิ่มเติมสำหรับอนาคต)

Below is a curated roadmap of high-impact features recommended for future development iterations:

### 🛡️ 1. End-to-End Encryption (E2EE) for Sensitive Prompts
- **Concept**: Client-side AES-GCM 256-bit encryption using a master passphrase before saving items to Supabase Cloud or LocalStorage.
- **Value**: Ensures high-level privacy for enterprise system prompts, proprietary API keys, or confidential AI guidelines.

### 📁 2. Multi-Vault Workspace & Granular Permissions
- **Concept**: Allow users to create distinct vaults (e.g. `Personal`, `Engineering Team`, `Marketing Workflows`) with individual member role permissions (`Owner`, `Editor`, `Viewer`).
- **Value**: Enables seamless team collaboration without cluttering personal workspaces.

### 🧠 3. Local WebGPU / WASM Vector Search & RAG
- **Concept**: Integrate local embedding generation using Transformers.js / WebGPU in the browser.
- **Value**: Perform instant vector semantic search across thousands of stored prompts and Markdown files 100% offline without sending content to external embedding APIs.

### 🔑 4. Google Workspace & OAuth Single Sign-On (SSO)
- **Concept**: Enable login via Google OAuth, GitHub, or Microsoft 365.
- **Value**: Simplifies enterprise onboarding and enables syncing directly with Google Drive / OneDrive backups.

### ⚡ 5. Real-time Multi-User Collaborative Editor
- **Concept**: Utilize Yjs or Automerge CRDTs over WebSockets for live Google Docs-style co-editing on Markdown documentation and prompt guidelines.
- **Value**: Eliminates sync conflicts when multiple team members edit the same prompt simultaneously.

### 🔄 6. Automated Scheduled Cloud Backups
- **Concept**: Background cron job triggering automatic daily / weekly ZIP/JSON snapshots sent to user email or cloud storage buckets.
- **Value**: Ironclad protection against accidental deletions or database corruption.

---

## 🛠️ Tech Stack Overview

| Category | Technology |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite |
| **PWA & Offline** | Service Worker (`sw.js`), Web App Manifest, LocalStorage Queue |
| **Backend & API** | Node.js, Express, tsx, esbuild |
| **Database & Sync** | Supabase Cloud PostgreSQL, Supabase Realtime Channels, Client Sync Bridge |
| **Deployment** | Vercel SPA Compatibility + Cloud Run Container Support |

---
*Maintained by AI Prompt Vault Architecture Team*
