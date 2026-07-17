/**
 * Game Config Parser — converts natural language golf format descriptions
 * into valid GameConfig JSON using an LLM (z.ai GLM).
 *
 * Supports clarification mode: when the description is ambiguous, the LLM
 * returns follow-up questions instead of guessing. The user answers, then
 * a second call with those answers generates the config.
 *
 * SETUP TIME ONLY. This module is never called during live scoring.
 * The config is parsed once at game creation, then locked.
 */

import type { GameConfig } from "@shared/game-config";

// ── LLM configuration ────────────────────────────────────────────────────────

const ZAI_API_KEY = process.env.ZAI_API_KEY || "e48aad66dd074ec8aa95f20d0e48ddc5.xKIrjTTHEMCt7vS0";
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-4.7-flash";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClarificationQuestion {
  /** Stable identifier so answers can be matched back */
  id: string;
  /** The question shown to the user */
  question: string;
  /** Optional list of choices (if the question is multiple choice) */
  options?: string[];
  /** What this question resolves (for LLM context in the follow-up call) */
  resolves: string;
}

export interface ParseResult {
  /** "generate" = config is ready; "clarify" = questions need answering first */
  mode: "generate" | "clarify";
  /** Present when mode = "generate" */
  config: GameConfig | null;
  /** Present when mode = "clarify" */
  questions: ClarificationQuestion[];
  /** Error message if something went wrong */
  error: string | null;
  /** Raw LLM output for debugging */
  raw: string;
}

// ── System prompt: teaches the LLM the GameConfig schema ─────────────────────

const SCHEMA_DOC = `interface GameConfig {
  id: string;              // snake_case identifier, e.g. "custom_team_match"
  name: string;            // human-readable name
  source: "custom";        // always "custom" for parsed configs
  description: string;     // 1-2 sentence summary
  playerCount: number;     // from the request
  teamStructure: {
    type: "individual" | "teams";
    assignmentMode?: "preset" | "wolf_style" | "rotating";
    teams?: { id: string; name: string; playerIds: string[] }[];
    rotationRules?: { method: "segments" | "per_hole" | "wolf_pick"; segments?: number };
  };
  scoring: {
    format: "stroke_play" | "match_play" | "skins" | "stableford" | "quota" | "points" | "nine_point" | "bingo_bango_bongo" | "vegas" | "hammer" | "wolf" | "sixes" | "alternate_shot" | "scramble" | "shamble" | "dots_junk" | "banker" | "custom";
    handicapBased: boolean;
    carryover: boolean;
    carryoverType?: "skins" | "nassau";
    holeValue?: number;
    holeValueUnit?: "points" | "dollars";
    countingScores?: { type: "gross" | "net"; count: number; order: "low" | "high" }[];
    pointsTable?: Record<string, number>;
    stablefordTable?: Record<string, number>;
    handicapMethod?: "full" | "match_play_diff" | "peoria" | "callaway";
    segments?: { name: string; holes: [number, number]; value?: number }[];
  };
  betPools: {
    id: string;
    name: string;
    type: "match" | "skins" | "pool" | "achievement" | "side_bet" | "custom";
    scope: "per_hole" | "per_round" | "per_day" | "per_tournament";
    participants: "all" | "teams" | "individuals" | string[];
    value: number;
    valueUnit: "per_hole" | "per_round" | "per_point" | "flat";
    qualifier?: string;
  }[];
  pressRules?: {
    enabled: boolean;
    maxPerHole: number;
    multiplier: number[];
    whoCanPress: "anyone" | "losing_only";
    responseType: "accept_or_drop";
    crossGroup?: boolean;
  };
  miniGames: {
    id: string;
    enabled: boolean;
    value: number;
  }[];
  sideBets: {
    id: string;
    playerA: string;
    playerB: string;
    description: string;
    scope: "hole" | "round" | "game";
    value: number;
  }[];
  needsHandicap: boolean;
  carryover: boolean;
  specialInputs?: string[];
}`;

const GOLF_GLOSSARY = `GOLF TERMINOLOGY:
- "Gross score" = raw strokes. "Net score" = strokes minus handicap strokes.
- "Best ball" = lowest score among team members on a hole.
- "Counting scores" = e.g. "2 best gross + 1 best net" means the team's score is the sum of their 2 lowest gross scores plus their 1 lowest net score.
- "Skins" = lowest score wins the hole outright; ties carry over to the next hole.
- "Match play" = hole-by-hole win/loss, each hole worth 1 point (or a dollar amount).
- "Nassau" = three bets: front 9, back 9, overall 18.
- "Press" = doubling the bet when behind (a new bet starts for remaining holes).
- "Wolf" = rotating picker who chooses a partner or plays alone.
- "Stableford/Quota" = points for score relative to par (eagle=5, birdie=4... or custom).
- "No-strokes skins" = skins played on gross scores (no handicap adjustments).
- "Par 3 side bet" = closest to the pin on par 3 holes, worth a set amount.
- "Birdie pool" = everyone contributes, birdies split the pot.
- "Sixes" = partners rotate every 6 holes (3 segments of 6).
- "Hammer/Banker" = players can "hammer" (double) the bet on any hole.`;

const OUTPUT_RULES = `OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences, no explanation outside JSON).
The JSON must have a "mode" field that is either "generate" or "clarify".

MODE "generate" — use when you are confident the description is unambiguous enough:
{
  "mode": "generate",
  "config": { ...full GameConfig object... }
}

MODE "clarify" — use when the description has meaningful ambiguity that would
change the config structure. Ask 1-4 focused questions:
{
  "mode": "clarify",
  "questions": [
    {
      "id": "snake_case_id",
      "question": "Clear question text",
      "options": ["Option A", "Option B"],   // optional — omit for free-text
      "resolves": "What this answer determines (e.g. 'whether skins are gross or net')"
    }
  ]
}

WHEN TO CLARIFY (ask questions):
- Team format mentioned but assignment method unclear (preset vs captain pick vs rotating)
- "Skins" mentioned but gross vs net not specified
- Betting/stakes mentioned but dollar amounts missing
- Handicap usage unclear when it materially affects scoring
- Multiple possible interpretations of a game type
- Player/team count mentioned but doesn't divide evenly (e.g. "3 teams" with 10 players)

WHEN NOT TO CLARIFY (just generate):
- Description matches a well-known format with all key details
- Minor details can use sensible defaults (e.g. press rules can default)
- The description is clear even if brief
- At most 1 minor ambiguity that doesn't change the config structure

Never ask more than 4 questions. Never ask about trivial details.`;

const RULES = `CONFIG RULES:
- If team count or player names aren't specified, use placeholder team/player IDs: "T1","T2","T3" for teams, "P1","P2",... for players.
- Always set source to "custom".
- If dollar amounts are mentioned, use valueUnit "per_hole" or "per_round" or "flat" appropriately.
- Multiple bet pools are fine (e.g. team match + individual skins + par 3 CTP).
- If the description mentions handicaps or "net" scoring, set needsHandicap to true.
- Keep the config minimal but complete. Don't add betPools or miniGames that weren't mentioned.
- playerCount in the output must match the playerCount from the request.
- miniGames use the shape: { id: string, enabled: boolean, value: number }`;

const EXAMPLES = `EXAMPLE INPUTS AND OUTPUTS:

Input: "3 five-man teams, 2 best gross + 1 best net per team, $20 team match bet"
→ mode "generate" (everything specified)

Input: "skins with a birdie pool"
→ mode "clarify" — questions: [gross or net skins? dollar value per hole? birdie pool amount?]

Input: "wolf for $5 a hole, $2 birdies, no presses"
→ mode "generate" (format clear, stakes specified, press rule explicit)

Input: "team match play for money"
→ mode "clarify" — questions: [how many teams / how many players per team? how are teams assigned? what dollar amount? gross or net?]`;

const SYSTEM_PROMPT_INITIAL = `You are a golf game format parser. You convert natural language descriptions of golf betting/scoring formats into structured JSON.

${GOLF_GLOSSARY}

${OUTPUT_RULES}

GAMECONFIG SCHEMA:
${SCHEMA_DOC}

${RULES}

${EXAMPLES}`;

const SYSTEM_PROMPT_FOLLOWUP = `You are a golf game format parser. The user previously submitted a description that needed clarification. They have now answered the clarification questions. Generate the final GameConfig.

${GOLF_GLOSSARY}

You MUST return mode "generate" with a complete config. Do not ask more questions.

Return ONLY valid JSON (no markdown, no code fences):
{
  "mode": "generate",
  "config": { ...full GameConfig object... }
}

GAMECONFIG SCHEMA:
${SCHEMA_DOC}

${RULES}`;

// ── Parse function (initial — may clarify) ───────────────────────────────────

export async function parseGameConfig(
  description: string,
  playerCount: number,
): Promise<ParseResult> {
  const userPrompt = `Player count: ${playerCount}\n\nDescription: "${description}"\n\nAnalyze this description. If it is clear enough to generate an accurate GameConfig, return mode "generate". If there is meaningful ambiguity, return mode "clarify" with targeted questions.`;

  return callLLM(SYSTEM_PROMPT_INITIAL, userPrompt, playerCount);
}

// ── Parse function (follow-up — always generates) ────────────────────────────

export async function parseGameConfigWithAnswers(
  description: string,
  playerCount: number,
  answers: Record<string, string>,
): Promise<ParseResult> {
  const answersText = Object.entries(answers)
    .map(([id, answer]) => `  ${id}: ${answer}`)
    .join("\n");

  const userPrompt = `Player count: ${playerCount}\n\nOriginal description: "${description}"\n\nClarification answers:\n${answersText}\n\nGenerate the GameConfig now using the original description plus these answers.`;

  return callLLM(SYSTEM_PROMPT_FOLLOWUP, userPrompt, playerCount);
}

// ── Shared LLM call ──────────────────────────────────────────────────────────

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  playerCount: number,
): Promise<ParseResult> {
  try {
    // 30s timeout — Replit has known issues reaching z.ai (timeouts, 429s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ZAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: ZAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error("LLM API error:", response.status, errText);
      return {
        mode: "generate",
        config: null,
        questions: [],
        error: `LLM API returned ${response.status}. ${errText.slice(0, 200)}`,
        raw: "",
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        mode: "generate",
        config: null,
        questions: [],
        error: "LLM returned invalid JSON. Try rephrasing the description.",
        raw: cleaned,
      };
    }

    // ── Handle clarify mode ──────────────────────────────────────────

    if (parsed.mode === "clarify") {
      const questions: ClarificationQuestion[] = Array.isArray(parsed.questions)
        ? parsed.questions.filter((q: any) => q?.question).map((q: any) => ({
            id: q.id || `q_${Math.random().toString(36).slice(2, 8)}`,
            question: q.question,
            options: Array.isArray(q.options) ? q.options : undefined,
            resolves: q.resolves || "",
          }))
        : [];

      if (questions.length === 0) {
        // LLM said clarify but gave no questions — fall through to generate
        return {
          mode: "generate",
          config: null,
          questions: [],
          error: "LLM requested clarification but provided no questions.",
          raw: cleaned,
        };
      }

      return {
        mode: "clarify",
        config: null,
        questions,
        error: null,
        raw: cleaned,
      };
    }

    // ── Handle generate mode ─────────────────────────────────────────

    const config = parsed.config || parsed;

    if (!config.id || !config.name || !config.scoring) {
      return {
        mode: "generate",
        config: null,
        questions: [],
        error: "LLM output missing required fields (id, name, or scoring).",
        raw: cleaned,
      };
    }

    // Force source to custom and playerCount to match request
    config.source = "custom";
    config.playerCount = playerCount;
    // Ensure arrays exist
    if (!Array.isArray(config.betPools)) config.betPools = [];
    if (!Array.isArray(config.miniGames)) config.miniGames = [];
    if (!Array.isArray(config.sideBets)) config.sideBets = [];

    return {
      mode: "generate",
      config: config as GameConfig,
      questions: [],
      error: null,
      raw: cleaned,
    };
  } catch (err: any) {
    console.error("callLLM error:", err);
    return {
      mode: "generate",
      config: null,
      questions: [],
      error: err?.message || "Unknown error parsing game config.",
      raw: "",
    };
  }
}
