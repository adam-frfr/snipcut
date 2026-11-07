/**
 * Direct video link import: address / URL safety checks, then real
 * downloads from a local test server (redirects, web pages, errors, size
 * cap), and a downloaded video converted like an upload.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { isPrivateAddress, normalizeDirectUrl, downloadDirectVideo } from "../src/lib/directImport";
import { normalizeUploadedVideo } from "../src/lib/mediaPrep";
import { getFfmpegBinary } from "../src/lib/videoService";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!ok) failures++;
};
const fails = async (p: Promise<unknown>, re: RegExp) => {
  try {
    await p;
    return false;
  } catch (e: any) {
    return re.test(String(e?.message || e));
  }
};

(async () => {
  // ---- Address and URL checks ------------------------------------------
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    check(isPrivateAddress(ip), `private address refused: ${ip}`);
  }
  for (const ip of ["8.8.8.8", "201.18.197.83", "2606:4700::1111"]) check(!isPrivateAddress(ip), `public address allowed: ${ip}`);
  check(normalizeDirectUrl("https://cdn.example.com/v/clip.mp4") !== null, "plain https file link accepted");
  check(normalizeDirectUrl("https://www.youtube.com/watch?v=abc") === null && normalizeDirectUrl("https://youtu.be/abc") === null, "YouTube links are not direct links");
  check(normalizeDirectUrl("ftp://example.com/a.mp4") === null && normalizeDirectUrl("file:///etc/passwd") === null, "only http(s)");
  check(normalizeDirectUrl("https://user:pw@example.com/a.mp4") === null, "links with passwords refused");
  check(normalizeDirectUrl("http://example.com:22/a.mp4") === null, "odd ports refused");
  check(normalizeDirectUrl("http://127.0.0.1/a.mp4") === null && normalizeDirectUrl("http://[::1]/a.mp4") === null && normalizeDirectUrl("http://169.254.169.254/latest") === null, "private IP links refused");

  // ---- Local test server ---------------------------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "direct-import-"));
  const video = path.join(tmp, "src.mp4");
  execFileSync(getFfmpegBinary(), [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=2",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", video,
  ]);
  const videoBytes = fs.readFileSync(video);
  const server = http.createServer((req, res) => {
    if (req.url === "/clip.mp4") {
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": videoBytes.length });
      res.end(videoBytes);
    } else if (req.url === "/dl?id=7") {
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="My Stream Part 1.mp4"' });
      res.end(videoBytes);
    } else if (req.url === "/go") {
      res.writeHead(302, { Location: "/clip.mp4" });
      res.end();
    } else if (req.url === "/page") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html>download page</html>");
    } else if (req.url === "/big") {
      res.writeHead(200, { "Content-Type": "video/mp4" });
      res.end(Buffer.alloc(3 * 1024 * 1024, 1)); // no Content-Length: cap enforced while streaming
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;
  const uploads = path.join(tmp, "uploads");

  // Without the test override, the server can't be pointed at localhost.
  check(await fails(downloadDirectVideo(`${base}/clip.mp4`, uploads), /direct video link|private/i), "localhost link refused (port and address)");
  check(normalizeDirectUrl("http://localhost:8080/clip.mp4") !== null, "a hostname passes the URL check ...");
  process.env.DIRECT_IMPORT_ALLOW_PRIVATE = "0";
  // ... but its address is checked when connecting (DNS rebinding safe).
  const viaName = await fails(downloadDirectVideo(`http://localhost:8080/clip.mp4`, uploads), /private or local/i);
  check(viaName, "... and refused at connect time when it resolves to a private address");

  // Allow localhost for the rest (the test server lives there). Port must be standard,
  // so tunnel through a hop: point a :8080 server at the random port.
  process.env.DIRECT_IMPORT_ALLOW_PRIVATE = "1";
  const proxyServer = http.createServer((req, res) => {
    const up = http.request({ host: "127.0.0.1", port, path: req.url, method: req.method }, (r) => {
      res.writeHead(r.statusCode || 500, r.headers);
      r.pipe(res);
    });
    up.on("error", () => { res.writeHead(502); res.end(); });
    up.end();
  });
  let p8080 = true;
  await new Promise<void>((r) => proxyServer.listen(8080, "127.0.0.1", () => r())).catch(() => { p8080 = false; });
  proxyServer.on("error", () => { p8080 = false; });
  if (!p8080) {
    console.log("(port 8080 busy; skipping download checks)");
  } else {
    const b = "http://127.0.0.1:8080";
    const ok = await downloadDirectVideo(`${b}/clip.mp4`, uploads);
    check(fs.existsSync(ok.rawPath) && ok.bytes === videoBytes.length && /raw-\d+-clip\.mp4$/.test(ok.rawPath), "video downloaded into uploads as raw-<name>.mp4");
    const named = await downloadDirectVideo(`${b}/dl?id=7`, uploads);
    check(/raw-\d+-My_Stream_Part_1\.mp4$/.test(named.rawPath), "file name taken from Content-Disposition");
    const red = await downloadDirectVideo(`${b}/go`, uploads);
    check(red.bytes === videoBytes.length, "redirects followed");
    check(await fails(downloadDirectVideo(`${b}/page`, uploads), /web page/), "web pages refused with a clear message");
    check(await fails(downloadDirectVideo(`${b}/missing.mp4`, uploads), /HTTP 404/), "HTTP errors reported");
    process.env.DIRECT_IMPORT_MAX_MB = "1";
    check(await fails(downloadDirectVideo(`${b}/big`, uploads), /too big/), "size cap enforced while streaming");
    check(!fs.readdirSync(uploads).some((f) => f.includes("big")), "partial file removed after the cap");
    delete process.env.DIRECT_IMPORT_MAX_MB;
    const prepared = await normalizeUploadedVideo(ok.rawPath, ok.baseName);
    check(fs.existsSync(prepared.filePath) && prepared.fileId.startsWith("uploads/") && !fs.existsSync(ok.rawPath), "downloaded file converted like an upload");
  }
  delete process.env.DIRECT_IMPORT_ALLOW_PRIVATE;
  server.close();
  proxyServer.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures) {
    console.log(`\n${failures} DIRECT IMPORT CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log("\nALL DIRECT IMPORT CHECKS PASSED");
})();
