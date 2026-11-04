# Production image for Snipcut (VPS via docker compose, or Render / any Docker host)
FROM node:20-bookworm-slim

# Media + tracking dependencies:
# - ffmpeg (with libass for burned-in captions)
# - python3 + OpenCV + NumPy for the face tracker (scripts/track_reframe.py)
# - fonts: captions ask for "Arial"; Liberation Sans is its metric-compatible
#   stand-in (fontconfig maps the name). Without a real font, libass falls
#   back to whatever it finds and captions look different from local dev.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-numpy \
    python3-opencv \
    fonts-liberation \
    fonts-dejavu-core \
    fontconfig \
    curl \
    ca-certificates \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp: YouTube changes often and old yt-dlp builds stop working, so the
# latest release is installed at build time. Rebuild the image (or run
# `docker compose exec snipcut yt-dlp -U`) when YouTube downloads start failing.
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && chown node:node /usr/local/bin/yt-dlp

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    PYTHON_BIN=python3

RUN npm run build

# Storage that must survive restarts/redeploys is mounted here as volumes
# (see docker-compose.yml). Owned by the unprivileged "node" user.
RUN mkdir -p data public/uploads public/downloads public/rendered_clips \
    && chown -R node:node data public/uploads public/downloads public/rendered_clips .next

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/config > /dev/null || exit 1

# Run next directly (not via npm) so SIGTERM reaches the server on shutdown.
CMD ["node_modules/.bin/next", "start"]
