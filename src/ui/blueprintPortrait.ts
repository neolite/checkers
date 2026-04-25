import type { FactionId } from '@config/palette';
import type { UnitKind } from '@config/units';
import type { BuildingKind } from '@config/buildings';

export interface BlueprintPortraitSpec {
  faction: FactionId;
  kind: UnitKind | BuildingKind | 'mixed' | 'empty';
  label: string;
  sublabel: string;
  hpPct?: number;
  count?: number;
  isBuilding?: boolean;
}

const FACTION_STYLE: Record<FactionId, { name: string; bg: string; accent: string; dim: string }> = {
  vanguard: { name: 'VNG', bg: '#132232', accent: '#6fb9ff', dim: '#345575' },
  swarm: { name: 'BIO', bg: '#241414', accent: '#ffb15e', dim: '#6b3f2b' },
  titan: { name: 'TIT', bg: '#171423', accent: '#b38cff', dim: '#4b3b77' },
};

export function blueprintPortrait(spec: BlueprintPortraitSpec): string {
  if (spec.kind === 'empty') return emptyPortrait();
  const style = FACTION_STYLE[spec.faction];
  const silhouette = spec.kind === 'mixed'
    ? mixedSilhouette(style)
    : spec.isBuilding
      ? buildingSilhouette(spec.kind as BuildingKind, spec.faction, style)
      : unitSilhouette(spec.kind as UnitKind, spec.faction, style);
  const hp = spec.hpPct === undefined ? '' : `
    <div class="bp-hp"><div style="width:${pct(spec.hpPct)}%; background:${hpColor(spec.hpPct)}"></div></div>
  `;
  return `
    <div class="bp-card bp-${spec.faction}">
      <div class="bp-frame">
        <svg class="bp-svg" viewBox="0 0 160 110" role="img" aria-label="${escapeHtml(spec.label)} blueprint">
          <defs>
            <linearGradient id="bp-bg-${spec.faction}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="${style.bg}"/>
              <stop offset="1" stop-color="#05070b"/>
            </linearGradient>
            <pattern id="bp-grid-${spec.faction}" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="${style.dim}" stroke-width="0.45" opacity="0.55"/>
            </pattern>
          </defs>
          <rect x="1" y="1" width="158" height="108" rx="4" fill="url(#bp-bg-${spec.faction})" stroke="${style.accent}" stroke-opacity="0.7"/>
          <rect x="1" y="1" width="158" height="108" rx="4" fill="url(#bp-grid-${spec.faction})" opacity="0.6"/>
          <path d="M8 20 H45 M115 20 H152 M8 90 H45 M115 90 H152" stroke="${style.accent}" stroke-width="1" opacity="0.55"/>
          <text x="10" y="14" fill="${style.accent}" font-size="8" font-family="monospace" opacity="0.8">${style.name}</text>
          <text x="122" y="14" fill="${style.accent}" font-size="8" font-family="monospace" opacity="0.55">${spec.isBuilding ? 'STRUCT' : 'UNIT'}</text>
          ${silhouette}
          ${spec.count && spec.count > 1 ? `<text x="136" y="98" fill="${style.accent}" font-size="18" font-weight="700" font-family="monospace">x${spec.count}</text>` : ''}
        </svg>
        <div class="bp-scanline"></div>
      </div>
      <div class="bp-copy">
        <div class="bp-name">${escapeHtml(spec.label)}</div>
        <div class="bp-sub">${escapeHtml(spec.sublabel)}</div>
        ${hp}
      </div>
    </div>
  `;
}

function unitSilhouette(kind: UnitKind, faction: FactionId, style: { accent: string; dim: string }): string {
  if (faction === 'swarm') return swarmUnit(kind, style);
  if (faction === 'titan') return titanUnit(kind, style);
  return vanguardUnit(kind, style);
}

function buildingSilhouette(kind: BuildingKind, faction: FactionId, style: { accent: string; dim: string }): string {
  if (faction === 'swarm') return swarmBuilding(kind, style);
  if (faction === 'titan') return titanBuilding(kind, style);
  return vanguardBuilding(kind, style);
}

function vanguardUnit(kind: UnitKind, s: { accent: string; dim: string }): string {
  if (kind.includes('Tank') || kind === 'battleTank') {
    return `<g fill="none" stroke="${s.accent}" stroke-width="3" stroke-linejoin="round">
      <path d="M42 72 H118 L128 84 H32 Z" fill="${s.dim}" fill-opacity="0.45"/>
      <rect x="55" y="48" width="44" height="22" rx="3"/>
      <path d="M98 58 H134"/>
      <circle cx="52" cy="84" r="5"/><circle cx="78" cy="84" r="5"/><circle cx="104" cy="84" r="5"/>
    </g>`;
  }
  return `<g fill="none" stroke="${s.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="78" cy="34" r="13" fill="${s.dim}" fill-opacity="0.45"/>
    <path d="M61 55 H96 L103 82 H54 Z"/>
    <path d="M95 58 L132 49 M101 64 L134 64"/>
    <path d="M64 82 L56 100 M92 82 L102 100"/>
  </g>`;
}

function swarmUnit(kind: UnitKind, s: { accent: string; dim: string }): string {
  if (kind === 'swarmlet') {
    return `<g fill="none" stroke="${s.accent}" stroke-width="3" stroke-linecap="round">
      <path d="M80 38 C106 44 117 66 96 82 C77 96 48 83 48 61 C48 43 61 34 80 38 Z" fill="${s.dim}" fill-opacity="0.5"/>
      <path d="M56 56 C35 44 28 60 18 50 M101 59 C126 43 132 61 144 52"/>
      <path d="M68 33 L54 19 M91 36 L105 20"/>
      <circle cx="79" cy="61" r="7" fill="${s.accent}" fill-opacity="0.45"/>
    </g>`;
  }
  return `<g fill="none" stroke="${s.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M80 20 C111 33 117 66 91 91 C64 87 46 68 54 38 C61 27 69 21 80 20 Z" fill="${s.dim}" fill-opacity="0.48"/>
    <path d="M58 50 C34 47 30 28 16 24 M101 50 C126 42 128 25 144 21"/>
    <path d="M62 71 C42 79 35 95 25 99 M98 72 C119 78 127 94 138 100"/>
    <path d="M72 40 C77 36 84 36 90 41"/>
    <circle cx="71" cy="55" r="4" fill="${s.accent}"/><circle cx="90" cy="55" r="4" fill="${s.accent}"/>
  </g>`;
}

function titanUnit(kind: UnitKind, s: { accent: string; dim: string }): string {
  if (kind === 'railgun') {
    return `<g fill="none" stroke="${s.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M47 86 H103 L114 101 H36 Z" fill="${s.dim}" fill-opacity="0.42"/>
      <rect x="58" y="39" width="38" height="48" rx="3"/>
      <path d="M77 38 V18 M94 55 H142 M100 65 H142"/>
      <circle cx="77" cy="28" r="9" fill="${s.accent}" fill-opacity="0.35"/>
    </g>`;
  }
  return `<g fill="none" stroke="${s.accent}" stroke-width="3" stroke-linejoin="round">
    <path d="M62 30 H98 L107 58 L96 88 H63 L52 58 Z" fill="${s.dim}" fill-opacity="0.42"/>
    <path d="M80 30 V13 M55 60 H31 M105 60 H130"/>
    <path d="M66 88 L58 104 M94 88 L103 104"/>
    <circle cx="80" cy="55" r="11" fill="${s.accent}" fill-opacity="0.32"/>
  </g>`;
}

function vanguardBuilding(kind: BuildingKind, s: { accent: string; dim: string }): string {
  return `<g fill="none" stroke="${s.accent}" stroke-width="3" stroke-linejoin="round">
    <path d="M31 91 H129 V64 L114 49 H94 L82 34 H54 L43 49 H31 Z" fill="${s.dim}" fill-opacity="0.42"/>
    <path d="M48 91 V65 H73 V91 M89 91 V59 H114 V91"/>
    ${kind === 'turret' ? '<path d="M80 55 H133 M80 55 V38"/>' : '<path d="M52 49 H111 M60 34 H83"/>'}
  </g>`;
}

function swarmBuilding(kind: BuildingKind, s: { accent: string; dim: string }): string {
  return `<g fill="none" stroke="${s.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M34 92 C34 57 54 25 82 23 C110 29 128 58 124 92 Z" fill="${s.dim}" fill-opacity="0.48"/>
    <path d="M50 92 C47 69 60 50 80 43 C101 50 114 69 108 92"/>
    <path d="M37 75 C21 68 17 52 10 43 M122 75 C138 68 143 52 151 43"/>
    ${kind === 'power' ? `<circle cx="80" cy="58" r="16" fill="${s.accent}" fill-opacity="0.25"/>` : '<path d="M69 58 C76 52 86 52 94 58"/>'}
  </g>`;
}

function titanBuilding(kind: BuildingKind, s: { accent: string; dim: string }): string {
  return `<g fill="none" stroke="${s.accent}" stroke-width="3" stroke-linejoin="round">
    <path d="M43 94 H117 L108 39 L91 21 H68 L52 39 Z" fill="${s.dim}" fill-opacity="0.42"/>
    <path d="M68 21 L80 94 M91 21 L80 94 M52 39 H108"/>
    ${kind === 'tech' || kind === 'hq' ? `<circle cx="80" cy="55" r="17" fill="${s.accent}" fill-opacity="0.25"/>` : '<path d="M61 73 H99 M65 87 H95"/>'}
  </g>`;
}

function mixedSilhouette(s: { accent: string; dim: string }): string {
  return `<g fill="none" stroke="${s.accent}" stroke-width="3" stroke-linejoin="round">
    <rect x="34" y="52" width="30" height="34" rx="4" fill="${s.dim}" fill-opacity="0.38"/>
    <rect x="68" y="34" width="32" height="52" rx="4" fill="${s.dim}" fill-opacity="0.38"/>
    <rect x="104" y="44" width="24" height="42" rx="4" fill="${s.dim}" fill-opacity="0.38"/>
    <path d="M28 93 H134"/>
  </g>`;
}

function emptyPortrait(): string {
  return `
    <div class="bp-card bp-empty">
      <div class="bp-frame">
        <svg class="bp-svg" viewBox="0 0 160 110" role="img" aria-label="empty blueprint">
          <rect x="1" y="1" width="158" height="108" rx="4" fill="#090d14" stroke="#334155"/>
          <path d="M35 55 H125 M80 25 V85" stroke="#334155" stroke-width="2" opacity="0.65"/>
        </svg>
      </div>
      <div class="bp-copy">
        <div class="bp-name">No blueprint</div>
        <div class="bp-sub">Select a unit or structure</div>
      </div>
    </div>
  `;
}

function pct(v: number): number {
  return Math.max(0, Math.min(100, v * 100));
}

function hpColor(v: number): string {
  if (v > 0.5) return '#7ef5b3';
  if (v > 0.25) return '#ffd863';
  return '#ff6e6e';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
