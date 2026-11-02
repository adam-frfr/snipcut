import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { getJobRecord, saveJobRecord, jobQueue } from "@/lib/jobQueue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
  }

  const job = getJobRecord(id);
  if (!job) {
    return NextResponse.json({ error: `Job not found: ${id}` }, { status: 404 });
  }

  // Retrying a job that is still running would enqueue it twice: two
  // workers interleaving record saves, duplicate renders, double API spend.
  const ACTIVE = ["uploaded", "transcribing", "analyzing", "rendering"];
  if (ACTIVE.includes(job.status)) {
    return NextResponse.json(
      { error: `Job is still ${job.status} — wait for it to finish or fail before retrying.` },
      { status: 409 }
    );
  }

  // The 24h cleanup may have removed the source video; fail clearly here
  // instead of deep inside the pipeline.
  const srcPath = (job.options as any)?.filePath as string | undefined;
  if (srcPath) {
    const fs = await import("fs");
    if (!fs.existsSync(srcPath)) {
      return NextResponse.json(
        { error: "The source video for this job has expired (files are cleaned up after 24h). Upload it again to re-run." },
        { status: 410 }
      );
    }
  }

  console.log(`[Stage: Jobs API] Retrying job ${id} (previous status: ${job.status}, error: ${job.error})`);

  // Clear previous error
  job.error = null;

  // Resume from the failed stage based on what's already saved in job.output
  if (!job.output.transcription) {
    job.status = "uploaded";
    job.progress = 5;
    job.stageMessage = "Retrying: Transcribing audio with Whisper AI...";
  } else if (!job.output.curatedClips || job.output.curatedClips.length === 0) {
    job.status = "transcribing";
    job.progress = 30;
    job.stageMessage = "Retrying: Analyzing virality and snapping clips...";
  } else {
    job.status = "analyzing";
    job.progress = 60;
    job.stageMessage = "Retrying: Reframing and rendering remaining clips...";
  }

  saveJobRecord(job);
  jobQueue.enqueue(id);

  return NextResponse.json({
    success: true,
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    stageMessage: job.stageMessage,
  });
}
