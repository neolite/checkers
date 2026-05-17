import { chooseAiMove } from './ai';
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

export function buildCoachReport(history: readonly CheckersHistoryEntry[], finalState: CheckersState): CoachReport {
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
        title: `Move ${index + 1}: bigger combo was available`,
        body: best
          ? `${formatMove(entry.move)} took ${entry.move.captures.length}; ${formatMove(best)} could take ${maxCaptures}.`
          : `${formatMove(entry.move)} left a stronger capture sequence on the board.`,
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
        title: `Move ${index + 1}: opponent got a forcing reply`,
        body: `${formatMove(entry.move)} allowed ${formatMove(reply)}. Look for moves that keep the diagonal closed.`,
      });
    }
  });

  score += captures * 3 + promotions * 7 - biggerCombosMissed * 12 - punishableQuietMoves * 7;

  const result = getGameResult(finalState);
  if (result?.winner === 'white') score += 12;
  if (result?.winner === 'black') score -= 8;
  if (result?.winner === null) score += 4;

  const boundedScore = Math.max(0, Math.min(100, score));
  const fallbackInsight = makeFallbackInsight(captures, promotions, biggerCombosMissed, punishableQuietMoves);
  const finalInsights = insights.slice(0, 4);
  if (finalInsights.length === 0) finalInsights.push(fallbackInsight);

  return {
    score: boundedScore,
    headline: headlineForScore(boundedScore),
    summary: `${captures} captures, ${promotions} promotions, ${biggerCombosMissed} missed combo windows.`,
    insights: finalInsights,
  };
}

export function getLiveCoachTip(state: CheckersState, depth = 2): string {
  const moves = generateLegalMoves(state);
  if (moves.length === 0) return 'No legal move. The position is decided.';
  const captures = moves.filter((m) => m.captures.length > 0);
  if (captures.length > 0) {
    const bestCapture = captures.reduce((best, move) => (move.captures.length > best.captures.length ? move : best), captures[0]!);
    return `Forced jump: ${formatMove(bestCapture)} wins ${bestCapture.captures.length}.`;
  }

  const best = chooseAiMove(state, depth) ?? moves[0]!;
  const final = best.path[best.path.length - 1]!;
  const centerDelta = Math.abs(best.from.x - 3.5) + Math.abs(best.from.y - 3.5) - Math.abs(final.x - 3.5) - Math.abs(final.y - 3.5);
  if (best.promotes) return `Candidate: ${formatMove(best)} reaches king row.`;
  if (centerDelta > 0) return `Candidate: ${formatMove(best)} improves center control.`;
  return `Candidate: ${formatMove(best)} keeps tempo without exposing a capture.`;
}

export function formatMove(move: CheckersMove): string {
  return `${coord(move.from)}-${move.path.map(coord).join('-')}`;
}

function makeFallbackInsight(captures: number, promotions: number, biggerCombosMissed: number, punishableQuietMoves: number): CoachInsight {
  if (biggerCombosMissed === 0 && punishableQuietMoves === 0) {
    return {
      tone: 'good',
      title: 'Clean tactical profile',
      body: captures > 0
        ? `You converted ${captures} capture${captures === 1 ? '' : 's'} without leaving obvious forced replies.`
        : 'No major tactical leaks detected. Try creating forcing capture threats earlier.',
    };
  }
  if (promotions > 0) {
    return {
      tone: 'good',
      title: 'Promotion pressure worked',
      body: `You reached king row ${promotions} time${promotions === 1 ? '' : 's'}. Build more plans around that lane.`,
    };
  }
  return {
    tone: 'idea',
    title: 'Next training focus',
    body: 'Before every quiet move, scan the four diagonals for a forcing reply.',
  };
}

function headlineForScore(score: number): string {
  if (score >= 86) return 'Masterclass';
  if (score >= 72) return 'Strong tactical game';
  if (score >= 55) return 'Playable, with training targets';
  return 'High-risk game';
}

function coord(s: { x: number; y: number }): string {
  return `${String.fromCharCode(97 + s.x)}${8 - s.y}`;
}
