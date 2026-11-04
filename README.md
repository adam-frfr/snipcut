# Snipcut

Snipcut is a focused AI-assisted video repurposing studio. Turn long-form recordings into concise vertical clips with searchable scene discovery, active-speaker reframing, dynamic captions, and a hands-on editor for final polish.

## What it does

- **Discover clips** from transcripts using natural-language prompts and virality signals.
- **Reframe automatically** for 9:16 while keeping active speakers in view.
- **Style captions** with karaoke highlighting, readable safe zones, and multiple visual presets.
- **Edit precisely** with timeline trimming, playback controls, color adjustments, rotation, mirroring, and positioning.
- **Organize a workflow** with local clip history, brand settings, and scheduled publishing drafts.

## Quick start

### Requirements

- Node.js 20+
- FFmpeg
- Python 3 with OpenCV and NumPy for subject tracking
- API keys for the transcription and analysis providers you choose

### Install and run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

API keys can be supplied through `.env.local` or entered from the **Keys** control in the app header. Never commit `.env.local` or real credentials.

## Deploy on a VPS

The `Dockerfile` bundles everything the pipeline needs: FFmpeg with libass, Python + OpenCV for face tracking, caption fonts, and yt-dlp. `docker-compose.yml` runs it with persistent volumes, so jobs, clips and saved cookies survive restarts and redeploys.

**Server size.** Rendering is CPU-bound: plan on at least 2 vCPU and 4 GB RAM, plus disk for source videos (files are cleaned up after 24 hours). With 1 vCPU, renders still work but take several minutes per clip.

1. Install Docker on the VPS ([docs.docker.com/engine/install](https://docs.docker.com/engine/install/)), then clone the repo.
2. Configure it:
   ```bash
   cp .env.example .env
   nano .env   # set APP_ACCESS_TOKEN and at least GROQ_API_KEY or OPENAI_API_KEY
   ```
3. Start it:
   ```bash
   docker compose up -d --build
   ```
   The app listens on `127.0.0.1:3000`, which is only reachable from the server itself.
4. Put HTTPS in front. With [Caddy](https://caddyserver.com/docs/install), copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, set your domain, and run `sudo systemctl reload caddy`. If you use nginx instead, use `deploy/nginx.conf`. Either way, keep its upload size limit: nginx's default 1 MB limit rejects every upload chunk.

**Updating:** `git pull && docker compose up -d --build`.
**Logs:** `docker compose logs -f snipcut`.
**YouTube downloads failing** ("confirm you're not a bot"): YouTube often blocks datacenter IPs. Save cookies from a signed-in browser under **Settings → YouTube Cookies**, and update yt-dlp with `docker compose exec snipcut yt-dlp -U` (or rebuild the image).

## Checks

```bash
npm run lint
npm test
```

## Project layout

```text
src/app/          Pages and application routes
src/components/   Shared UI components
src/lib/          Video, captions, AI, and queue services
tests/            Integration and media-processing checks
scripts/          Subject-tracking assets and utilities
```

Snipcut is designed as a local-first workspace: generated clip metadata, saved settings, and scheduling drafts stay in the browser unless you explicitly send content to a configured service.
