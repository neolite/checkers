export type FieldKind = 'number' | 'bool' | 'color' | 'text';

export interface InspectorField {
  path: string;
  label: string;
  kind: FieldKind;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

export interface InspectorGroup {
  title: string;
  fields: InspectorField[];
}

export interface InspectorCategory {
  title: string;
  groups: InspectorGroup[];
}

type Roots = Record<string, unknown>;

export function buildSchema(roots: Roots): InspectorCategory[] {
  return [
    {
      title: 'Character',
      groups: unitGroups(roots),
    },
    {
      title: 'Structures',
      groups: objectGroups(roots, 'BUILDING_STATS', {
        maxHp: number(50, 5000, 10, 'Total structure health.'),
        cost: number(0, 2000, 10),
        power: number(-80, 120, 1, 'Positive produces power, negative consumes it.'),
        buildMs: number(500, 30000, 100),
        sightRange: number(1, 30, 0.5),
        'weapon.damage': number(1, 200, 1),
        'weapon.range': number(1, 30, 0.5),
        'weapon.cdMs': number(100, 5000, 50),
      }),
    },
    {
      title: 'Input',
      groups: [
        group('Camera', fields('CAMERA', {
          height: number(10, 100, 1),
          distance: number(10, 120, 1),
          angleDeg: number(20, 80, 1),
          panSpeed: number(5, 100, 1),
          edgePad: number(0, 80, 1),
          zoomMin: number(5, 80, 1),
          zoomMax: number(40, 160, 1),
          zoomStep: number(1, 20, 1),
        })),
        group('Selection', fields('UI', {
          selectionMinPx: number(1, 40, 1),
        })),
      ],
    },
    {
      title: 'Enemies',
      groups: [
        group('AI Tuning', fields('AI_TUNING', {
          thinkIntervalMs: number(250, 15000, 250),
          buildTimeMul: number(0.2, 3, 0.05),
          aggressionCooldownMs: number(1000, 60000, 500),
          armyCapInfantry: number(1, 40, 1),
          armyCapTank: number(0, 20, 1),
          armyCapSpecial: number(0, 12, 1),
          workerTarget: number(1, 14, 1),
          warmupMs: number(0, 120000, 1000),
        })),
      ],
    },
    {
      title: 'Combat',
      groups: objectGroups(roots, 'DAMAGE_MATRIX', {
        light: number(0, 4, 0.05),
        medium: number(0, 4, 0.05),
        heavy: number(0, 4, 0.05),
        structure: number(0, 5, 0.05),
      }),
    },
    {
      title: 'Economy',
      groups: [
        group('Economy', fields('ECONOMY', {
          startingCredits: number(0, 10000, 50),
          depositDistance: number(0.2, 5, 0.1),
          harvesterCargoLoads: number(1, 10, 1),
        })),
      ],
    },
    {
      title: 'World',
      groups: [
        group('Map', fields('MAP', {
          tilesX: number(16, 256, 1),
          tilesY: number(16, 256, 1),
          tileSize: number(0.5, 8, 0.25),
        })),
        group('Simulation', fields('SIM', {
          fixedDtMs: number(8, 100, 0.1),
          fogHz: number(1, 30, 1),
          flowFieldHz: number(0.2, 10, 0.1),
        })),
      ],
    },
    {
      title: 'World Colors',
      groups: [
        group('Factions', colorGroups(roots, 'FACTION_COLORS')),
        group('Neutral', fields('NEUTRAL_COLORS', colorSpec(roots, 'NEUTRAL_COLORS'))),
      ],
    },
    {
      title: 'Factions',
      groups: objectGroups(roots, 'FACTIONS', {
        'mods.hpMul': number(0.2, 3, 0.05),
        'mods.speedMul': number(0.2, 3, 0.05),
        'mods.costMul': number(0.2, 3, 0.05),
      }),
    },
    {
      title: 'FX Tuning',
      groups: [
        group('Audio', fields('FX_TUNING.audio', {
          masterGain: number(0, 1, 0.01),
          echoDelay: number(0, 0.8, 0.01),
          echoFeedback: number(0, 0.9, 0.01),
          echoLowpassHz: number(100, 8000, 50),
          echoGain: number(0, 1, 0.01),
          minSpatialGain: number(0, 1, 0.01),
          distanceFalloff: number(5, 120, 1),
          panDivisor: number(10, 120, 1),
        })),
        group('Fog', fields('FX_TUNING.fog', {
          unexploredAlpha: number(0, 255, 1),
          exploredAlpha: number(0, 255, 1),
          overlayY: number(0, 1, 0.01),
        })),
        group('Render', fields('FX_TUNING.render', {
          clearColor: color(),
          gridOpacity: number(0, 1, 0.01),
          terrainRoughnessSeed: number(0, 99999, 1),
        })),
      ],
    },
  ];
}

function unitGroups(roots: Roots): InspectorGroup[] {
  const stats = roots['UNIT_STATS'] as Record<string, unknown> | undefined;
  if (!stats) return [];
  return Object.keys(stats).map((kind) => {
    const base = `UNIT_STATS.${kind}`;
    return group(kind, [
      ...fields(base, {
        maxHp: number(1, 1000, 1),
        cost: number(0, 2000, 5),
        power: number(0, 20, 1),
        buildMs: number(250, 30000, 50),
        speed: number(0.5, 15, 0.1),
        radius: number(0.1, 3, 0.05),
        sightRange: number(1, 40, 0.5),
        'weapon.damage': number(0, 200, 1),
        'weapon.range': number(0.5, 30, 0.1),
        'weapon.cdMs': number(100, 5000, 25),
        'weapon.projectileSpeed': number(0, 120, 1),
        'weapon.splash': number(0, 6, 0.1),
        'weapon.selfDestruct': bool(),
        'harvest.capacity': number(10, 300, 5),
        'harvest.gatherMs': number(500, 10000, 100),
      }),
    ]);
  });
}

function objectGroups(roots: Roots, rootName: string, specs: Record<string, Partial<InspectorField>>): InspectorGroup[] {
  const root = roots[rootName] as Record<string, unknown> | undefined;
  if (!root) return [];
  return Object.keys(root).map((key) => group(key, fields(`${rootName}.${key}`, specs)));
}

function colorGroups(roots: Roots, rootName: string): InspectorField[] {
  const root = roots[rootName] as Record<string, unknown> | undefined;
  if (!root) return [];
  const out: InspectorField[] = [];
  for (const key of Object.keys(root)) {
    out.push({ path: `${rootName}.${key}.primaryCss`, label: `${key} primary`, kind: 'color' });
    out.push({ path: `${rootName}.${key}.accentCss`, label: `${key} accent`, kind: 'color' });
  }
  return out;
}

function colorSpec(roots: Roots, rootName: string): Record<string, Partial<InspectorField>> {
  const root = roots[rootName] as Record<string, unknown> | undefined;
  const spec: Record<string, Partial<InspectorField>> = {};
  for (const key of Object.keys(root ?? {})) spec[key] = color();
  return spec;
}

function fields(base: string, specs: Record<string, Partial<InspectorField>>): InspectorField[] {
  return Object.entries(specs).map(([path, spec]) => ({
    path: `${base}.${path}`,
    label: label(path),
    kind: spec.kind ?? 'number',
    min: spec.min,
    max: spec.max,
    step: spec.step,
    hint: spec.hint,
  }));
}

function group(title: string, fieldsIn: InspectorField[]): InspectorGroup {
  return { title, fields: fieldsIn };
}

function number(min: number, max: number, step: number, hint?: string): Partial<InspectorField> {
  return { kind: 'number', min, max, step, hint };
}

function bool(): Partial<InspectorField> {
  return { kind: 'bool' };
}

function color(): Partial<InspectorField> {
  return { kind: 'color' };
}

function label(path: string): string {
  return path.split('.').at(-1)!.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
