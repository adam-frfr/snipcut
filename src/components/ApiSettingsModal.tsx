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

  // Load keys from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedOpenai = localStorage.getItem("opus_openai_key") || "";
      const storedClaude = localStorage.getItem("opus_claude_key") || "";
      const storedModel = (localStorage.getItem("opus_preferred_model") as any) || "claude-3-5-haiku";
      setOpenaiKey(storedOpenai);
      setClaudeKey(storedClaude);
      setPreferredModel(storedModel);
    }
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel-glow max-w-lg w-full p-6 sm:p-7 rounded-3xl border border-purple-500/40 shadow-2xl animate-in zoom-in-95 duration-200 relative text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white">AI Engine & API Keys</h3>
            <p className="text-[11px] text-zinc-400">Configure your personal OpenAI & Claude credentials</p>
          </div>
        </div>

        {/* Quota & Cost Shield Pill */}
        <div className="my-4 p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-zinc-300">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-emerald-300">Daily Cap Friendly ($3.00/day):</span>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              Whisper speech-to-text is ~$0.18 per 30-min video. Claude 3.5 Haiku / GPT-4o-mini is less than 1 cent ($0.008) per video. Your $3.00 cap allows 10–15 full videos daily!
            </p>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* OpenAI API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
                <span>OpenAI API Key (Whisper + GPT)</span>
              </label>
              <span className="text-[10px] text-zinc-500 font-mono">sk-...</span>
            </div>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-proj-..."
              className="w-full glass-input text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl placeholder:text-zinc-600 focus:ring-1 focus:ring-purple-500 font-mono"
            />
          </div>

          {/* Anthropic Claude API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Anthropic Claude API Key</span>
              </label>
              <span className="text-[10px] text-zinc-500 font-mono">sk-ant-...</span>
            </div>
            <input
              type="password"
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full glass-input text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl placeholder:text-zinc-600 focus:ring-1 focus:ring-purple-500 font-mono"
            />
          </div>

          {/* Model Preference */}
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1.5">
              Preferred Model for Virality Curation
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setPreferredModel("claude-3-5-haiku")}
                className={`py-2 px-2 text-[11px] font-bold rounded-xl border text-center transition-all ${
                  preferredModel === "claude-3-5-haiku"
                    ? "bg-purple-600 border-purple-500 text-white shadow"
                    : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white"
                }`}
              >
                Claude 3.5 Haiku
                <div className="text-[9px] font-normal text-purple-200">Fast & cheap</div>
              </button>
              <button
                type="button"
                onClick={() => setPreferredModel("gpt-4o-mini")}
                className={`py-2 px-2 text-[11px] font-bold rounded-xl border text-center transition-all ${
                  preferredModel === "gpt-4o-mini"
                    ? "bg-purple-600 border-purple-500 text-white shadow"
                    : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white"
                }`}
              >
                GPT-4o-mini
                <div className="text-[9px] font-normal text-purple-200">&lt; 1¢ / clip</div>
              </button>
              <button
                type="button"
                onClick={() => setPreferredModel("claude-3-5-sonnet")}
                className={`py-2 px-2 text-[11px] font-bold rounded-xl border text-center transition-all ${
                  preferredModel === "claude-3-5-sonnet"
                    ? "bg-purple-600 border-purple-500 text-white shadow"
                    : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white"
                }`}
              >
                Claude 3.5 Sonnet
                <div className="text-[9px] font-normal text-purple-200">Top depth</div>
              </button>
            </div>
          </div>
        </div>

        {/* Verification Status Feedback */}
        {testResult && (
          <div className="mt-4 space-y-1.5">
            {testResult.openai && (
              <div
                className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.openai.valid
                    ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                    : "bg-red-950/40 border border-red-500/30 text-red-300"
                }`}
              >
                {testResult.openai.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
                <span>{testResult.openai.message}</span>
              </div>
            )}
            {testResult.claude && (
              <div
                className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.claude.valid
                    ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                    : "bg-red-950/40 border border-red-500/30 text-red-300"
                }`}
              >
                {testResult.claude.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
                <span>{testResult.claude.message}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={handleTestKeys}
            disabled={isTesting || (!openaiKey && !claudeKey)}
            className="flex-1 py-2.5 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs font-bold transition-colors disabled:opacity-50"
          >
            {isTesting ? "Verifying..." : "Test Connection"}
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex-1 btn-primary-gradient py-2.5 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-purple-600/30"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saveSuccess ? "Saved!" : "Save Keys Locally"}</span>
          </button>
        </div>

        <p className="text-[10px] text-zinc-500 text-center mt-3">
          Keys are stored locally in your browser and your local `.env.local` file. They are never sent anywhere else.
        </p>
      </div>
    </div>
  );
}
