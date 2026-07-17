/**
 * Game Config Parser — converts natural language golf format descriptions
 * into valid GameConfig JSON using an LLM (z.ai GLM).
 *
 * SETUP TIME ONLY. This module is never called during live scoring.
 * The config is parsed once at game creation, then locked.
 */

import type { GameConfig } from "@shared/game-config";

// ── LLM configuration ────────────────────────────────────────────────────────

const ZAI_API_KEY = process.env.ZAI_API_KEY || "e48aad66dd074ec8aa95f20d0e48ddc5.xKIrjTTHEMCt7vS0";
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-4.7-flash";

// ── System prompt: teaches the LLM the GameConfig schema ─────────────────────

const SYSTEM_PROMPT = `You are a golf game format parser. You convert natural language descriptions of golf betting/scoring formats into structured JSON conforming to the GameConfig schema.

OUTPUT RULES:
1. Return ONLY valid JSON. No markdown, no explanation, no code fences.
2. The JSON must conform to this TypeScript interface:

interface GameConfig {
  id: string;              // snake_case identifier, e.g. "custom_team_match"
  name: string;            // human-readable name
  source: "custom";        // always "custom" for parsed configs
  description: string;     // 1-2 sentence summary
  playerCount: number;     // from the request
  teamStructure: {
    type: "individual" | "teams";
    assignmentMode?: "preset" | "wolf_style" | "rotating" | "captain_pick";
    teams?: { id: string; name: string; playerIds: string[] }[];
    rotationRules?: { method: string; [k: string]: any };
  };
  scoring: {
    format: "match_play" | "stroke_play" | "skins" | "stableford" | "wolf" | "vegas" | "hammer" | "banker" | "dots_junk" | "points" | "best_ball" | "scramble";
    handicapBased: boolean;
    carryover: boolean;
    carryoverType?: "skins" | "press" | "vegas";
    holeValue?: number;
    holeValueUnit?: "points" | "dollars";
    countingScores?: { type: "gross" | "net"; count: number; order: "low" | "high" }[];
    pointsTable?: Record<string, number>;
    stablefordTable?: Record<string, number>;
    segments?: { name: string; holes: [number, number] }[];
  };
  betPools: {
    id: string;
    name: string;
    type: "skins" | "match" | "nassau" | "per_hole" | "per_round" | "quota" | "bonus";
    scope: "per_hole" | "per_round" | "per_segment";
    participants: "all" | "teams" | "individuals";
    value: number;
    valueUnit: "per_hole" | "per_round" | "per_point" | "total";
  }[];
  pressRules?: {
    enabled: boolean;
    maxPerHole: number;
    multiplier: number[];
    whoCanPress: "anyone" | "losing_team";
    responseType: "auto" | "accept_or_drop";
    crossGroup: boolean;
  };
  miniGames?: {
    id: string;
    name: string;
    value: number;
    valueUnit: string;
    condition: string;
  }[];
  sideBets?: {
    id: string;
    playerA: string;
    playerB: string;
    value: number;
    valueUnit: string;
    scope: string;
  }[];
  needsHandicap: boolean;
  carryover: boolean;
  specialInputs?: string[];
}

GOLF TERMINOLOGY:
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

EXAMPLE INPUTS AND OUTPUTS:

Input: "3 five-man teams, 2 best gross + 1 best net per team, $20 team match bet"
Output:
{"id":"custom_team_counting","name":"Team Counting Scores Match","source":"custom","description":"Three teams of five. Team score is 2 best gross + 1 best net per hole. $20 team match bet.","playerCount":15,"teamStructure":{"type":"teams","assignmentMode":"captain_pick"},"scoring":{"format":"match_play","handicapBased":true,"carryover":false,"countingScores":[{"type":"gross","count":2,"order":"low"},{"type":"net","count":1,"order":"low"}]},"betPools":[{"id":"team_match","name":"Team Match","type":"match","scope":"per_round","participants":"teams","value":20,"valueUnit":"total"}],"pressRules":{"enabled":false,"maxPerHole":3,"multiplier":[2,4,8],"whoCanPress":"anyone","responseType":"accept_or_drop","crossGroup":false},"needsHandicap":true,"carryover":false}

Input: "no-strokes skins, $2 per hole, $2 per birdie"
Output:
{"id":"custom_skins","name":"Gross Skins with Birdies","source":"custom","description":"Skins played on gross scores. $2 per hole plus $2 bonus per birdie.","playerCount":4,"teamStructure":{"type":"individual"},"scoring":{"format":"skins","handicapBased":false,"carryover":true,"carryoverType":"skins"},"betPools":[{"id":"skins_pot","name":"Skins","type":"skins","scope":"per_hole","participants":"all","value":2,"valueUnit":"per_hole"}],"miniGames":[{"id":"birdies","name":"Birdies","value":2,"valueUnit":"per_birdie","condition":"birdie or better"}],"needsHandicap":false,"carryover":true}

Input: "individual par 3 closest to pin, $5 per par 3"
Output: Include a miniGame with id "par3_ctp", condition "closest to pin on par 3 holes", value 5.

RULES:
- If team count or player names aren't specified, use placeholder team/player IDs: "T1","T2","T3" for teams, "P1","P2",... for players.
- Always set source to "custom".
- If dollar amounts are mentioned, use valueUnit "per_hole" or "per_round" or "total" appropriately.
- Multiple bet pools are fine (e.g. team match + individual skins + par 3 CTP).
- If the description mentions handicaps or "net" scoring, set needsHandicap to true.
- Keep the config minimal but complete. Don't add betPools or miniGames that weren't mentioned.
- playerCount in the output should match the playerCount from the request.`;

// ── Parse function ───────────────────────────────────────────────────────────

export interface ParseResult {
  config: GameConfig | null;
  error: string | null;
  raw: string;
}

export async function parseGameConfig(
  description: string,
  playerCount: number,
): Promise<ParseResult> {
  const userPrompt = `Player count: ${playerCount}\n\nDescription: "${description}"\n\nReturn the GameConfig JSON now.`;

  try {
    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ZAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: ZAI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("LLM API error:", response.status, errText);
      return {
        config: null,
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

    let parsed: GameConfig;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return {
        config: null,
        error: "LLM returned invalid JSON. Try rephrasing the description.",
        raw: cleaned,
      };
    }

    // Ensure required fields
    if (!parsed.id || !parsed.name || !parsed.scoring) {
      return {
        config: null,
        error: "LLM output missing required fields (id, name, or scoring).",
        raw: cleaned,
      };
    }

    // Force source to custom
    parsed.source = "custom";
    // Force playerCount
    parsed.playerCount = playerCount;

    return { config: parsed, error: null, raw: cleaned };
  } catch (err: any) {
    console.error("parseGameConfig error:", err);
    return {
      config: null,
      error: err?.message || "Unknown error parsing game config.",
      raw: "",
    };
  }
}