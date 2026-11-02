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

## Production

The included `Dockerfile` installs the media-processing dependencies, builds the Next.js app, and starts the production server on port `3000`.

```bash
docker build -t snipcut .
docker run --env-file .env.local -p 3000:3000 snipcut
```

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
