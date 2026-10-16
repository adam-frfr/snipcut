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
  const [preferredModel, setPreferredModel] = useState<"claude-3-5-haiku" | "gpt-4o-mini" | "claude-3-5-sonnet">("claude-3-5-haiku");
  const [youtubeCookies, setYoutubeCookies] = useState("");
  const [youtubeProxy, setYoutubeProxy] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    openai?: { valid: boolean; message: string };
    claude?: { valid: boolean; message: string };
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      let storedOpenai = "";
      let storedClaude = "";
      let storedModel = "claude-3-5-haiku";
      let storedCookies = "";
      let storedProxy = "";

      if (typeof window !== "undefined") {
        storedOpenai = localStorage.getItem("opus_openai_key") || "";
        storedClaude = localStorage.getItem("opus_claude_key") || "";
        storedModel = (localStorage.getItem("opus_preferred_model") as any) || "claude-3-5-haiku";
        storedCookies = localStorage.getItem("opus_youtube_cookies") || "";
        storedProxy = localStorage.getItem("opus_youtube_proxy") || "";
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
      setPreferredModel(storedModel as any);
      setYoutubeCookies(storedCookies);
      setYoutubeProxy(storedProxy);
    }

    loadConfig();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("opus_openai_key", openaiKey.trim());
      localStorage.setItem("opus_claude_key", claudeKey.trim());
      localStorage.setItem("opus_preferred_model", preferredModel);
      localStorage.setItem("opus_youtube_cookies", youtubeCookies.trim());
      localStorage.setItem("opus_youtube_proxy", youtubeProxy.trim());
    }
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 1200);
  };

  const handleTestKeys = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openaiKey: openaiKey.trim(),
          claudeKey: claudeKey.trim(),
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full p-6 sm:p-7 rounded-2xl border-2 border-black shadow-[6px_6px_0px_#000000] animate-in zoom-in-95 duration-150 relative text-black">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 border-2 border-black bg-white hover:bg-[#FFC700] text-black transition-colors cursor-pointer"
        >
          <X className="w-4 h-4 stroke-[3]" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-[#FFC700] border-2 border-black flex items-center justify-center font-black text-black shadow-[2px_2px_0px_#000000]">
            <Key className="w-4 h-4 stroke-[3]" />
          </div>
          <div>
            <h3 className="text-base font-black uppercase text-black">API Key Configuration</h3>
            <p className="text-[11px] font-bold text-[#555555]">Local OpenAI and Anthropic credentials</p>
          </div>
        </div>

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
              className="w-full neo-input py-2.5 px-3 text-xs font-mono"
            />
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
              className="w-full neo-input py-2.5 px-3 text-xs font-mono"
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
                  <div>{m.label}</div>
                  <div className={`text-[9px] ${preferredModel === m.id ? "text-[#FFC700]" : "text-[#777777]"}`}>
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
              Bypasses YouTube bot-checks on Render cloud servers. Paste cookies from extension "Get cookies.txt LOCALLY".
            </p>
            <textarea
              rows={2}
              value={youtubeCookies}
              onChange={(e) => setYoutubeCookies(e.target.value)}
              placeholder="Paste cookies.txt contents here..."
              className="w-full neo-input py-2 px-3 text-[10px] font-mono leading-tight resize-none"
            />
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
              className="w-full neo-input py-2 px-3 text-xs font-mono"
            />
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
          </div>
        )}

        {/* Buttons */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={handleTestKeys}
            disabled={isTesting || (!openaiKey && !claudeKey)}
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
