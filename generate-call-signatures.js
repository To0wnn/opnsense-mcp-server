#!/usr/bin/env node
// Genereert call-signatures.json: een tabel van "<module>.<method>" naar de
// exacte positionele-parameternamen van de gegenereerde client-methode, in
// volgorde. Bron van waarheid is de TypeScript-signature zelf (src/core/*.ts
// en src/plugins/*.ts in de client-fork) — die kent de echte parametervolgorde
// al, dus de dispatcher hoeft niet meer te raden op basis van een hardcoded
// 'uuid'-heuristiek (die faalde op 10+ verschillende aanroepvormen, zie
// project_glinet_wireguard.md-review 5 sep 2026).
//
// Draai opnieuw na elke update van de client-fork:
//   node generate-call-signatures.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ROOT = path.join(__dirname, 'node_modules', '@richard-stovall', 'opnsense-typescript-client', 'src');
const OUT_FILE = path.join(__dirname, 'call-signatures.json');

// Regex voor een async methode-declaratie op class-niveau. Multiline-veilig
// genoeg voor deze generatorstijl: signature staat altijd op één regel.
const METHOD_RE = /^\s*async (\w+)\(([^)]*)\)/;

function splitTopLevel(paramsStr) {
  // Split op komma's die niet binnen <...> zitten — nodig sinds
  // Record<string, any> (used for undocumented write-endpoint bodies)
  // zelf een komma bevat.
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of paramsStr) {
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseParams(paramsStr) {
  if (!paramsStr.trim()) return [];
  return splitTopLevel(paramsStr).map((p) => {
    const name = p.trim().split(':')[0].replace('?', '').trim();
    return name;
  }).filter(Boolean);
}

function scanDir(dir, moduleType) {
  const result = {};
  if (!fs.existsSync(dir)) return result;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
    const moduleName = path.basename(file, '.ts');
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(METHOD_RE);
      if (!m) continue;
      const [, methodName, paramsStr] = m;
      const key = `${moduleType === 'plugins' ? 'plugins.' + moduleName : moduleName}.${methodName}`;
      result[key] = parseParams(paramsStr);
    }
  }
  return result;
}

const coreSignatures = scanDir(path.join(CLIENT_ROOT, 'core'), 'core');
const pluginSignatures = scanDir(path.join(CLIENT_ROOT, 'plugins'), 'plugins');
const all = { ...coreSignatures, ...pluginSignatures };

fs.writeFileSync(OUT_FILE, JSON.stringify(all, null, 2) + '\n');
console.error(`Geschreven: ${OUT_FILE} (${Object.keys(all).length} methode-signatures)`);
