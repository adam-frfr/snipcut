/**
 * Bring-your-own AI keys. Users can add their own Claude / OpenAI key for
 * curation; the server's Groq key is the base. A user key that fails
 * (wrong, out of credit, retired model) must fall back to the next
 * provider instead of failing the job, and a working user key must be
 * used first. Providers are simulated (no network, no real keys).
 */
import { analyzeTranscriptForViralClips } from "../src/lib/aiService";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!ok) failures++;
};

// 60s transcript: one sentence every 3s.
const words: { word: string; start: number; end: number }[] = [];
const segments: { start: number; end: number; text: string }[] = [];
for (let s = 0; s < 20; s++) {
  const t0 = s * 3;
  const sentence = ["Here", "is", "a", "really", "useful", "idea", `number${s}.`];
  sentence.forEach((w, i) => words.push({ word: w, start: t0 + i * 0.35, end: t0 + i * 0.35 + 0.3 }));
  segments.push({ start: t0, end: t0 + sentence.length * 0.35, text: sentence.join(" ") });
}
const transcriptText = segments.map((s) => s.text).join(" ");
const clipJson = JSON.stringify({
  clips: [
    {
      title: "A useful idea",
      hookHeadline: "Here is a really useful idea",
      startTime: 6,
      endTime: 36,
      durationFormatted: "0:30",
      viralityScore: 90,
      hookStrength: 90,
      engagementScore: 90,
      trendMatch: 90,
      viralityReason: "test",
      keyPhrases: ["useful idea"],
      suggestedEmojis: [],
      description: "test #test",
    },
  ],
});

type Mode = { anthropic: number; openai: number; groq: number };
let calls: string[] = [];
const realFetch = globalThis.fetch;
function mock(mode: Mode) {
  calls = [];
  (globalThis as any).fetch = async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url || String(input);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("api.anthropic.com")) {
      calls.push("anthropic");
      if (mode.anthropic !== 200) return json(mode.anthropic, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
      return json(200, {
        id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5",
        content: [{ type: "text", text: clipJson }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    }
    const isGroq = url.includes("api.groq.com");
    if (isGroq || url.includes("api.openai.com")) {
      const who = isGroq ? "groq" : "openai";
      const model = init?.body ? JSON.parse(init.body).model : "";
      calls.push(`${who}:${model}`);
      const status = isGroq ? mode.groq : mode.openai;
      if (status !== 200) return json(status, { error: { message: "nope", type: "invalid_request_error" } });
      return json(200, {
        id: "c1", object: "chat.completion", created: 1, model,
        choices: [{ index: 0, message: { role: "assistant", content: clipJson }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }
    return json(404, {});
  };
}

(async () => {
  process.env.GROQ_API_KEY = "gsk_base_test";
  delete process.env.GROQ_API_KEY2;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.HACKCLUB_API_KEY;
  const base = { transcriptText, words, segments, customPrompt: "" } as any;

  // 1. User's Claude key works: used first, base Groq untouched.
  mock({ anthropic: 200, openai: 200, groq: 200 });
  let clips = await analyzeTranscriptForViralClips({ ...base, model: "claude-3-5-haiku", claudeKey: "sk-ant-user" });
  check(clips.length > 0 && calls[0] === "anthropic" && !calls.some((c) => c.startsWith("groq")), `working user Claude key is used, base not touched (${calls.join(", ")})`);

  // 2. User's Claude key is bad: falls back to the base Groq key.
  mock({ anthropic: 401, openai: 200, groq: 200 });
  clips = await analyzeTranscriptForViralClips({ ...base, model: "claude-3-5-haiku", claudeKey: "sk-ant-wrong" });
  check(clips.length > 0 && calls.includes("anthropic") && calls.some((c) => c.startsWith("groq")), `bad user Claude key falls back to base Groq (${calls.join(", ")})`);

  // 3. User picks OpenAI and has both keys: OpenAI first.
  mock({ anthropic: 200, openai: 200, groq: 200 });
  clips = await analyzeTranscriptForViralClips({ ...base, model: "gpt-4o-mini", claudeKey: "sk-ant-user", openaiKey: "sk-user" });
  check(clips.length > 0 && (calls[0] || "").startsWith("openai:"), `preferred OpenAI key goes first (${calls.join(", ")})`);

  // 4. OpenAI model retired (404): next OpenAI model on the same key.
  let n = 0;
  mock({ anthropic: 200, openai: 200, groq: 200 });
  const inner = globalThis.fetch;
  (globalThis as any).fetch = async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (url.includes("api.openai.com") && n++ === 0) {
      calls.push(`openai:${JSON.parse(init.body).model}`);
      return new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 404, headers: { "content-type": "application/json" } });
    }
    return inner(input, init);
  };
  clips = await analyzeTranscriptForViralClips({ ...base, model: "gpt-4o-mini", openaiKey: "sk-user" });
  const oa = calls.filter((c) => c.startsWith("openai:"));
  check(clips.length > 0 && oa.length >= 2 && oa[0] !== oa[1], `retired OpenAI model falls to the next model (${oa.join(", ")})`);

  // 5. No user keys: base Groq does the work.
  mock({ anthropic: 200, openai: 200, groq: 200 });
  clips = await analyzeTranscriptForViralClips({ ...base, model: "claude-3-5-haiku" });
  check(clips.length > 0 && calls.every((c) => c.startsWith("groq")), `no user keys -> base Groq only (${calls.join(", ")})`);

  (globalThis as any).fetch = realFetch;

  // 6. Users' keys never stay on the server's disk once their job ends.
  const { saveJobRecord } = await import("../src/lib/jobQueue");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const id = `job_keytest_${process.pid}`;
  const job: any = {
    id, status: "rendering", progress: 50, stageMessage: "", createdAt: Date.now(), updatedAt: Date.now(),
    options: { aspectRatio: "9:16", claudeKey: "sk-ant-secret", openaiKey: "sk-secret", groqKey: "gsk_secret", pexelsKey: "p", pixabayKey: "x" },
    output: {}, stageTimestamps: {},
  };
  const file = path.join(process.cwd(), "data", "jobs", `${id}.json`);
  saveJobRecord(job);
  check(fs.readFileSync(file, "utf8").includes("sk-ant-secret"), "keys are kept while the job runs");
  job.status = "done";
  saveJobRecord(job);
  const saved = fs.readFileSync(file, "utf8");
  check(!/sk-ant-secret|sk-secret|gsk_secret/.test(saved) && !/"pexelsKey"|"pixabayKey"/.test(saved), "all user keys are erased once the job is done");
  fs.unlinkSync(file);

  if (failures) {
    console.error(`\nBYO KEY FAILURES: ${failures}`);
    process.exit(1);
  }
  console.log("\nALL BRING-YOUR-OWN-KEY TESTS PASSED!");
})();
