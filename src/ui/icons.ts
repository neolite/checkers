// Inline SVG icons using currentColor for per-role tinting.
// Kept compact: one small motif per action.

export type IconName =
  | 'worker' | 'infantry' | 'tank' | 'special' | 'drone' | 'atGrenadier'
  | 'hq' | 'power' | 'refinery' | 'barracks' | 'factory' | 'tech' | 'turret'
  | 'stop' | 'attack' | 'move';

export function icon(name: IconName): string {
  switch (name) {
    case 'worker':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3"/><path d="M5 20c1-5 4-7 7-7s6 2 7 7"/></svg>';
    case 'infantry':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="6" r="2.5"/><path d="M8 20l1-6h6l1 6M7 12l10-2"/></svg>';
    case 'tank':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="5" rx="1"/><rect x="7" y="7" width="10" height="4" rx="1"/><path d="M14 9h6"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg>';
    case 'special':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z"/></svg>';
    case 'drone':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="2.5"/><path d="M6 6h5M13 6h5M6 18h5M13 18h5M6 6l2 3M18 6l-2 3M6 18l2-3M18 18l-2-3"/></svg>';
    case 'atGrenadier':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="6" r="2.4"/><path d="M7 20l1-7h5l1 7M15 8l4 3-3 4M14 10l5 4M6 12h8"/></svg>';
    case 'hq':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="9" width="14" height="11"/><path d="M12 3v6M8 20v-4h8v4"/></svg>';
    case 'power':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>';
    case 'refinery':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="12" width="16" height="8"/><circle cx="9" cy="8" r="3"/><path d="M15 8v4M17 6l3-2"/></svg>';
    case 'barracks':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20V9l9-6 9 6v11"/><path d="M9 20v-6h6v6"/></svg>';
    case 'factory':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20V9l5 4V9l5 4V9l6 4v7z"/><circle cx="7" cy="6" r="1.5"/></svg>';
    case 'tech':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l9 6-9 6-9-6z"/><path d="M3 9v6l9 6 9-6V9"/></svg>';
    case 'turret':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="15" r="4"/><path d="M12 11V5M10 5h4"/></svg>';
    case 'stop':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="6" width="12" height="12"/></svg>';
    case 'attack':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7"/><path d="M12 5v14M5 12h14"/></svg>';
    case 'move':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>';
  }
}
