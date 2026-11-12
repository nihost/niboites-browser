# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage sémantique (semver).

## [Unreleased]

## [1.0.0] - 2026-11-10

### Ajouté
- Extension navigateur MV3 (Chrome / Edge / Firefox) « NiBoites by NiHost » : liste des boîtes et serveurs, statut en temps réel
- Contrôle power : démarrer / arrêter / redémarrer / tuer un serveur
- Console : envoi de commandes au serveur
- Backups : liste, déclenchement, restauration (`truncate` optionnel) et suppression
- Planifications : liste, exécution immédiate, activation, création et suppression de tâches cron (UTC)
- Métriques serveur : état, CPU %, barres mémoire / disque utilisées
- Infos SFTP (hôte, port, identifiant — le mot de passe reste dans le panel)
- Actualisation automatique configurable, badge « serveurs en ligne », raccourci `Ctrl+Shift+R`, notifications de changement d'état
- Jeton API stocké localement (`chrome.storage.local`), jamais transmis ailleurs qu'à `boites.ni-host.com`
- Marque NiHost : palette officielle, thème clair + sombre, Raleway / Montserrat, logo officiel (boîte-cookie), terminologie « boîte/boîtes », FR-first, a11y (focus visibles, clavier)
- CI GitHub Actions : validation du manifest MV3, des locales et des JS, packaging `.zip` en artifact
- Script `scripts/build.sh` (validation + zip), `scripts/validate-manifest.js`
- Licence MIT, dépôt public github.com/nihost/niboites-browser
