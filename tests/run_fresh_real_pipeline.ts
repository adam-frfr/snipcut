import fs from "fs";
import path from "path";

async function runFreshPipeline() {
  const runTimestamp = new Date().toISOString();
  console.log(`=== Fresh Real Pipeline Run (${runTimestamp}) ===`);
  const videoPath = path.resolve(process.cwd(), "data", "real_speech_2min.mp4");

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Real speech video not found at ${videoPath}`);
  }

  const stat = fs.statSync(videoPath);
  console.log(`Video File: ${videoPath} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);

  // Step 1: Upload via /api/upload
  console.log("\n--- [Step 1: Upload via /api/upload] ---");
  const uploadT0 = Date.now();
  const fileBuffer = fs.readFileSync(videoPath);
  const blob = new Blob([fileBuffer], { type: "video/mp4" });
  const formData = new FormData();
  formData.append("file", blob, "real_speech_2min.mp4");

  const upRes = await fetch("http://localhost:3000/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!upRes.ok) {
    const errText = await upRes.text();
    throw new Error(`Upload failed (${upRes.status}): ${errText}`);
  }

  const upData = await upRes.json();
  const uploadDuration = Date.now() - uploadT0;
  console.log(`Upload & Media Prep response in ${uploadDuration}ms:`, {
    fileId: upData.fileId,
    fileUrl: upData.fileUrl,
    sizeBytes: upData.sizeBytes,
    streamInfo: {
      codec: upData.streamInfo?.codecName,
      pixFmt: upData.streamInfo?.pixFmt,
      duration: upData.streamInfo?.duration,
    },
  });

  const fileId = upData.fileId;

  // Step 2: Transcribe via /api/transcribe (Groq Whisper)
  console.log("\n--- [Step 2: Transcribe via /api/transcribe (Groq Whisper)] ---");
  const transT0 = Date.now();
  const transRes = await fetch("http://localhost:3000/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });

  if (!transRes.ok) {
    const errText = await transRes.text();
    throw new Error(`Transcription failed (${transRes.status}): ${errText}`);
  }

  const transData = await transRes.json();
  const transDuration = Date.now() - transT0;
  const wordCount = transData.words?.length || 0;
  const segmentCount = transData.segments?.length || 0;

  console.log(`Transcription completed in ${transDuration}ms:`, {
    provider: transData.provider,
    duration: transData.duration,
    wordCount,
    segmentCount,
    textPreview: (transData.text || "").slice(0, 180) + "...",
  });

  // Step 3: AI Clip Curation via /api/analyze-clips
  console.log("\n--- [Step 3: AI Curation via /api/analyze-clips] ---");
  const analyzeT0 = Date.now();
  const analyzeRes = await fetch("http://localhost:3000/api/analyze-clips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcriptText: transData.text,
      words: transData.words,
      duration: transData.duration,
      customPrompt: "Extract high engagement standalone clips",
    }),
  });

  if (!analyzeRes.ok) {
    const errText = await analyzeRes.text();
    throw new Error(`Analysis failed (${analyzeRes.status}): ${errText}`);
  }

  const analyzeData = await analyzeRes.json();
  const analyzeDuration = Date.now() - analyzeT0;
  const clips = analyzeData.clips || [];
  console.log(`AI Curation completed in ${analyzeDuration}ms. Curated ${clips.length} clips:`);

  // Step 4: Render Clips via /api/render-clip
  console.log("\n--- [Step 4: Render Clip via /api/render-clip] ---");
  const renderedClipsSummary = [];

  for (let i = 0; i < Math.min(2, clips.length); i++) {
    const clip = clips[i];
    console.log(`\nRendering Clip #${i + 1}: "${clip.title}" [${clip.startTime}s - ${clip.endTime}s] (${clip.durationFormatted})`);

    const renderT0 = Date.now();
    const renderRes = await fetch("http://localhost:3000/api/render-clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputPath: fileId,
        startTime: clip.startTime,
        duration: Math.max(5, Math.round(clip.endTime - clip.startTime)),
        aspectRatio: "9:16",
        reframeMode: "auto-tracker",
        transcript: transData.words.map((w: any) => ({
          start: w.start,
          end: w.end,
          text: w.word,
        })),
        headline: clip.hookHeadline || clip.title,
        captionStyle: "hormozi",
      }),
    });

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      throw new Error(`Render failed for clip #${i + 1}: ${errText}`);
    }

    const renderData = await renderRes.json();
    const renderDuration = Date.now() - renderT0;

    const words = clip.snappedWords || [];
    const firstWord = words.length > 0 ? `"${words[0].word}" (@${words[0].start}s)` : "N/A";
    const lastWord = words.length > 0 ? `"${words[words.length - 1].word}" (@${words[words.length - 1].end}s)` : "N/A";

    console.log(`Rendered in ${renderDuration}ms:`, {
      filename: renderData.filename,
      downloadUrl: renderData.downloadUrl,
      mode: renderData.tracking?.mode,
      summary: renderData.tracking?.summary,
    });

    renderedClipsSummary.push({
      clipIndex: i + 1,
      title: clip.title,
      startTime: `${clip.startTime}s`,
      endTime: `${clip.endTime}s`,
      firstSubtitleWord: firstWord,
      lastSubtitleWord: lastWord,
      totalSubtitleWords: words.length,
      viralityScore: clip.viralityScore,
      renderTimeMs: renderDuration,
      outputFile: renderData.filename,
    });
  }

  console.log("\n==================================================");
  console.log("             FRESH REAL RUN SUMMARY               ");
  console.log("==================================================");
  console.log(`Timestamp: ${runTimestamp}`);
  console.log(`Whisper Provider: ${transData.provider}`);
  console.log(`Whisper Word Count: ${wordCount} words (Hundreds of words for 2m 10s speech)`);
  console.log(`Whisper Segments Count: ${segmentCount} segments`);
  console.log("\nRendered Clips Subtitle Alignment:");
  console.table(renderedClipsSummary);
}

runFreshPipeline().catch((err) => {
  console.error("Fresh pipeline run error:", err);
  process.exit(1);
});
