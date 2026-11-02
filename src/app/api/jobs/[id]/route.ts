import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { getJobRecord } from "@/lib/jobQueue";

export async function GET(
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

  return NextResponse.json({
    success: true,
    job,
  });
}
