#!/usr/bin/env node
/**
 * Extrait la section d'une version depuis CHANGELOG.md (notes de release).
 * Usage : node scripts/release-notes.js 1.2.3 > notes.md
 */
'use strict';
const fs = require('fs');
const path = require('path');
const v = process.argv[2];
if (!v) { console.error('usage: node scripts/release-notes.js <version>'); process.exit(1); }
const c = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const start = c.indexOf(`## [${v}]`);
if (start === -1) { console.error(`section [${v}] introuvable dans CHANGELOG.md`); process.exit(1); }
let rest = c.slice(start);
const next = rest.indexOf('\n## [', 1);
const section = next === -1 ? rest : rest.slice(0, next);
process.stdout.write(section.trim() + '\n');
