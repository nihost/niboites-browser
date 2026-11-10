#!/usr/bin/env node
/**
 * Validation structurelle du manifest MV3 de NiBoites.
 * Vérifie que toutes les ressources référencées existent et que les
 * champs obligatoires sont présents/valides. Exit 1 si invalide.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let errors = 0;
const err = (msg) => { console.error('  ERREUR ' + msg); errors++; };
const ok = (msg) => console.log('  OK ' + msg);

const manifestPath = path.join(ROOT, 'manifest.json');
if (!fs.existsSync(manifestPath)) { console.error('manifest.json introuvable'); process.exit(1); }
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Champs obligatoires MV3
if (m.manifest_version !== 3) err('manifest_version doit être 3');
else ok('manifest_version = 3');
for (const k of ['name', 'version', 'description']) {
  if (!m[k] || typeof m[k] !== 'string') err(`champ requis manquant: ${k}`);
}
if (m.name && m.name.length > 45) err('name > 45 caractères (limite store)');
if (m.description && m.description.length > 132) err('description > 132 caractères (limite store)');
if (!/^\d+\.\d+\.\d+$/.test(m.version || '')) err('version doit être semver x.y.z');
else ok(`version ${m.version}`);

// Fichiers référencés existent
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const checkFile = (p, label) => {
  if (!p) return;
  if (exists(p)) ok(`${label}: ${p}`);
  else err(`${label} introuvable: ${p}`);
};

for (const [size, p] of Object.entries(m.icons || {})) checkFile(p, `icons[${size}]`);
if (m.action) {
  checkFile(m.action.default_popup, 'action.default_popup');
  for (const [size, p] of Object.entries(m.action.default_icon || {})) checkFile(p, `action.default_icon[${size}]`);
}
checkFile(m.options_page, 'options_page');
checkFile(m.background && m.background.service_worker, 'background.service_worker');

// default_locale cohérent avec _locales/
if (m.default_locale) {
  const loc = path.join(ROOT, '_locales', m.default_locale, 'messages.json');
  if (exists(path.join('_locales', m.default_locale, 'messages.json'))) ok(`default_locale ${m.default_locale} présent`);
  else err(`default_locale ${m.default_locale} sans _locales/${m.default_locale}/messages.json`);
  // chaque locale doit être un JSON valide
  const locDir = path.join(ROOT, '_locales');
  if (fs.existsSync(locDir)) {
    for (const d of fs.readdirSync(locDir)) {
      const f = path.join(locDir, d, 'messages.json');
      if (fs.existsSync(f)) {
        try { JSON.parse(fs.readFileSync(f, 'utf8')); ok(`_locales/${d}/messages.json valide`); }
        catch (e) { err(`_locales/${d}/messages.json invalide: ${e.message}`); }
      }
    }
  }
}

// host_permissions : schémas https uniquement
for (const h of m.host_permissions || []) {
  if (!/^https:\/\/[^/]+\/\*?$/.test(h)) err(`host_permission non-https suspecte: ${h}`);
}
ok(`host_permissions: ${(m.host_permissions || []).length}`);

// permissions : whitelist MV3 connue
if (Array.isArray(m.permissions)) ok(`permissions: ${m.permissions.join(', ')}`);

// scripts référencés dans les HTML existent
for (const html of ['popup/popup.html', 'options/options.html']) {
  const f = path.join(ROOT, html);
  if (!fs.existsSync(f)) continue;
  const content = fs.readFileSync(f, 'utf8');
  const dir = path.dirname(html);
  for (const match of content.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const ref = match[1];
    if (/^(https?:|data:|#)/.test(ref)) continue;
    const resolved = path.normalize(path.join(dir, ref));
    if (!exists(resolved)) err(`${html} référence un fichier inexistant: ${ref}`);
  }
  ok(`${html}: références internes résolues`);
}

if (errors) { console.error(`\n${errors} erreur(s)`); process.exit(1); }
console.log('\nManifest MV3 valide.');
