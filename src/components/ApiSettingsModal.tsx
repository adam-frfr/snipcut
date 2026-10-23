"use client";

import React, { useState, useEffect } from "react";
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  X,
  Bot,
  Save,
} from "lucide-react";

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ApiSettingsModal({ isOpen, onClose }: ApiSettingsModalProps) {
  const [openaiKey, setOpenaiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [pexelsKey, setPexelsKey] = useState("");
  const [preferredModel, setPreferredModel] = useState<"claude-3-5-haiku" | "gpt-4o-mini" | "claude-3-5-sonnet">("claude-3-5-haiku");
  const [youtubeCookies, setYoutubeCookies] = useState("");
  const [youtubeProxy, setYoutubeProxy] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    openai?: { valid: boolean; message: string };
    claude?: { valid: boolean; message: string };
    groq?: { valid: boolean; message: string };
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [tokenChecking, setTokenChecking] = useState(false);
  const [appAccessToken, setAppAccessToken] = useState("");
  const [cookieTest, setCookieTest] = useState<{ state: "idle" | "busy" | "ok" | "fail"; msg: string }>({ state: "idle", msg: "" });

  useEffect(() => {
    async function loadConfig() {
      let storedOpenai = "";
      let storedClaude = "";
      let storedGroq = "";
      let storedModel = "claude-3-5-haiku";
      let storedCookies = "";
      let storedProxy = "";
      let storedToken = "";

      if (typeof window !== "undefined") {
        storedOpenai = localStorage.getItem("opus_openai_key") || "";
        storedClaude = localStorage.getItem("opus_claude_key") || "";
        storedGroq = localStorage.getItem("opus_groq_key") || "";
        setPexelsKey(localStorage.getItem("opus_pexels_key") || "");
        storedModel = (localStorage.getItem("opus_preferred_model") as any) || "claude-3-5-haiku";
        storedCookies = localStorage.getItem("opus_youtube_cookies") || "";
        storedProxy = localStorage.getItem("opus_youtube_proxy") || "";
        storedToken = localStorage.getItem("app_access_token") || "";
      }

      if (!storedOpenai || !storedClaude) {
        try {
          const res = await fetch("/api/config");
          const data = await res.json();
          if (data.apiKey) {
            storedOpenai = storedOpenai || data.apiKey;
            storedClaude = storedClaude || data.apiKey;
            if (typeof window !== "undefined") {
              localStorage.setItem("opus_openai_key", storedOpenai);
              localStorage.setItem("opus_claude_key", storedClaude);
            }
          }
        } catch (e) {}
      }

      setOpenaiKey(storedOpenai);
      setClaudeKey(storedClaude);
      setGroqKey(storedGroq);
      setPreferredModel(storedModel as any);
      setYoutubeCookies(storedCookies);
      setYoutubeProxy(storedProxy);
      setAppAccessToken(storedToken);
    }

    loadConfig();
  }, [isOpen]);

  if (!isOpen) return null;

  const authHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (appAccessToken.trim()) headers["x-app-access-token"] = appAccessToken.trim();
    return headers;
  };

  const handleSave = async () => {
    // A new app access token is verified with the server BEFORE anything
    // is stored — this modal used to save whatever was typed on faith,
    // so a wrong passcode looked accepted and then every API call 401'd.
    const candidate = appAccessToken.trim();
    if (candidate) {
      setTokenChecking(true);
      let valid: boolean | null = null;
      try {
        const res = await fetch("/api/auth-check", {
          headers: { Authorization: `Bearer ${candidate}` },
        });
        valid = res.ok ? true : res.status === 401 || res.status === 403 ? false : null;
      } catch {
        valid = null;
      }
      setTokenChecking(false);
      if (valid === false) {
        setTokenError("That app access token isn't right — the server rejected it, so nothing was saved.");
        return;
      }
      if (valid === null) {
        setTokenError("Couldn't reach the server to verify the access token — try again in a moment.");
        return;
      }
      setTokenError("");
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("opus_openai_key", openaiKey.trim());
      localStorage.setItem("opus_claude_key", claudeKey.trim());
      localStorage.setItem("opus_groq_key", groqKey.trim());
      localStorage.setItem("opus_pexels_key", pexelsKey.trim());
      localStorage.setItem("opus_preferred_model", preferredModel);
      localStorage.setItem("opus_youtube_cookies", youtubeCookies.trim());
      localStorage.setItem("opus_youtube_proxy", youtubeProxy.trim());
      localStorage.setItem("app_access_token", appAccessToken.trim());
      document.cookie = `app_access_token=${encodeURIComponent(appAccessToken.trim())}; path=/; max-age=31536000; SameSite=Lax`;
    }
    // Also persist cookies in the server-side jar so downloads work from any
    // browser/device without re-pasting. Best-effort: local save already done.
    if (youtubeCookies.trim().length > 10) {
      try {
        await fetch("/api/cookies", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ cookies: youtubeCookies.trim() }),
        });
      } catch {}
    }
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 1200);
  };

  const handleTestCookies = async () => {
    setCookieTest({ state: "busy", msg: "Saving to server and running a real YouTube check..." });
    try {
      if (youtubeCookies.trim().length > 10) {
        const saveRes = await fetch("/api/cookies", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ cookies: youtubeCookies.trim() }),
        });
        const saveData = await saveRes.json().catch(() => ({}));
        if (!saveRes.ok) {
          setCookieTest({ state: "fail", msg: saveData.error || "Those cookies could not be parsed." });
          return;
        }
      }
      const testRes = await fetch("/api/cookies", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action: "test" }),
      });
      const testData = await testRes.json().catch(() => ({}));
      if (testData.valid) {
        setCookieTest({ state: "ok", msg: `Cookies work — YouTube accepted them (probe video: "${testData.title}").` });
      } else {
        setCookieTest({ state: "fail", msg: testData.error || "YouTube rejected these cookies." });
      }
    } catch {
      setCookieTest({ state: "fail", msg: "Could not reach the server to test cookies." });
    }
  };

  const handleTestKeys = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (appAccessToken.trim()) {
        headers["x-app-access-token"] = appAccessToken.trim();
      }
      const res = await fetch("/api/test-keys", {
        method: "POST",
        headers,
        body: JSON.stringify({
          openaiKey: openaiKey.trim(),
          claudeKey: claudeKey.trim(),
          groqKey: groqKey.trim(),
        }),
      });
      const data = await res.json();
      if (data.results) {
        setTestResult(data.results);
      }
    } catch (err) {
      alert("Failed to connect to verification endpoint.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white max-w-lg w-full rounded-2xl border-2 border-black shadow-[6px_6px_0px_#000000] animate-in zoom-in-95 duration-150 relative text-black flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 border-2 border-black bg-white hover:bg-[#FFC700] text-black transition-colors cursor-pointer"
        >
          <X className="w-4 h-4 stroke-[3]" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 px-5 pt-5 sm:px-7 sm:pt-6 pb-4 shrink-0">
          <div className="w-9 h-9 bg-[#FFC700] border-2 border-black flex items-center justify-center font-black text-black shadow-[2px_2px_0px_#000000]">
            <Key className="w-4 h-4 stroke-[3]" />
          </div>
          <div>
            <h3 className="text-base font-black uppercase text-black">API Key Configuration</h3>
            <p className="text-[11px] font-bold text-[#555555]">Groq, OpenAI and Anthropic credentials</p>
          </div>
        </div>

        <div className="overflow-y-auto min-h-0 px-5 sm:px-7 pb-5">
        {/* Cost Notice */}
        <div className="mb-4 p-3 bg-[#F8F7F4] border-2 border-black text-xs">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-black stroke-[2.5]" />
            <span className="font-black uppercase text-black">Direct API Usage</span>
          </div>
          <p className="text-[11px] font-bold text-[#555555] leading-relaxed">
            Whisper transcription is ~18 cents per 30 minutes. Claude 3.5 Haiku is under 1 cent per clip.
          </p>
        </div>

        {/* Form Fields */}
        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-black uppercase text-black mb-1">
              OpenAI API Key (Whisper Audio)
            </label>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-proj-..."
              className="w-full neo-input py-2.5 px-3 text-base sm:text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-black mb-1">
              Groq API Key (Fast Whisper + Free Curation)
            </label>
            <input
              type="password"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full neo-input py-2.5 px-3 text-base sm:text-sm font-mono"
            />
            <p className="text-[10px] font-bold text-[#555555] mt-1">
              Recommended: one free Groq key alone runs the whole pipeline — transcription via Whisper and curation via Llama.
            </p>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-black mb-1">
              Pexels API Key (Stock B-Roll — Optional)
            </label>
            <input
              type="password"
              value={pexelsKey}
              onChange={(e) => setPexelsKey(e.target.value)}
              placeholder="Free key from pexels.com/api"
              className="w-full neo-input py-2.5 px-3 text-base sm:text-sm font-mono"
            />
            <p className="text-[10px] font-bold text-[#555555] mt-1">
              Enables stock VIDEO cutaways for AI B-Roll. Without it, B-Roll still works with free photos via Openverse.
            </p>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-black mb-1">
              Anthropic Claude API Key (Curation)
            </label>
            <input
              type="password"
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full neo-input py-2.5 px-3 text-base sm:text-sm font-mono"
            />
          </div>

          {/* Model Selector */}
          <div>
            <label className="block text-xs font-black uppercase text-black mb-1">
              Model Preference
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "claude-3-5-haiku", label: "Claude 3.5 Haiku", note: "Fast" },
                { id: "gpt-4o-mini", label: "GPT-4o Mini", note: "Budget" },
                { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", note: "Deep" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPreferredModel(m.id as any)}
                  className={`py-2 px-1 border-2 border-black text-[11px] font-black uppercase transition-all cursor-pointer ${
                    preferredModel === m.id
                      ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]"
                      : "bg-[#F8F7F4] text-black hover:bg-white"
                  }`}
                >
                  <div className="leading-tight">{m.label}</div>
                  <div className={`text-[10px] mt-0.5 ${preferredModel === m.id ? "text-[#FFC700]" : "text-[#777777]"}`}>
                    {m.note}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* YouTube Cloud Bot Bypass Section */}
          <div className="pt-2 border-t-2 border-black/20">
            <label className="block text-xs font-black uppercase text-black mb-1">
              YouTube Cloud Bypass (Optional Cookies)
            </label>
            <p className="text-[10px] text-[#555555] font-bold mb-1.5 leading-snug">
              YouTube bot-checks this server's IP, so downloads need cookies from a signed-in youtube.com session.
              Export with "Get cookies.txt LOCALLY" or Cookie-Editor (JSON) — or paste the raw Cookie header. Any format works;
              cookies are converted automatically and stored on the server, so you only paste once.
            </p>
            <textarea
              rows={2}
              value={youtubeCookies}
              onChange={(e) => setYoutubeCookies(e.target.value)}
              placeholder="Paste cookies here (cookies.txt / JSON / Cookie header)..."
              className="w-full neo-input py-2 px-3 text-base sm:text-sm font-mono leading-tight resize-none"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button
                type="button"
                onClick={handleTestCookies}
                disabled={cookieTest.state === "busy"}
                className="neo-btn px-2.5 py-1 text-[10px] font-black uppercase disabled:opacity-50"
              >
                {cookieTest.state === "busy" ? "Testing..." : "Save & Test Cookies"}
              </button>
              {cookieTest.state !== "idle" && (
                <span className={`text-[10px] font-bold leading-snug ${cookieTest.state === "ok" ? "text-green-700" : cookieTest.state === "fail" ? "text-red-700" : "text-[#555555]"}`}>
                  {cookieTest.msg}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-black mb-1">
              YouTube Proxy (Optional)
            </label>
            <input
              type="text"
              value={youtubeProxy}
              onChange={(e) => setYoutubeProxy(e.target.value)}
              placeholder="http://user:pass@proxy.example.com:8080"
              className="w-full neo-input py-2 px-3 text-base sm:text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-black mb-1">
              App Access Token (Shared Secret)
            </label>
            <input
              type="password"
              value={appAccessToken}
              onChange={(e) => setAppAccessToken(e.target.value)}
              placeholder="APP_ACCESS_TOKEN if configured on server"
              className="w-full neo-input py-2 px-3 text-base sm:text-sm font-mono"
            />
            {tokenError && (
              <p className="text-xs font-bold text-red-600 mt-1.5">{tokenError}</p>
            )}
          </div>
        </div>

        {/* Results feedback */}
        {testResult && (
          <div className="mt-3.5 space-y-1.5">
            {testResult.openai && (
              <div className={`p-2 border-2 border-black text-xs font-bold flex items-center gap-2 ${
                testResult.openai.valid ? "bg-[#DCFCE7] text-[#14532D]" : "bg-[#FEE2E2] text-[#7F1D1D]"
              }`}>
                {testResult.openai.valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                <span>{testResult.openai.message}</span>
              </div>
            )}
            {testResult.claude && (
              <div className={`p-2 border-2 border-black text-xs font-bold flex items-center gap-2 ${
                testResult.claude.valid ? "bg-[#DCFCE7] text-[#14532D]" : "bg-[#FEE2E2] text-[#7F1D1D]"
              }`}>
                {testResult.claude.valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                <span>{testResult.claude.message}</span>
              </div>
            )}
            {testResult.groq && (
              <div className={`p-2 border-2 border-black text-xs font-bold flex items-center gap-2 ${
                testResult.groq.valid ? "bg-[#DCFCE7] text-[#14532D]" : "bg-[#FEE2E2] text-[#7F1D1D]"
              }`}>
                {testResult.groq.valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                <span>{testResult.groq.message}</span>
              </div>
            )}
          </div>
        )}

        </div>

        {/* Buttons — sticky footer, always reachable */}
        <div className="shrink-0 flex gap-2 px-5 sm:px-7 py-4 border-t-2 border-black/15 bg-white">
          <button
            type="button"
            onClick={handleTestKeys}
            disabled={isTesting || (!openaiKey && !claudeKey && !groqKey)}
            className="flex-1 neo-btn-white py-2.5 rounded-lg text-xs font-black uppercase transition-all disabled:opacity-50 cursor-pointer"
          >
            {isTesting ? "Testing..." : "Test Keys"}
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex-1 neo-btn-yellow py-2.5 rounded-lg text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 stroke-[3]" />
            <span>{saveSuccess ? "Saved!" : "Save Keys"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
