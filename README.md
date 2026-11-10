# NiHost Boîtes — Extension navigateur

Extension Chrome / Edge / Firefox (Manifest V3) pour contrôler et gérer vos **boîtes et serveurs NiHost** directement depuis votre navigateur, via l'[API publique](https://boites.ni-host.com/docs).

![NiHost](icons/icon128.png)

## Fonctionnalités

- 📦 **Liste de vos boîtes** avec leurs specs (RAM, CPU, disque, nombre max de serveurs)
- 🖥 **Serveurs par boîte** avec statut en temps réel (en ligne / arrêté / démarrage…)
- ▶️ ⏹ ⟳ ✕ **Contrôle power** : démarrer, arrêter, redémarrer, tuer un serveur en un clic
- ⌨️ **Console** : envoyer des commandes directement au serveur
- 💾 **Backups** : voir la liste et déclencher un backup immédiat
- ⏰ **Planifications** : voir les tâches cron de chaque serveur
- 🔄 **Actualisation automatique** configurable (intervalle réglable)
- 🏷 **Badge** sur l'icône de l'extension indiquant le nombre de serveurs en ligne
- ⌨️ **Raccourci clavier** `Ctrl+Shift+R` (ou `Cmd+Shift+R` sur Mac) pour tout rafraîchir
- 🔔 **Notifications** quand le nombre de serveurs en ligne change
- 🔒 Token stocké **localement** dans le navigateur (`chrome.storage.local`)

## Build

Aucun bundling ni compilation : l'extension est en **HTML/CSS/JS vanilla (Manifest V3)**, sans aucune dépendance (`npm install` inutile).

Un seul script pour valider + packager :

```bash
./scripts/build.sh
```

Il :
1. valide `manifest.json` et les locales (`_locales/*/messages.json`)
2. vérifie la syntaxe de tous les JS (`node --check`)
3. génère **`dist/niboites-browser-<version>.zip`** (manifest.json à la racine du zip, prêt à uploader)

Pré-requis : `python3`, `node`, `zip`, `rsync` (tous présents par défaut sur macOS + brew).

### Pour distribuer

| Cible | Fichier à fournir |
|---|---|
| Chrome Web Store / Edge Add-ons | `dist/niboites-browser-<version>.zip` (uploader tel quel) |
| Firefox AMO | idem, ou le dossier dézippé |
| `.crx` signé (hors store) | `google-chrome --pack-extension=. --pack-extension-key=key.pem` |

## Installation (mode développeur)

1. Clonez ce dépôt : `git clone git@ni-git-01.srv.nihost.fr:ni/niboites-browser.git`
2. Ouvrez `chrome://extensions` (Chrome/Edge) ou `about:debugging` (Firefox)
3. Activez le **mode développeur**
4. Cliquez sur **« Charger l'extension non empaquetée »** et sélectionnez le dossier cloné
   (ou dézippez `dist/niboites-browser-<version>.zip` et chargez le dossier obtenu)
5. Cliquez sur l'icône de l'extension dans la barre d'outils → **⚙ Options**
6. Collez votre **token API** (créé depuis [boites.ni-host.com](https://boites.ni-host.com) → Compte → API) puis cliquez sur **Tester le token**

## Utilisation

- Cliquez sur l'icône de l'extension dans la barre d'outils pour ouvrir le popup
- Cliquez sur une boîte pour déplier/replier ses serveurs
- Survolez un serveur et utilisez les boutons ▶ ⏹ ⟳ ✕ pour agir
- Cliquez sur **⋯** pour ouvrir la fiche détaillée (console, backups, planifications)

## API utilisée

| Endpoint | Scope | Usage dans l'extension |
|---|---|---|
| `GET /v1/me` | `read` | Validation du token, email du compte |
| `GET /v1/boites` | `read` | Liste des boîtes |
| `GET /v1/boites/{id}/servers` | `read` | Serveurs de chaque boîte |
| `GET /v1/servers/{id}` | `read` | Détail serveur (fiche ⋯) |
| `GET /v1/servers/{id}/backups` | `read` | Liste des backups |
| `GET /v1/servers/{id}/schedules` | `read` | Tâches planifiées |
| `POST /v1/servers/{id}/power?signal=…` | `power` | start / stop / restart / kill |
| `POST /v1/servers/{id}/command` | `power` | Envoi de commande console |
| `POST /v1/servers/{id}/backups` | `power` | Déclenchement d'un backup |

> ⚠️ Les actions power/commande/backup nécessitent un token avec le scope **`power`**.
> Limite : **60 requêtes/minute** par token (HTTP 429 au-delà).

## Structure du projet

```
niboites-browser/
├── manifest.json          # Manifest V3
├── _locales/              # Traductions fr / en
├── icons/                 # Icônes PNG (16/48/128)
├── lib/
│   └── api.js             # Client API NiHost + helpers
├── popup/
│   ├── popup.html         # Interface principale
│   └── popup.js           # Logique du popup
├── css/
│   └── popup.css          # Styles
├── options/
│   ├── options.html       # Page de configuration du token
│   └── options.js
└── background/
    └── background.js      # Service worker (badge, alarmes, raccourcis)
├── scripts/
│   └── build.sh           # Validation + packaging .zip (dist/)
└── dist/                  # Généré par build.sh (gitignoré)
```

## Sécurité

- Le token n'est jamais envoyé ailleurs que vers `https://boites.ni-host.com`
- Stockage local uniquement (`chrome.storage.local`), jamais de stockage cloud
- Aucun tracking, aucun code tiers

## Licence

MIT
