"use client";

import React, { useState, useEffect } from "react";
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Sparkles,
  X,
  Bot,
  Zap,
  Save,
  DollarSign,
  AlertCircle,
} from "lucide-react";

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ApiSettingsModal({ isOpen, onClose }: ApiSettingsModalProps) {
  const [openaiKey, setOpenaiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [preferredModel, setPreferredModel] = useState<"claude-3-5-haiku" | "gpt-4o-mini" | "claude-3-5-sonnet">("claude-3-5-haiku");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    openai?: { valid: boolean; message: string };
    claude?: { valid: boolean; message: string };
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load keys from localStorage or server config on mount & on open
  useEffect(() => {
    async function loadConfig() {
      let storedOpenai = "";
      let storedClaude = "";
      let storedModel = "claude-3-5-haiku";

      if (typeof window !== "undefined") {
        storedOpenai = localStorage.getItem("opus_openai_key") || "";
        storedClaude = localStorage.getItem("opus_claude_key") || "";
        storedModel = (localStorage.getItem("opus_preferred_model") as any) || "claude-3-5-haiku";
      }

      // If empty in localStorage, fetch from server .env.local
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
    }

    loadConfig();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("opus_openai_key", openaiKey.trim());
      localStorage.setItem("opus_claude_key", claudeKey.trim());
      localStorage.setItem("opus_preferred_model", preferredModel);
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
    <div className="fixed inset-0 z-50 bg-[#2B1D16]/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full p-6 sm:p-8 rounded-[32px] border border-[#E8DDD2] shadow-2xl animate-in zoom-in-95 duration-200 relative text-[#2B1D16]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full bg-[#FAF6F1] hover:bg-[#EAE1D7] text-[#7A695F] hover:text-[#2B1D16] border border-[#E8DDD2] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-2xl bg-[#FAF6F1] text-[#C87A47] border border-[#E8DDD2]">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[#2B1D16]">AI Engine & API Keys</h3>
            <p className="text-xs text-[#7A695F]">Configure your personal OpenAI & Claude credentials</p>
          </div>
        </div>

        {/* Quota & Cost Shield Pill */}
        <div className="my-4 p-3.5 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2] flex items-start gap-2.5 text-xs text-[#2B1D16]">
          <ShieldCheck className="w-5 h-5 text-[#3A7D44] flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-[#3A7D44]">Daily Cap Friendly ($3.00/day):</span>
            <p className="text-[11px] text-[#7A695F] mt-0.5 leading-relaxed">
              Whisper speech-to-text is ~$0.18 per 30-min video. Claude 3.5 Haiku / GPT-4o-mini is less than 1 cent ($0.008) per video. Your $3.00 cap allows 10–15 full videos daily!
            </p>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* OpenAI API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[#2B1D16] flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-[#3A7D44]" />
                <span>OpenAI API Key (Whisper + GPT)</span>
              </label>
              <span className="text-[10px] text-[#A09085] font-mono">sk-...</span>
            </div>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-proj-..."
              className="w-full bg-[#FAF6F1] text-[#2B1D16] text-xs sm:text-sm px-3.5 py-2.5 rounded-2xl border border-[#E8DDD2] placeholder:text-[#A09085] focus:outline-none focus:border-[#C87A47] font-mono transition-all"
            />
          </div>

          {/* Anthropic Claude API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[#2B1D16] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#C87A47]" />
                <span>Anthropic Claude API Key</span>
              </label>
              <span className="text-[10px] text-[#A09085] font-mono">sk-ant-...</span>
            </div>
            <input
              type="password"
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full bg-[#FAF6F1] text-[#2B1D16] text-xs sm:text-sm px-3.5 py-2.5 rounded-2xl border border-[#E8DDD2] placeholder:text-[#A09085] focus:outline-none focus:border-[#C87A47] font-mono transition-all"
            />
          </div>

          {/* Model Preference */}
          <div>
            <label className="text-xs font-bold text-[#2B1D16] block mb-1.5">
              Preferred Model for Virality Curation
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setPreferredModel("claude-3-5-haiku")}
                className={`py-2 px-2 text-[11px] font-bold rounded-2xl border text-center transition-all ${
                  preferredModel === "claude-3-5-haiku"
                    ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                    : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F] hover:text-[#2B1D16]"
                }`}
              >
                Claude 3.5 Haiku
                <div className={`text-[9px] font-normal ${preferredModel === "claude-3-5-haiku" ? "text-[#DDD3C7]" : "text-[#A09085]"}`}>Fast & cheap</div>
              </button>
              <button
                type="button"
                onClick={() => setPreferredModel("gpt-4o-mini")}
                className={`py-2 px-2 text-[11px] font-bold rounded-2xl border text-center transition-all ${
                  preferredModel === "gpt-4o-mini"
                    ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                    : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F] hover:text-[#2B1D16]"
                }`}
              >
                GPT-4o-mini
                <div className={`text-[9px] font-normal ${preferredModel === "gpt-4o-mini" ? "text-[#DDD3C7]" : "text-[#A09085]"}`}>&lt; 1¢ / clip</div>
              </button>
              <button
                type="button"
                onClick={() => setPreferredModel("claude-3-5-sonnet")}
                className={`py-2 px-2 text-[11px] font-bold rounded-2xl border text-center transition-all ${
                  preferredModel === "claude-3-5-sonnet"
                    ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                    : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F] hover:text-[#2B1D16]"
                }`}
              >
                Claude 3.5 Sonnet
                <div className={`text-[9px] font-normal ${preferredModel === "claude-3-5-sonnet" ? "text-[#DDD3C7]" : "text-[#A09085]"}`}>Top depth</div>
              </button>
            </div>
          </div>
        </div>

        {/* Verification Status Feedback */}
        {testResult && (
          <div className="mt-4 space-y-1.5">
            {testResult.openai && (
              <div
                className={`p-2.5 rounded-2xl text-xs flex items-center gap-2 ${
                  testResult.openai.valid
                    ? "bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534]"
                    : "bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B]"
                }`}
              >
                {testResult.openai.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-[#DC2626] flex-shrink-0" />
                )}
                <span>{testResult.openai.message}</span>
              </div>
            )}
            {testResult.claude && (
              <div
                className={`p-2.5 rounded-2xl text-xs flex items-center gap-2 ${
                  testResult.claude.valid
                    ? "bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534]"
                    : "bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B]"
                }`}
              >
                {testResult.claude.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-[#DC2626] flex-shrink-0" />
                )}
                <span>{testResult.claude.message}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={handleTestKeys}
            disabled={isTesting || (!openaiKey && !claudeKey)}
            className="flex-1 py-3 rounded-full border border-[#E8DDD2] bg-[#FAF6F1] hover:bg-[#EAE1D7] text-[#2B1D16] text-xs font-bold transition-all disabled:opacity-50"
          >
            {isTesting ? "Verifying..." : "Test Connection"}
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex-1 bg-[#C87A47] hover:bg-[#B66D3D] py-3 rounded-full font-bold text-xs text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-[#C87A47]/20 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saveSuccess ? "Saved!" : "Save Keys Locally"}</span>
          </button>
        </div>

        <p className="text-[10px] text-[#A09085] text-center mt-3.5">
          Keys are stored locally in your browser and your local `.env.local` file. They are never sent anywhere else.
        </p>
      </div>
    </div>
  );
}
