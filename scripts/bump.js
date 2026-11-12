#!/usr/bin/env node
/**
 * Bump de version semver : met à jour manifest.json et CHANGELOG.md.
 * Usage : node scripts/bump.js patch|minor|major
 * - incrémente la version du manifest
 * - déplace la section [Unreleased] du CHANGELOG vers [x.y.z] - <date du jour>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const type = process.argv[2];
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('usage: node scripts/bump.js patch|minor|major');
  process.exit(1);
}

// 1) manifest.json
const mPath = path.join(ROOT, 'manifest.json');
const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
const [maj, min, pat] = m.version.split('.').map(Number);
let v;
if (type === 'major') v = `${maj + 1}.0.0`;
else if (type === 'minor') v = `${maj}.${min + 1}.0`;
else v = `${maj}.${min}.${pat + 1}`;
m.version = v;
fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n');
console.log(`manifest.json -> ${v}`);

// 2) CHANGELOG.md : [Unreleased] devient [v] - date
const cPath = path.join(ROOT, 'CHANGELOG.md');
let c = fs.readFileSync(cPath, 'utf8');
const today = new Date().toISOString().slice(0, 10);
const unreleased = '## [Unreleased]';
const versionHeader = `## [${v}] - ${today}`;
if (!c.includes(unreleased)) {
  console.error('CHANGELOG.md: section [Unreleased] introuvable');
  process.exit(1);
}
c = c.replace(unreleased, `${unreleased}\n\n${versionHeader}`);
// si la section [Unreleased] était vide, on la laisse vide pour la suite — ok
fs.writeFileSync(cPath, c);
console.log(`CHANGELOG.md -> section [${v}] - ${today}`);
console.log(v);
