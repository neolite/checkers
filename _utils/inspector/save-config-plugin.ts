import type { Plugin } from 'vite';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';

interface SaveChange {
  path: string;
  value: unknown;
}

interface SaveRequest {
  changes: SaveChange[];
}

const ROOT_FILES: Record<string, string> = {
  MAP: 'gameplay.ts',
  WORLD: 'gameplay.ts',
  SIM: 'gameplay.ts',
  CAMERA: 'gameplay.ts',
  FOG: 'gameplay.ts',
  ECONOMY: 'gameplay.ts',
  VICTORY: 'gameplay.ts',
  AI_TUNING: 'gameplay.ts',
  UI: 'gameplay.ts',
  BUILDING_STATS: 'buildings.ts',
  UNIT_STATS: 'units.ts',
  DAMAGE_MATRIX: 'matrix.ts',
  FACTIONS: 'factions.ts',
  FACTION_COLORS: 'palette.ts',
  NEUTRAL_COLORS: 'palette.ts',
  PLAYER_COLOR: 'palette.ts',
  ENEMY_COLOR: 'palette.ts',
  FX_TUNING: 'fx.ts',
  UI_LAYOUT: 'uiLayout.ts',
};

export function saveConfigPlugin(): Plugin {
  let rootDir = process.cwd();
  return {
    name: 'save-config',
    apply: 'serve',
    configResolved(config) {
      rootDir = config.root;
    },
    configureServer(server) {
      server.middlewares.use('/_utils/save-config', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        try {
          const body = await readJson(req) as SaveRequest;
          const changed = await saveConfig(rootDir, body.changes ?? []);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, changed }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        }
      });
    },
  };
}

async function saveConfig(rootDir: string, changes: SaveChange[]): Promise<string[]> {
  const byFile = new Map<string, SaveChange[]>();
  for (const change of changes) {
    const rootName = change.path.split('.')[0];
    if (!rootName) continue;
    const file = ROOT_FILES[rootName];
    if (!file) continue;
    const abs = path.join(rootDir, 'src/config', file);
    const list = byFile.get(abs) ?? [];
    list.push(change);
    byFile.set(abs, list);
  }

  const touched: string[] = [];
  for (const [file, fileChanges] of byFile) {
    const before = await fs.readFile(file, 'utf8');
    const after = applyChanges(before, file, fileChanges);
    if (after !== before) {
      await fs.writeFile(file, after);
      touched.push(path.relative(rootDir, file));
    }
  }
  return touched;
}

function applyChanges(sourceText: string, fileName: string, changes: SaveChange[]): string {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits: Array<{ start: number; end: number; text: string }> = [];

  for (const change of changes) {
    const parts = change.path.split('.');
    const rootName = parts.shift();
    if (!rootName) continue;
    const root = findExportConst(source, rootName);
    if (!root) continue;
    const target = parts.length === 0 ? root : findPathNode(unwrap(root), parts);
    if (!target) continue;
    edits.push({ start: target.getStart(source), end: target.getEnd(), text: printValue(change.value, sourceText.slice(target.getStart(source), target.getEnd())) });
  }

  edits.sort((a, b) => b.start - a.start);
  let out = sourceText;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

function findExportConst(source: ts.SourceFile, name: string): ts.Expression | null {
  for (const stmt of source.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      if (decl.name.text === name && decl.initializer) return decl.initializer;
    }
  }
  return null;
}

function findPathNode(root: ts.Expression, parts: string[]): ts.Expression | null {
  let current: ts.Expression | null = root;
  for (const part of parts) {
    current = findObjectProperty(unwrap(current), part);
    if (!current) return null;
  }
  return current;
}

function findObjectProperty(node: ts.Expression, key: string): ts.Expression | null {
  const unwrapped = unwrap(node);
  if (!ts.isObjectLiteralExpression(unwrapped)) return null;
  for (const prop of unwrapped.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = propertyName(prop.name);
    if (name === key) return prop.initializer;
  }
  return null;
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function printValue(value: unknown, existing: string): string {
  if (typeof value === 'string') {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'number') {
    if (/^0x[0-9a-f]+$/i.test(existing.trim())) return `0x${Math.max(0, Math.round(value)).toString(16)}`;
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(value, null, 2);
}

function readJson(req: NodeJS.ReadableStream): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}
