import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { getJobRecord } from "@/lib/jobQueue";
import { zipStream, ZipEntry } from "@/lib/zipStream";

/**
 * GET /api/jobs/<id>/zip — every finished clip of a project in one ZIP
 * (editor versions where the user re-rendered one), plus captions.txt with
 * each clip's title and ready-to-post caption.
 */
const fileFromUrl = (u: unknown) => {
  const m = typeof u === "string" ? /rendered_clips\/([A-Za-z0-9._-]+\.mp4)$/.exec(u) : null;
  return m ? m[1] : null;
};
const safeName = (s: string) =>
  s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "clip";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  const { id } = await params;
  const job = getJobRecord(id);
  if (!job?.output?.curatedClips?.length) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const dir = path.join(process.cwd(), "public", "rendered_clips");
  const rendered = job.output.renderedClips || [];
  const edited = job.output.editedClips || {};
  const entries: ZipEntry[] = [];
  const captions: string[] = [];
  job.output.curatedClips.forEach((c: any, i) => {
    const e: any = edited[String(i)];
    const r = rendered.find((x) => Math.abs(x.startTime - c.startTime) < 0.1);
    const file = fileFromUrl(e?.renderedVideoUrl) || r?.filename || null;
    if (!file || !fs.existsSync(path.join(dir, file))) return;
    const title = String(e?.title || c.title || `Clip ${i + 1}`);
    entries.push({ name: `${String(i + 1).padStart(2, "0")} - ${safeName(title)}.mp4`, path: path.join(dir, file) });
    captions.push(`#${i + 1} ${title}\n${String(e?.description || c.description || "").trim()}\n`);
  });
  if (entries.length === 0) {
    return NextResponse.json({ error: "No rendered clips in this project yet" }, { status: 404 });
  }
  entries.push({ name: "captions.txt", data: Buffer.from(captions.join("\n"), "utf8") });

  const zipName = `${safeName(String(job.output.curatedClips[0]?.title || "snipcut-clips"))} - clips.zip`;
  return new NextResponse(zipStream(entries), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="clips.zip"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      "Cache-Control": "no-store",
    },
  });
}
