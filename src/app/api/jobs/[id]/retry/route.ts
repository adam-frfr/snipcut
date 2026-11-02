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
