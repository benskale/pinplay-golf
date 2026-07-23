/**
 * Game Config Parser — converts natural language golf format descriptions
 * into valid GameConfig JSON using an LLM (z.ai GLM).
 *
 * THREE-TIER MATCHING SYSTEM:
 * Tier 1 — Exact preset: description maps cleanly to one of the 25 built-in
 *          presets. LLM returns presetId. No custom config needed.
 * Tier 2 — Preset + tweaks: close to a preset but with differences (different
 *          team count, added side bets, dollar amounts, counting scores). LLM
 *          returns presetId + targeted questions about only what's different.
 * Tier 3 — Novel game: genuinely new format. LLM generates full config and
 *          suggests a template name. Auto-saved to the global template library.
 *
 * Global templates from Tier 3 are fed back into the system prompt so future
 * descriptions can match them (Tier 1/2 hits increase over time).
 *
 * SETUP TIME ONLY. This module is never called during live scoring.
 * The config is parsed once at game creation, then locked.
 */

import type { GameConfig } from "@shared/game-config";

// ── LLM configuration ────────────────────────────────────────────────────────

const ZAI_API_KEY = process.env.ZAI_API_KEY || "e48aad66dd074ec8aa95f20d0e48ddc5.xKIrjTTHEMCt7vS0";
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-4.6";

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

/** Lightweight info about a global template (for LLM matching, not full config) */
export interface GlobalTemplateInfo {
  configId: string;
  name: string;
  description: string | null;
}

export interface ParseResult {
  /** "preset" = Tier 1 exact match; "clarify" = Tier 2 needs questions; "generate" = Tier 3 ready */
  mode: "preset" | "clarify" | "generate";
  /** Present when mode = "preset" — the preset game type to load */
  presetId: string | null;
  /** Present when mode = "generate" */
  config: GameConfig | null;
  /** Present when mode = "clarify" — may also have presetId for Tier 2 */
  questions: ClarificationQuestion[];
  /** Error message if something went wrong */
  error: string | null;
  /** Tier 3: suggested name for auto-saving as a global template */
  suggestedTemplateName: string | null;
  /** Raw LLM output for debugging */
  raw: string;
}

// ── Preset catalog (mirrors client/src/lib/preset-mappings.ts) ────────────────

export interface PresetInfo {
  id: string;
  name: string;
  description: string;
  playerRange: string;
}

export const PRESET_CATALOG: PresetInfo[] = [
  { id: "match_play", name: "Match Play", description: "Hole-by-hole win/loss. Each hole is worth 1 point. Lower net score wins.", playerRange: "2+ players" },
  { id: "stroke_play", name: "Stroke Play", description: "Total strokes for the round. Lowest score wins.", playerRange: "2+ players" },
  { id: "nassau", name: "Nassau", description: "Three separate match-play bets: front 9, back 9, and total 18.", playerRange: "2+ players" },
  { id: "skins", name: "Skins", description: "Lowest score wins the hole outright. Ties carry the skin to the next hole.", playerRange: "2+ players" },
  { id: "alternate_shot", name: "Alternate Shot", description: "Partners alternate hitting the same ball. Enter one team score per hole.", playerRange: "2 players" },
  { id: "best_ball_2", name: "Best Ball", description: "Each player plays their own ball. Lower net score from each player counts.", playerRange: "2 players" },
  { id: "par_birdie", name: "Par/Birdie Points", description: "Par=1pt, Birdie=2pts, Eagle=4pts, Bogey=0. Most points wins.", playerRange: "2+ players" },
  { id: "wolf_3", name: "Wolf (3-player)", description: "Wolf rotates each hole. Wolf goes alone (+2) or picks partner (+1 each).", playerRange: "3 players" },
  { id: "sixes", name: "Sixes / Round Robin", description: "18 holes split into 3 groups of 6. Partners rotate so everyone teams with everyone.", playerRange: "3 players" },
  { id: "skins_3", name: "3-Man Skins", description: "Lowest score wins the hole outright. Ties carry over.", playerRange: "3 players" },
  { id: "split_sixes", name: "Split Sixes", description: "6-hole best-ball match play segments. Partners rotate each 6 holes.", playerRange: "3 players" },
  { id: "nine_point", name: "9-Point", description: "9 points per hole split by finish: 1st=5pts, 2nd=3pts, 3rd=1pt. Ties split combined.", playerRange: "3 players" },
  { id: "bingo_bango_bongo", name: "Bingo Bango Bongo", description: "3 pts per hole: first on green, closest to pin, first to hole out.", playerRange: "3+ players" },
  { id: "best_ball_4", name: "Best Ball (2v2)", description: "Two teams. Best score from each team counts per hole. Match play format.", playerRange: "4 players" },
  { id: "scramble", name: "Scramble", description: "Best shot from each team counts. Two teams, enter one score each.", playerRange: "4 players" },
  { id: "alternate_shot_4", name: "Alternate Shot (Foursomes)", description: "Two teams of 2. Partners alternate hitting the same ball.", playerRange: "4 players" },
  { id: "shamble", name: "Shamble", description: "Best tee shot chosen for all. Each player then plays their own ball. Best ball counts.", playerRange: "4 players" },
  { id: "nassau_4", name: "Nassau (2v2)", description: "Two teams compete in three bets: front 9, back 9, and 18 total (match play).", playerRange: "4 players" },
  { id: "skins_4", name: "4-Man Skins", description: "Lowest score wins the hole outright. Ties carry over.", playerRange: "4 players" },
  { id: "wolf", name: "Wolf", description: "Rotating Wolf picks a partner or goes alone. Best ball vs best ball.", playerRange: "4 players" },
  { id: "vegas", name: "Vegas", description: "Two teams. Scores are combined as a 2-digit number. Lower number wins the difference in points.", playerRange: "4 players" },
  { id: "hammer", name: "Hammer", description: "Any player can double the bet ('Hammer'). Lower score wins the current bet value.", playerRange: "4 players" },
  { id: "stableford", name: "Quota / Stableford", description: "Points per hole relative to par. Quota = 36 minus handicap.", playerRange: "2+ players" },
  { id: "dots_junk", name: "Dots / Junk", description: "Base stroke play with bonus dots for birdies, eagles, sandies, greenies.", playerRange: "2+ players" },
  { id: "banker", name: "Banker", description: "One rotating Banker plays three individual matches simultaneously.", playerRange: "3 players" },
];

function presetCatalogText(): string {
  return PRESET_CATALOG.map((p, i) =>
    `${i + 1}. ${p.id} — "${p.name}": ${p.description} (${p.playerRange})`
  ).join("\n");
}

function globalTemplatesText(templates: GlobalTemplateInfo[]): string {
  if (templates.length === 0) return "(none yet)";
  return templates.map(t => `- ${t.configId} — "${t.name}": ${t.description || "No description"}`).join("\n");
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

const TIER_RULES = `THREE-TIER MATCHING — always try to match the description to an existing preset or template BEFORE generating from scratch:

TIER 1 — EXACT PRESET MATCH:
The description clearly describes one of the AVAILABLE PRESETS with no meaningful differences (same format, same structure). Extra details that are standard defaults (e.g. "$5 a hole" for skins) do NOT make it Tier 2 — the format is the same.
Return:
{ "mode": "preset", "presetId": "nassau_4" }

TIER 2 — PRESET WITH TWEAKS:
The description is very close to an existing preset or template but has specific structural differences (different team count, added side bets that change the game, different counting scores, different segment structure, unusual handicap rules). Dollar amounts alone do NOT make it Tier 2 unless the amounts are integral to the format. Ask 1-4 focused questions about ONLY what's different — do not ask about details the preset already covers.
Return:
{
  "mode": "clarify",
  "presetId": "nassau_4",
  "questions": [
    { "id": "team_count", "question": "How many teams?", "options": ["2 teams", "3 teams"], "resolves": "Number of teams for the match" }
  ]
}

TIER 3 — NOVEL GAME:
The description doesn't match any preset or template. The format is genuinely new or combines multiple formats in a way no single preset covers.
Return:
{
  "mode": "generate",
  "config": { ...full GameConfig... },
  "suggestedTemplateName": "Custom 3-Team Best Ball"
}

IMPORTANT: Be precise about tier selection.
- Tier 1 should ONLY be used when the description EXACTLY matches a preset's format with no structural differences. If the user mentions different team counts, different scoring rules, combined formats, or anything that doesn't exist in the preset catalog, do NOT use Tier 1.
- Tier 2 is for descriptions that are clearly based on one preset but have specific structural differences (different team count, different counting scores, added bet pools that change the game).
- Tier 3 should be used MORE liberally than you might think. Any description that combines multiple formats, uses non-standard team structures (e.g. 3+ teams), specifies custom counting scores, or describes rules not covered by any single preset should be Tier 3.
- When in doubt between Tier 1 and Tier 3, prefer Tier 3 (generate). It is better to generate a custom config than to force-fit a description into a preset that doesn't actually match.
- NEVER classify as Tier 1 preset "wolf" unless the user literally says "wolf" and describes the exact Wolf format (rotating picker, go alone or pick partner, best ball vs best ball).`;

const CLARIFY_RULES = `WHEN TO CLARIFY (Tier 2 questions):
- Team format mentioned but assignment method unclear (preset vs captain pick vs rotating)
- "Skins" mentioned but gross vs net not specified AND the user might mean either
- Counting scores are ambiguous (e.g. "best ball" could mean 1 best or 2 best)
- Multiple possible interpretations of a game type that change the config structure

WHEN NOT TO CLARIFY:
- Description matches a well-known format with all key details → Tier 1
- Dollar amounts are mentioned but the format is clear → Tier 1 with amounts as defaults
- Minor details can use sensible defaults → Tier 1
- At most 1 minor ambiguity that doesn't change the config structure → Tier 1

Never ask more than 4 questions. Never ask about trivial details.`;

const OUTPUT_RULES = `OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences, no explanation outside JSON).`;

const CONFIG_RULES = `CONFIG RULES (for Tier 3 generate mode):
- If team count or player names aren't specified, use placeholder team/player IDs: "T1","T2","T3" for teams, "P1","P2",... for players.
- Always set source to "custom".
- If dollar amounts are mentioned, use valueUnit "per_hole" or "per_round" or "flat" appropriately.
- Multiple bet pools are fine (e.g. team match + individual skins + par 3 CTP).
- If the description mentions handicaps or "net" scoring, set needsHandicap to true.
- Keep the config minimal but complete. Don't add betPools or miniGames that weren't mentioned.
- playerCount in the output must match the playerCount from the request.
- miniGames use the shape: { id: string, enabled: boolean, value: number }
- suggestedTemplateName should be a short, descriptive name (3-6 words) for the global template library.`;

const EXAMPLES = `EXAMPLE INPUTS AND OUTPUTS:

Input: "nassau for $20"
→ Tier 1 (exact preset "nassau"). Dollar amount is a default, not a structural change.
→ { "mode": "preset", "presetId": "nassau" }

Input: "3 five-man teams, 2 best gross + 1 best net per team, $20 team match bet"
→ Tier 3 (novel — no preset has 3 teams with 2 best gross + 1 best net). Everything specified.
→ { "mode": "generate", "config": { ... }, "suggestedTemplateName": "3-Team 2G1N Match" }

Input: "skins with a birdie pool"
→ Tier 2 (close to skins preset but adds birdie pool).
→ { "mode": "clarify", "presetId": "skins", "questions": [dollar value per hole? birdie pool amount?] }

Input: "wolf for $5 a hole, $2 birdies"
→ Tier 1 (exact preset "wolf"). Dollar amounts are defaults.
→ { "mode": "preset", "presetId": "wolf" }

Input: "team match play, 3 teams, best ball format"
→ Tier 2 (close to best_ball_4 but 3 teams instead of 2).
→ { "mode": "clarify", "presetId": "best_ball_4", "questions": [how many players per team?] }

Input: "vegas but with 3 teams instead of 2 and press anytime"
→ Tier 2 (vegas preset with structural changes).
→ { "mode": "clarify", "presetId": "vegas", "questions": [how many players per team? press multiplier?] }`;

// ── Parse function (initial — may return preset, clarify, or generate) ────────

export async function parseGameConfig(
  description: string,
  playerCount: number,
  globalTemplates?: GlobalTemplateInfo[],
): Promise<ParseResult> {

  const systemPrompt = `You are a golf game format parser. You convert natural language descriptions of golf betting/scoring formats into structured JSON.

${GOLF_GLOSSARY}

${OUTPUT_RULES}

${TIER_RULES}

AVAILABLE PRESETS (match descriptions to these first):
${presetCatalogText()}

COMMUNITY TEMPLATES (also try to match these):
${globalTemplatesText(globalTemplates || [])}

GAMECONFIG SCHEMA (needed only for Tier 3 generate mode):
${SCHEMA_DOC}

${CLARIFY_RULES}

${CONFIG_RULES}

${EXAMPLES}`;

  const userPrompt = `Player count: ${playerCount}\n\nDescription: "${description}"\n\nAnalyze this description. Try to match it to a preset (Tier 1) or preset-with-tweaks (Tier 2) first. Only use Tier 3 (generate) if the format is genuinely novel.`;

  return callLLM(systemPrompt, userPrompt, playerCount);
}

// ── Parse function (follow-up — always generates) ────────────────────────────

export async function parseGameConfigWithAnswers(
  description: string,
  playerCount: number,
  answers: Record<string, string>,
  presetId?: string,
  globalTemplates?: GlobalTemplateInfo[],
): Promise<ParseResult> {

  const answersText = Object.entries(answers)
    .map(([id, answer]) => `  ${id}: ${answer}`)
    .join("\n");

  const presetHint = presetId
    ? `This game is based on the preset "${presetId}" but with modifications. Generate a custom GameConfig that starts from the ${presetId} format and applies the user's modifications from their answers.`
    : "Generate a custom GameConfig using the original description plus the answers.";

  const systemPrompt = `You are a golf game format parser. The user previously submitted a description that needed clarification. They have now answered the clarification questions. Generate the final GameConfig.

${GOLF_GLOSSARY}

${presetHint}

You MUST return mode "generate" with a complete config and a suggestedTemplateName. Do not ask more questions.

Return ONLY valid JSON (no markdown, no code fences):
{
  "mode": "generate",
  "config": { ...full GameConfig object... },
  "suggestedTemplateName": "Short Descriptive Name"
}

AVAILABLE PRESETS (for reference):
${presetCatalogText()}

GAMECONFIG SCHEMA:
${SCHEMA_DOC}

${CONFIG_RULES}`;

  const userPrompt = `Player count: ${playerCount}\n\nOriginal description: "${description}"\n\nClarification answers:\n${answersText}\n\nGenerate the GameConfig now.`;

  return callLLM(systemPrompt, userPrompt, playerCount);
}

// ── Shared LLM call ──────────────────────────────────────────────────────────

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  playerCount: number,
): Promise<ParseResult> {
  try {
    // 45s timeout — generous for complex configs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

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
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error("LLM API error:", response.status, errText);
      return {
        mode: "generate",
        presetId: null,
        config: null,
        questions: [],
        error: `LLM API returned ${response.status}. ${errText.slice(0, 200)}`,
        suggestedTemplateName: null,
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
        presetId: null,
        config: null,
        questions: [],
        error: "LLM returned invalid JSON. Try rephrasing the description.",
        suggestedTemplateName: null,
        raw: cleaned,
      };
    }

    // ── Handle preset mode (Tier 1) ──────────────────────────────────

    if (parsed.mode === "preset") {
      const presetId = parsed.presetId || "";
      const preset = PRESET_CATALOG.find(p => p.id === presetId);
      if (!preset) {
        return {
          mode: "generate",
          presetId: null,
          config: null,
          questions: [],
          error: `LLM returned unknown presetId "${presetId}".`,
          suggestedTemplateName: null,
          raw: cleaned,
        };
      }
      return {
        mode: "preset",
        presetId,
        config: null,
        questions: [],
        error: null,
        suggestedTemplateName: null,
        raw: cleaned,
      };
    }

    // ── Handle clarify mode (Tier 2) ─────────────────────────────────

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
        return {
          mode: "generate",
          presetId: null,
          config: null,
          questions: [],
          error: "LLM requested clarification but provided no questions.",
          suggestedTemplateName: null,
          raw: cleaned,
        };
      }

      return {
        mode: "clarify",
        presetId: parsed.presetId || null,
        config: null,
        questions,
        error: null,
        suggestedTemplateName: null,
        raw: cleaned,
      };
    }

    // ── Handle generate mode (Tier 3) ────────────────────────────────

    const config = parsed.config || parsed;

    if (!config.id || !config.name || !config.scoring) {
      return {
        mode: "generate",
        presetId: null,
        config: null,
        questions: [],
        error: "LLM output missing required fields (id, name, or scoring).",
        suggestedTemplateName: parsed.suggestedTemplateName || null,
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
      presetId: null,
      config: config as GameConfig,
      questions: [],
      error: null,
      suggestedTemplateName: parsed.suggestedTemplateName || null,
      raw: cleaned,
    };
  } catch (err: any) {
    console.error("callLLM error:", err);
    return {
      mode: "generate",
      presetId: null,
      config: null,
      questions: [],
      error: err?.message || "Unknown error parsing game config.",
      suggestedTemplateName: null,
      raw: "",
    };
  }
}
