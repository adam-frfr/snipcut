const { spawnSync } = require("child_process");
const path = require("path");

console.log("==================================================");
console.log("       OPUSCLIP CLONE TEST SUITE RUNNER           ");
console.log("==================================================\n");

const tests = [
  {
    name: "Word Snapping & Drop Criteria (Item 3)",
    cmd: "npx",
    args: ["tsx", path.join(__dirname, "test-wordsnapping.ts")],
  },
  {
    name: "Subtitle Time Base & Shifting (Item 1)",
    cmd: "npx",
    args: ["tsx", path.join(__dirname, "test-subtitles.ts")],
  },
  {
    name: "AI Track & Reframe Frame Seeking (Item 2)",
    cmd: process.platform === "win32" ? "python" : "python3",
    args: [path.join(__dirname, "test-track-reframe.py")],
  },
  {
    name: "Probe & Copy-Remux Fallback (Item 3)",
    cmd: "npx",
    args: ["tsx", path.join(__dirname, "test-remux-fallback.ts")],
  },
  {
    name: "Phone Formats: VFR & HDR SDR Tone-Mapping (Item 7)",
    cmd: "npx",
    args: ["tsx", path.join(__dirname, "test-phone-formats.ts")],
  },
  {
    name: "Groq Audio Limit & Overlap Chunking (Item 3)",
    cmd: "npx",
    args: ["tsx", path.join(__dirname, "test-groq-chunking.ts")],
  },
];

let failed = 0;
const overallStart = Date.now();

for (const test of tests) {
  console.log(`\n>>> [TEST SUITE] Running: ${test.name}`);
  const t0 = Date.now();
  const res = spawnSync(test.cmd, test.args, {
    stdio: "inherit",
    shell: true,
  });

  const durationMs = Date.now() - t0;
  if (res.status === 0) {
    console.log(`>>> [PASSED] ${test.name} (${durationMs}ms)`);
  } else {
    console.error(`>>> [FAILED] ${test.name} with exit code ${res.status}`);
    failed++;
  }
}

const totalTime = Date.now() - overallStart;
console.log("\n==================================================");
if (failed === 0) {
  console.log(`SUCCESS: All ${tests.length} test suites passed in ${totalTime}ms!`);
  console.log("==================================================");
  process.exit(0);
} else {
  console.error(`FAILURE: ${failed} of ${tests.length} test suites failed.`);
  console.log("==================================================");
  process.exit(1);
}
