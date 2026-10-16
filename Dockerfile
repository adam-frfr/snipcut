# Production Dockerfile for OpusClip Clone on Render / Cloud
FROM node:20-bookworm-slim

# Install system dependencies: FFmpeg with libass, Python 3, OpenCV, numpy, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-numpy \
    python3-opencv \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp Linux binary globally
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install npm dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy full application code
COPY . .

# Ensure storage directories exist
RUN mkdir -p public/downloads public/rendered_clips public/extracted_audio

# Production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Build Next.js application
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
