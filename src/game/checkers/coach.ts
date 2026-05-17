import { chooseAiMove } from './ai';
import { t, type Locale } from './i18n';
import {
  applyMove,
  generateLegalMoves,
  getGameResult,
  type CheckersHistoryEntry,
  type CheckersMove,
  type CheckersState,
} from './rules';

export type CoachTone = 'good' | 'warning' | 'idea';

export interface CoachInsight {
  tone: CoachTone;
  title: string;
  body: string;
}

export interface CoachReport {
  score: number;
  headline: string;
  summary: string;
  insights: CoachInsight[];
}

export function buildCoachReport(history: readonly CheckersHistoryEntry[], finalState: CheckersState, locale: Locale = 'en'): CoachReport {
  const insights: CoachInsight[] = [];
  let score = 64;
  let captures = 0;
  let promotions = 0;
  let biggerCombosMissed = 0;
  let punishableQuietMoves = 0;

  history.forEach((entry, index) => {
    const before: CheckersState = {
      turn: entry.turn,
      pieces: entry.pieces.map((p) => ({ ...p })),
      history: history.slice(0, index).map((h) => ({
        turn: h.turn,
        move: h.move,
        pieces: h.pieces.map((p) => ({ ...p })),
      })),
      winner: null,
      resignedBy: null,
    };
    const legal = generateLegalMoves(before);
    const maxCaptures = Math.max(0, ...legal.map((m) => m.captures.length));
    captures += entry.move.captures.length;
    if (entry.move.promotes) promotions += 1;

    if (maxCaptures > entry.move.captures.length) {
      biggerCombosMissed += 1;
      const best = legal.find((m) => m.captures.length === maxCaptures);
      insights.push({
        tone: 'warning',
        title: t(locale, 'report.insight.bigger-combo.title', { n: index + 1 }),
        body: best
          ? t(locale, 'report.insight.bigger-combo.body-known', {
              played: formatMove(entry.move),
              takenN: entry.move.captures.length,
              best: formatMove(best),
              bestN: maxCaptures,
            })
          : t(locale, 'report.insight.bigger-combo.body-unknown', { played: formatMove(entry.move) }),
      });
    }

    const after = applyMove(before, entry.move);
    const replies = generateLegalMoves(after);
    const captureReplies = replies.filter((m) => m.captures.length > 0);
    if (entry.move.captures.length === 0 && captureReplies.length > 0) {
      punishableQuietMoves += 1;
      const reply = captureReplies[0]!;
      insights.push({
        tone: 'idea',
        title: t(locale, 'report.insight.forcing-reply.title', { n: index + 1 }),
        body: t(locale, 'report.insight.forcing-reply.body', { played: formatMove(entry.move), reply: formatMove(reply) }),
      });
    }
  });

  score += captures * 3 + promotions * 7 - biggerCombosMissed * 12 - punishableQuietMoves * 7;

  const result = getGameResult(finalState);
  if (result?.winner === 'white') score += 12;
  if (result?.winner === 'black') score -= 8;
  if (result?.winner === null) score += 4;

  const boundedScore = Math.max(0, Math.min(100, score));
  const fallbackInsight = makeFallbackInsight(captures, promotions, biggerCombosMissed, punishableQuietMoves, locale);
  const finalInsights = insights.slice(0, 4);
  if (finalInsights.length === 0) finalInsights.push(fallbackInsight);

  return {
    score: boundedScore,
    headline: headlineForScore(boundedScore, locale),
    summary: t(locale, 'report.summary', { cap: captures, prom: promotions, miss: biggerCombosMissed }),
    insights: finalInsights,
  };
}

export interface LiveCoachTipMeta {
  key: 'tip.forced-jump' | 'tip.king-row' | 'tip.center-control' | 'tip.tempo' | 'tip.no-legal';
  vars: Record<string, string | number>;
}

export function liveCoachTipMeta(state: CheckersState, depth = 2): LiveCoachTipMeta {
  const moves = generateLegalMoves(state);
  if (moves.length === 0) return { key: 'tip.no-legal', vars: {} };
  const captures = moves.filter((m) => m.captures.length > 0);
  if (captures.length > 0) {
    const bestCapture = captures.reduce((best, move) => (move.captures.length > best.captures.length ? move : best), captures[0]!);
    return { key: 'tip.forced-jump', vars: { move: formatMove(bestCapture), n: bestCapture.captures.length } };
  }

  const best = chooseAiMove(state, depth) ?? moves[0]!;
  const final = best.path[best.path.length - 1]!;
  const centerDelta = Math.abs(best.from.x - 3.5) + Math.abs(best.from.y - 3.5) - Math.abs(final.x - 3.5) - Math.abs(final.y - 3.5);
  if (best.promotes) return { key: 'tip.king-row', vars: { move: formatMove(best) } };
  if (centerDelta > 0) return { key: 'tip.center-control', vars: { move: formatMove(best) } };
  return { key: 'tip.tempo', vars: { move: formatMove(best) } };
}

export function getLiveCoachTip(state: CheckersState, depth = 2, locale: Locale = 'en'): string {
  const meta = liveCoachTipMeta(state, depth);
  return t(locale, meta.key, meta.vars);
}

export function formatMove(move: CheckersMove): string {
  return `${coord(move.from)}-${move.path.map(coord).join('-')}`;
}

function makeFallbackInsight(captures: number, promotions: number, biggerCombosMissed: number, punishableQuietMoves: number, locale: Locale): CoachInsight {
  if (biggerCombosMissed === 0 && punishableQuietMoves === 0) {
    return {
      tone: 'good',
      title: t(locale, 'report.fallback.good.title'),
      body: captures > 0
        ? t(locale, 'report.fallback.good.body-with-cap', { n: captures })
        : t(locale, 'report.fallback.good.body-no-cap'),
    };
  }
  if (promotions > 0) {
    return {
      tone: 'good',
      title: t(locale, 'report.fallback.promotions.title'),
      body: t(locale, 'report.fallback.promotions.body', { n: promotions }),
    };
  }
  return {
    tone: 'idea',
    title: t(locale, 'report.fallback.training.title'),
    body: t(locale, 'report.fallback.training.body'),
  };
}

function headlineForScore(score: number, locale: Locale): string {
  if (score >= 86) return t(locale, 'report.headline.masterclass');
  if (score >= 72) return t(locale, 'report.headline.strong');
  if (score >= 55) return t(locale, 'report.headline.playable');
  return t(locale, 'report.headline.risky');
}

function coord(s: { x: number; y: number }): string {
  return `${String.fromCharCode(97 + s.x)}${8 - s.y}`;
}
