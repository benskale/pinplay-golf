import { useState } from "react";
import type { Game } from "@shared/schema";

/**
 * Team Scorecard — a per-hole scorecard of TEAM scores for team-format
 * tournament games (best ball, scramble). One row per team, one column per
 * hole, front/back/total, with a gross ↔ net toggle. Team score per hole:
 *  - scramble-like: the single team ball
 *  - own-ball (best ball): best gross on the hole (gross view) / best net
 *    (net view, handicap strokes applied per hole)
 */
interface Props {
  games: Game[];
  teams: Array<{ id: number; teamName: string; teamColor: string }>;
  players: Array<{ playerName: string; teamId: number | null; handicap?: number | null }>;
}

export default function TeamScorecard({ games, teams, players }: Props) {
  const [view, setView] = useState<"gross" | "net">("gross");

  // Roster per team (from tournament players); fall back to game.teams split
  const rosterFor = (teamId: number) =>
    players.filter(p => p.teamId === teamId).map(p => p.playerName);

  // Assemble team rows from live games
  const rows: Array<{
    name: string; color: string; members: string[];
    holes: Array<number | null>; pars: number[]; total: number | null;
  }> = [];

  for (const g of games) {
    const strokeIdxs = (g.strokeIndexes as number[] | null) || [];
    const pars = (g.pars as number[] | null) || Array.from({ length: 18 }, () => 4);
    const hh = (g.holeHistory as Array<{ hole: number; strokes?: Record<string, number> }>) || [];
    const hcps = (g.handicaps as Record<string, number>) || {};

    let gameTeams: string[][] = [];
    if (Array.isArray(g.teams) && g.teams.length > 0) {
      gameTeams = g.teams as string[][];
    } else {
      // derive from tournament roster
      const seen = new Set<string>();
      for (const t of teams) {
        const roster = rosterFor(t.id).filter(p => (g.players as string[]).includes(p));
        if (roster.length > 0) { gameTeams.push(roster); roster.forEach(p => seen.add(p)); }
      }
      const leftover = (g.players as string[]).filter(p => !seen.has(p));
      if (leftover.length > 0) gameTeams.push(leftover);
    }

    const isScramble = String(g.gameType || "").includes("scramble");

    for (const roster of gameTeams) {
      // match a real tournament team by roster overlap
      const tidOverlap = players.filter(p => roster.includes(p.playerName) && p.teamId != null).map(p => p.teamId!);
      const tTeam = teams.find(t => tidOverlap.includes(t.id));
      const name = tTeam?.teamName ?? roster.map(p => p.split(" ")[0]).join("+");
      const color = tTeam?.teamColor ?? "#2e7d52";

      const holes: Array<number | null> = [];
      for (let h = 1; h <= 18; h++) {
        const rec = hh.find(x => x.hole === h);
        const par = pars[h - 1] ?? 4;
        if (!rec) { holes.push(null); continue; }
        const s = rec.strokes || {};
        if (isScramble) {
          const scorer = roster.find(p => s[p] != null && s[p] > 0);
          holes.push(scorer ? s[scorer] : null);
        } else if (view === "gross") {
          const best = roster.reduce((min, p) => {
            const v = s[p];
            return v != null && v > 0 ? Math.min(min, v) : min;
          }, Infinity);
          holes.push(best !== Infinity ? best : null);
        } else {
          const sIdx = strokeIdxs[h - 1] ?? h;
          const best = roster.reduce((min, p) => {
            const v = s[p];
            if (v == null || v === 0) return min;
            const hc = hcps[p] || 0;
            const strokes = Math.floor(hc / 18) + ((hc % 18) >= sIdx ? 1 : 0);
            return Math.min(min, v - strokes);
          }, Infinity);
          holes.push(best !== Infinity ? best : null);
        }
      }
      const played = holes.filter(v => v != null) as number[];
      rows.push({ name, color, members: roster, holes, pars, total: played.length ? played.reduce((a, b) => a + b, 0) : null });
    }
  }

  if (rows.length === 0) return null;

  // Sort by to-par over holes played (leaderboard convention): -1 beats E beats +2,
  // regardless of holes completed or raw strokes.
  const totalSeg = (r: typeof rows[0]) => { let s = 0, par = 0; for (let i = 0; i < r.holes.length; i++) { if (r.holes[i] != null) { s += r.holes[i]!; par += r.pars[i] ?? 4; } } return s - par; };
  rows.sort((a, b) => totalSeg(a) - totalSeg(b));

  // Strokes AND par counted only over holes actually played in each segment:
  // to-par = strokes − par(played holes), never against the full nine/18.
  const seg = (r: typeof rows[0], from: number, to: number) => {
    let strokes = 0, par = 0, played = 0;
    for (let i = from; i < to && i < r.holes.length; i++) {
      if (r.holes[i] != null) { strokes += r.holes[i]!; par += r.pars[i] ?? 4; played++; }
    }
    return { strokes, par, played };
  };
  const toPar = (v: number, par: number) => { const d = v - par; return d === 0 ? "E" : d > 0 ? `+${d}` : `${d}`; };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Gross / Net toggle */}
      <div className="flex gap-1 p-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {(["gross", "net"] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              view === v
                ? "bg-[#18181B] text-white"
                : "bg-white dark:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-300"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[0.6875rem] tabular-nums">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              <th className="sticky left-0 bg-gray-50 dark:bg-gray-800 px-2 py-2 text-left font-semibold z-10">Team</th>
              <th className="px-1.5 py-2 text-center font-semibold text-muted-foreground">OUT</th>
              {Array.from({ length: 9 }, (_, i) => (
                <th key={i} className="px-1.5 py-2 text-center font-semibold w-8">{i + 1}</th>
              ))}
              <th className="px-1.5 py-2 text-center font-semibold text-muted-foreground">IN</th>
              {Array.from({ length: 9 }, (_, i) => (
                <th key={i + 9} className="px-1.5 py-2 text-center font-semibold w-8">{i + 10}</th>
              ))}
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground">TOT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} className="border-t border-gray-100 dark:border-gray-800">
                <td className="sticky left-0 bg-white dark:bg-gray-900 px-2 py-2 z-10 max-w-[110px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">{r.name}</span>
                  </div>
                </td>
                <td className="px-1.5 py-2 text-center font-bold text-gray-700 dark:text-gray-300">
                  {(() => { const f = seg(r, 0, 9); return f.played ? `${f.strokes} (${toPar(f.strokes, f.par)})` : "—"; })()}
                </td>
                {r.holes.slice(0, 9).map((v, i) => (
                  <td key={i} className={`px-1.5 py-2 text-center font-semibold ${
                    v == null ? "text-gray-300 dark:text-gray-600"
                    : v - (r.pars[i] ?? 4) <= -2 ? "bg-yellow-100/70 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-md"
                    : v - (r.pars[i] ?? 4) === -1 ? "bg-green-100/70 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md"
                    : v - (r.pars[i] ?? 4) === 0 ? "text-gray-700 dark:text-gray-300"
                    : "bg-red-100/60 dark:bg-red-900/25 text-red-600 dark:text-red-400 rounded-md"
                  }`}>{v ?? "-"}</td>
                ))}
                <td className="px-1.5 py-2 text-center font-bold text-gray-700 dark:text-gray-300">
                  {(() => { const b = seg(r, 9, 18); return b.played ? `${b.strokes} (${toPar(b.strokes, b.par)})` : "—"; })()}
                </td>
                {r.holes.slice(9).map((v, i) => (
                  <td key={i + 9} className={`px-1.5 py-2 text-center font-semibold ${
                    v == null ? "text-gray-300 dark:text-gray-600"
                    : v - (r.pars[i + 9] ?? 4) <= -2 ? "bg-yellow-100/70 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-md"
                    : v - (r.pars[i + 9] ?? 4) === -1 ? "bg-green-100/70 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md"
                    : v - (r.pars[i + 9] ?? 4) === 0 ? "text-gray-700 dark:text-gray-300"
                    : "bg-red-100/60 dark:bg-red-900/25 text-red-600 dark:text-red-400 rounded-md"
                  }`}>{v ?? "-"}</td>
                ))}
                <td className="px-2 py-2 text-center font-bold text-gray-900 dark:text-white">
                  {(() => { const a = seg(r, 0, 18); return a.played ? `${a.strokes} (${toPar(a.strokes, a.par)})` : "—"; })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-[0.625rem] text-gray-400 border-t border-gray-100 dark:border-gray-800">
        Team score per hole{view === "net" ? " · net (handicap strokes applied)" : ""}. Tap Gross/Net above to switch.
      </p>
    </div>
  );
}
