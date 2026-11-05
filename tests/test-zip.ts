/**
 * "Download all" ZIP: the streaming writer must produce an archive a
 * standard unzipper accepts — names (incl. non-ASCII), sizes, CRCs and
 * byte-exact contents — checked with Python's zipfile (independent reader).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { zipStream, crc32 } from "../src/lib/zipStream";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!ok) failures++;
};

(async () => {
  check(crc32(Buffer.from("123456789")) === 0xcbf43926, "CRC-32 matches the standard check value");
  const dir = path.join(process.cwd(), "data", "test_zip");
  fs.mkdirSync(dir, { recursive: true });
  const a = path.join(dir, "a.bin");
  const b = path.join(dir, "b.bin");
  fs.writeFileSync(a, crypto.randomBytes(3 * 1024 * 1024 + 17)); // multi-chunk read
  fs.writeFileSync(b, Buffer.alloc(0)); // empty file
  const out = path.join(dir, "out.zip");
  const stream = zipStream([
    { name: "01 - Hard Work Myth.mp4", path: a },
    { name: "02 - Café é.mp4", path: b },
    { name: "captions.txt", data: Buffer.from("#1 hello\ncaption #tag\n", "utf8") },
  ]);
  const chunks: Buffer[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  fs.writeFileSync(out, Buffer.concat(chunks));

  const py = `
import zipfile, sys, hashlib
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
print("BAD" if bad else "OK")
for i in z.infolist():
    print(i.filename, i.file_size, hashlib.sha256(z.read(i)).hexdigest())
`;
  const r = spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", py, out], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  const lines = (r.stdout || "").trim().split(/\r?\n/);
  check(lines[0] === "OK", `Python's zipfile opens it and every CRC checks out (${lines[0] || r.stderr.slice(0, 120)})`);
  const sha = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  check(lines.some((l) => l === `01 - Hard Work Myth.mp4 ${fs.statSync(a).size} ${sha(a)}`), "3 MB file stored byte-exact");
  check(lines.some((l) => l.startsWith("02 - Café é.mp4 0 ")), "empty file and a non-ASCII name survive");
  check(lines.some((l) => l.startsWith("captions.txt 22 ")), "in-memory captions file included");
  fs.rmSync(dir, { recursive: true, force: true });

  if (failures) {
    console.error(`\nZIP FAILURES: ${failures}`);
    process.exit(1);
  }
  console.log("\nALL ZIP TESTS PASSED!");
})();
