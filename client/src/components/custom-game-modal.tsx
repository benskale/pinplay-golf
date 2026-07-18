/**
 * CustomGameModal — Conversational chat modal for creating custom golf games.
 *
 * Opens as a shadow-box overlay when the user taps "Custom Game".
 * Presents a chat interface where the user describes their format,
 * the LLM asks clarifying questions if needed, then shows a config
 * summary with a "Start Game" confirmation button.
 *
 * Never silently builds — the user always reviews and confirms.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Send, X, Loader2, Check, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ── Types ───────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  question: string;
  options?: string[];
  resolves?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "questions" | "config" | "preset";
  questions?: Question[];
  config?: any;
  presetId?: string;
  presetName?: string;
}

interface CustomGameModalProps {
  playerCount: number;
  onClose: () => void;
  onConfirm: (config: any) => void;
  onPresetSelect?: (presetId: string) => void;
}

let msgCounter = 0;
function makeMsg(
  role: "user" | "assistant",
  content: string,
  extra?: Partial<ChatMessage>,
): ChatMessage {
  msgCounter += 1;
  return {
    id: `msg-${Date.now()}-${msgCounter}`,
    role,
    content,
    ...extra,
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function CustomGameModal({
  playerCount,
  onClose,
  onConfirm,
  onPresetSelect,
}: CustomGameModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    makeMsg(
      "assistant",
      "Describe the golf game you want to play. Include the scoring format, teams, stakes, and any side bets.\n\nFor example: \"3 five-man teams, 2 best gross + 1 best net, $20 team match, skins $2/hole + $2/birdie\"",
    ),
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [originalDescription, setOriginalDescription] = useState("");
  const [configReady, setConfigReady] = useState<any>(null);
  const [presetReady, setPresetReady] = useState<{ presetId: string; presetName: string } | null>(null);
  const [clarifyPresetId, setClarifyPresetId] = useState<string | undefined>(undefined);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, loading]);

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  // ── Send message to LLM ────────────────────────────────────────────────

  const sendToLLM = useCallback(
    async (description: string, collectedAnswers?: Record<string, string>) => {
      setLoading(true);
      setPendingQuestions([]);

      try {
        const res = await apiRequest("POST", "/api/game-config/parse", {
          description: description.trim(),
          playerCount,
          presetId: collectedAnswers ? clarifyPresetId : undefined,
          answers:
            collectedAnswers && Object.keys(collectedAnswers).length > 0
              ? collectedAnswers
              : undefined,
        });
        const data = await res.json();

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            makeMsg(
              "assistant",
              data.message ||
                "Something went wrong parsing that. Try rephrasing your description.",
            ),
          ]);
          return;
        }

        if (data.mode === "preset" && data.presetId) {
          // Tier 1 — exact preset match
          setPresetReady({ presetId: data.presetId, presetName: data.presetName || data.presetId });
          setConfigReady(null);
          setMessages((prev) => [
            ...prev,
            makeMsg("assistant", `This matches our ${data.presetName || data.presetId} preset perfectly!\n\n${data.presetDescription || ""}`, { type: "preset", presetId: data.presetId, presetName: data.presetName }),
          ]);
        } else if (data.mode === "clarify" && data.questions?.length > 0) {
          // Tier 2 — preset with tweaks (store presetId for follow-up)
          if (data.presetId) setClarifyPresetId(data.presetId);
          const qs: Question[] = data.questions.map((q: any) => ({
            id: q.id,
            question: q.question,
            options: q.options,
            resolves: q.resolves,
          }));
          setPendingQuestions(qs);
          setAnswers({});

          // Build a natural-language summary of the questions
          const presetHint = data.presetId ? `This looks like ${data.presetName || data.presetId} with some differences.\n\n` : "";
          const questionText = qs
            .map((q, i) => `${i + 1}. ${q.question}`)
            .join("\n");

          setMessages((prev) => [
            ...prev,
            makeMsg("assistant", `${presetHint}${questionText}`, { type: "questions", questions: qs }),
          ]);
        } else if (data.mode === "generate" && data.config) {
          const cfg = data.config;
          setConfigReady(cfg);

          // Build a readable summary of the config
          const summaryParts: string[] = [`${cfg.name || "Custom Game"}`];
          if (cfg.description) summaryParts.push(cfg.description);

          const details: string[] = [];
          if (cfg.scoring?.format) {
            details.push(
              `Format: ${cfg.scoring.format.replace(/_/g, " ")}`,
            );
          }
          if (cfg.teamStructure?.type === "teams") {
            const teamCount = cfg.teamStructure.teams?.length || "?";
            details.push(`${teamCount} teams`);
          }
          if (cfg.needsHandicap) details.push("Uses handicaps");
          if (cfg.betPools?.length > 0) {
            details.push(
              `${cfg.betPools.length} bet pool${cfg.betPools.length > 1 ? "s" : ""}`,
            );
          }
          if (cfg.miniGames?.length > 0) {
            details.push(
              `${cfg.miniGames.length} mini-game${cfg.miniGames.length > 1 ? "s" : ""}`,
            );
          }

          const summary = details.length > 0
            ? `${summaryParts.join(" — ")}\n${details.join(" · ")}`
            : summaryParts.join(" — ");

          const templateNote = data.isGlobalTemplate
            ? "\n\n(Saved to community library for future use)"
            : "";

          setMessages((prev) => [
            ...prev,
            makeMsg("assistant", `${summary}${templateNote}`, { type: "config", config: cfg }),
          ]);
        }
      } catch (e: any) {
        setMessages((prev) => [
          ...prev,
          makeMsg(
            "assistant",
            "Network error reaching the AI. Check your connection and try again.",
          ),
        ]);
      } finally {
        setLoading(false);
      }
    },
    [playerCount],
  );

  // ── Handle send (user submits text) ────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");

    // Add user message to chat
    setMessages((prev) => [...prev, makeMsg("user", text)]);

    // If we're answering clarification questions, collect the text answer
    if (pendingQuestions.length > 0) {
      // Assign this text as the answer to the first unanswered question
      const unanswered = pendingQuestions.find(
        (q) => !answers[q.id]?.trim(),
      );
      if (unanswered) {
        const newAnswers = { ...answers, [unanswered.id]: text };
        setAnswers(newAnswers);

        // Check if all questions are answered
        const allAnswered = pendingQuestions.every(
          (q) => newAnswers[q.id]?.trim(),
        );

        if (allAnswered) {
          await sendToLLM(originalDescription, newAnswers);
        } else {
          // Still have unanswered questions — prompt for the next one
          const nextQ = pendingQuestions.find(
            (q) => !newAnswers[q.id]?.trim(),
          );
          if (nextQ) {
            setMessages((prev) => [
              ...prev,
              makeMsg("assistant", `Next: ${nextQ.question}`),
            ]);
          }
        }
        return;
      }
    }

    // Normal flow — initial description
    if (!configReady) {
      setOriginalDescription(text);
      await sendToLLM(text);
    } else {
      // Config already exists — treat as "start over" with new description
      setConfigReady(null);
      setOriginalDescription(text);
      await sendToLLM(text);
    }
  }, [
    input,
    loading,
    pendingQuestions,
    answers,
    originalDescription,
    configReady,
    sendToLLM,
  ]);

  // ── Handle quick-reply option tap ──────────────────────────────────────

  const handleOptionTap = useCallback(
    async (questionId: string, option: string) => {
      const newAnswers = { ...answers, [questionId]: option };
      setAnswers(newAnswers);
      setMessages((prev) => [...prev, makeMsg("user", option)]);

      const allAnswered = pendingQuestions.every(
        (q) => newAnswers[q.id]?.trim(),
      );

      if (allAnswered) {
        await sendToLLM(originalDescription, newAnswers);
      } else {
        const nextQ = pendingQuestions.find(
          (q) => !newAnswers[q.id]?.trim(),
        );
        if (nextQ) {
          setMessages((prev) => [
            ...prev,
            makeMsg("assistant", nextQ.question),
          ]);
        }
      }
    },
    [answers, pendingQuestions, originalDescription, sendToLLM],
  );

  // ── Start over ─────────────────────────────────────────────────────────

  const handleStartOver = useCallback(() => {
    setConfigReady(null);
    setPresetReady(null);
    setClarifyPresetId(undefined);
    setPendingQuestions([]);
    setAnswers({});
    setOriginalDescription("");
    setMessages([
      makeMsg(
        "assistant",
        "Let's try again. Describe the golf game you want to play.",
      ),
    ]);
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  // ── Confirm config ─────────────────────────────────────────────────────

  const handleConfirm = useCallback(() => {
    if (configReady) {
      onConfirm(configReady);
    } else if (presetReady && onPresetSelect) {
      onPresetSelect(presetReady.presetId);
    }
  }, [configReady, presetReady, onConfirm, onPresetSelect]);

  // ── Render ─────────────────────────────────────────────────────────────

  const hasUnansweredQuestions =
    pendingQuestions.length > 0 &&
    pendingQuestions.some((q) => !answers[q.id]?.trim());

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Modal panel */}
      <div className="flex flex-col w-full h-full max-w-lg mx-auto bg-white dark:bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-violet-600 to-indigo-600">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-white text-[0.9375rem] leading-tight">
                Custom Game
              </p>
              <p className="text-[0.6875rem] text-violet-100 leading-tight">
                AI-powered game builder
              </p>
            </div>
          </div>
          <button
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors active:scale-95"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50 dark:bg-gray-950/50"
        >
          {messages.map((msg) => (
            <div key={msg.id}>
              {/* Message bubble */}
              <div
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[0.875rem] whitespace-pre-wrap leading-relaxed ${
                    msg.role === "user"
                      ? "bg-violet-600 text-white rounded-br-md"
                      : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-700"
                  }`}
                >
                  {msg.content}
                </div>
              </div>

              {/* Quick-reply chips for questions with options */}
              {msg.type === "questions" &&
                msg.questions?.map((q) => {
                  const isAnswered = !!answers[q.id]?.trim();
                  if (isAnswered || !q.options || q.options.length === 0)
                    return null;
                  return (
                    <div
                      key={q.id}
                      className="flex flex-wrap gap-2 mt-2 pl-1"
                    >
                      {q.options.map((opt) => (
                        <button
                          key={opt}
                          disabled={loading}
                          className="px-3.5 py-2 rounded-full text-[0.8125rem] font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-all active:scale-95 disabled:opacity-50"
                          onClick={() => handleOptionTap(q.id, opt)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  );
                })}

              {/* Config summary card with Start Game button */}
              {msg.type === "config" && msg.config && (
                <div className="mt-2 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-green-200 dark:border-green-800 shadow-sm space-y-2.5">
                  {/* Config details */}
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="font-semibold text-[0.8125rem] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Game Ready
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {msg.config.scoring?.format && (
                      <span className="text-[0.6875rem] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-800 capitalize">
                        {msg.config.scoring.format.replace(/_/g, " ")}
                      </span>
                    )}
                    {msg.config.teamStructure?.type === "teams" && (
                      <span className="text-[0.6875rem] font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 px-2 py-0.5 rounded-full border border-purple-100 dark:border-purple-800">
                        {msg.config.teamStructure.teams?.length || "?"} teams
                      </span>
                    )}
                    {msg.config.needsHandicap && (
                      <span className="text-[0.6875rem] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-800">
                        Handicap
                      </span>
                    )}
                    {msg.config.carryover && (
                      <span className="text-[0.6875rem] font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-100 dark:border-cyan-800">
                        Carryover
                      </span>
                    )}
                  </div>

                  {/* Bet pools */}
                  {msg.config.betPools?.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {msg.config.betPools.map(
                        (pool: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-[0.8125rem]"
                          >
                            <span className="text-gray-600 dark:text-gray-400">
                              {pool.name}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-50">
                              ${pool.value}
                              {pool.valueUnit === "per_hole"
                                ? "/hole"
                                : pool.valueUnit === "per_round"
                                  ? "/round"
                                  : ""}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  {/* Mini games */}
                  {msg.config.miniGames?.length > 0 && (
                    <div className="space-y-1">
                      {msg.config.miniGames.map((mg: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-[0.8125rem]"
                        >
                          <span className="text-gray-600 dark:text-gray-400">
                            {mg.name || mg.id}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-50">
                            ${mg.value}
                            {mg.valueUnit &&
                            mg.valueUnit !== "flat"
                              ? `/${mg.valueUnit.replace("per_", "")}`
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    <button
                      className="flex-1 py-3 bg-green-600 text-white font-semibold rounded-xl text-sm transition-all hover:bg-green-700 active:scale-[0.98] flex items-center justify-center gap-2"
                      onClick={handleConfirm}
                    >
                      <Check className="w-4 h-4" />
                      Start Game
                    </button>
                    <button
                      className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium rounded-xl text-sm transition-all hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-[0.98] flex items-center gap-1.5"
                      onClick={handleStartOver}
                    >
                      <RotateCcw className="w-4 h-4" />
                      Redo
                    </button>
                  </div>
                </div>
              )}

              {/* Preset match card with Start Game button (Tier 1) */}
              {msg.type === "preset" && msg.presetId && (
                <div className="mt-2 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-sm space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="font-semibold text-[0.8125rem] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Preset Match
                    </p>
                  </div>
                  <p className="text-[0.875rem] text-gray-700 dark:text-gray-300 leading-relaxed">
                    This is a known format: <strong>{msg.presetName}</strong>
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold rounded-xl text-sm transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
                      onClick={handleConfirm}
                    >
                      <Check className="w-4 h-4" />
                      Start {msg.presetName}
                    </button>
                    <button
                      className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium rounded-xl text-sm transition-all hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-[0.98] flex items-center gap-1.5"
                      onClick={handleStartOver}
                    >
                      <RotateCcw className="w-4 h-4" />
                      Redo
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 bg-white dark:bg-gray-800 rounded-2xl rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          {/* Question hint */}
          {hasUnansweredQuestions && (
            <p className="text-[0.6875rem] text-violet-600 dark:text-violet-400 font-medium mb-1.5">
              Answer the question above (type or tap an option)
            </p>
          )}
          <div className="flex items-center gap-2.5">
            <input
              ref={inputRef}
              type="text"
              className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-50 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
              placeholder={
                configReady || presetReady
                  ? "Describe a new game to start over..."
                  : hasUnansweredQuestions
                    ? "Type your answer..."
                    : "Describe your golf game..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading}
            />
            <button
              className="w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center flex-shrink-0 transition-all hover:bg-violet-700 active:scale-95 disabled:opacity-40"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              aria-label="Send"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
