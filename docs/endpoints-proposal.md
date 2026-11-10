# Proposition d'enrichissement — API publique NiBoites v1

> Pour review. Base actuelle : `https://boites.ni-host.com/v1`, auth `Authorization: Bearer nb_…`,
> scopes `read` / `power`, limite 60 req/min (429 + `Retry-After`), dates ISO 8601 UTC.
> Schéma actuel : `GET https://boites.ni-host.com/v1/openapi.json` (10 endpoints).

## Conventions à conserver pour les nouveaux endpoints

- Bearer token `nb_…` créé sur ni-boites.fr (Compte > API), scopes `read` (lecture) et `power` (action)
- Corps d'erreur JSON uniforme : `{ "message": "…" }` ; codes existants 401/403/404/422/429/502
- Réponses listées paginées : `{ "data": […], "meta": { "page", "total" } }`
- Terminologie : « boîte / boîtes » uniquement dans les messages et noms de ressources (jamais « box »)
- Aucun secret en clair dans les réponses (ex. SFTP : valeurs masquées ou chiffrées côté panel)
- Rate limit global 60 req/min ; les endpoints stream (SSE/WS) hors quota de polling

## Endpoints proposés

### P0 — compléter ce qui existe déjà

| Méthode | Path | Scope | Description |
|---|---|---|---|
| POST | `/v1/servers/{id}/schedules/{scheduleId}/run` | power | Lancer une tâche planifiée immédiatement (**déjà dans l'OpenAPI**, à documenter côté docs) |

### P1 — monitoring & console (tous les users)

| Méthode | Path | Scope | Description | Retour (ex.) |
|---|---|---|---|---|
| GET | `/v1/servers/{id}/metrics` | read | Métriques courantes : CPU %, RAM utilisée, disque, joueurs en ligne/max, uptime | `{ cpu, memoryMb, diskMb, players, playersMax, uptimeSec }` |
| GET | `/v1/servers/{id}/console?tail=200` | read | Dernières lignes de console (historique) | `{ lines: […] }` |
| GET | `/v1/servers/{id}/console/stream` | read | Flux console en temps réel (SSE) | événements `console` |
| GET | `/v1/servers/{id}/address` | read | Adresse de connexion (host:port) pour rejoindre le serveur | `{ host, port, connectString }` |

### P2 — gestion avancée d'un serveur (community admin)

| Méthode | Path | Scope | Description |
|---|---|---|---|
| GET | `/v1/servers/{id}/files?path=/` | read | Lister les fichiers d'un dossier |
| GET | `/v1/servers/{id}/files/content?path=server.properties` | read | Lire un fichier texte (limite de taille, ex. 1 Mo) |
| PUT | `/v1/servers/{id}/files/content?path=…` | power | Écrire/éditer un fichier texte |
| POST | `/v1/servers/{id}/files/upload?path=/mods` | power | Upload multipart d'un fichier |
| GET | `/v1/servers/{id}/allocations` | read | Ports réseau alloués |
| POST | `/v1/servers/{id}/allocations` | power | Demander un port supplémentaire |
| GET | `/v1/servers/{id}/dns` | read | Sous-domaines + enregistrements SRV (zones OVH) |
| GET | `/v1/servers/{id}/sftp` | read | Infos de connexion SFTP (secret masqué) |
| POST | `/v1/servers/{id}/backups/{backupId}/restore` | power | Restaurer une sauvegarde |
| DELETE | `/v1/servers/{id}/backups/{backupId}` | power | Supprimer une sauvegarde |
| POST | `/v1/servers/{id}/schedules` | power | Créer une tâche planifiée (cron UTC + actions) |
| PATCH | `/v1/servers/{id}/schedules/{scheduleId}` | power | Éditer une tâche (cron, active, actions) |
| DELETE | `/v1/servers/{id}/schedules/{scheduleId}` | power | Supprimer une tâche |

### P3 — gestion de la boîte (pool) et déploiement

| Méthode | Path | Scope | Description |
|---|---|---|---|
| GET | `/v1/boites/{id}/usage` | read | Conso du pool : CPU/RAM/disk utilisés vs `total_*`, nb serveurs vs `max_servers` |
| POST | `/v1/boites/{id}/servers` | power | Créer un serveur (jeu/egg, nom, memoryMb, cpu, diskMb) avec validation des quotas du pool |
| PATCH | `/v1/servers/{id}/build` | power | Rescaler (memoryMb, cpu, diskMb) |
| PATCH | `/v1/servers/{id}` | power | Renommer un serveur |
| DELETE | `/v1/servers/{id}?force=false` | power | Supprimer un serveur (libère le pool) |
| GET | `/v1/games` | read | Jeux/eggs visibles (variantes Minecraft, Hytale, etc. — visibilité admin) |
| POST | `/v1/servers/{id}/modpacks/install` | power | Installer un modpack (Modrinth/CurseForge) en one-click |

### P4 — sous-utilisateurs (boîte partagée)

| Méthode | Path | Scope | Description |
|---|---|---|---|
| GET | `/v1/boites/{id}/subusers` | read | Lister les sous-utilisateurs et leurs permissions (console, files, restart, mods…) |
| POST | `/v1/boites/{id}/subusers` | power | Inviter un sous-utilisateur `{ email, permissions[] }` |
| DELETE | `/v1/boites/{id}/subusers/{subuserId}` | power | Révoquer l'accès panel d'un sous-utilisateur |

## Mapping extension navigateur (niboites-browser)

| Endpoint | Feature dans l'extension |
|---|---|
| run schedule (P0) | Bouton « Exécuter maintenant » sur chaque planification |
| metrics | Sparklines CPU/RAM + joueurs en ligne sur la carte serveur |
| console + stream | Console live dans la fiche serveur |
| address | « Rejoindre » en gros + copier l'adresse (player-owner) |
| files * | Mini explorateur de fichiers (lire/éditer/uploader) |
| allocations / dns / sftp | Blocs réseau/DNS/SFTP dans la fiche serveur |
| backups restore/delete, schedules CRUD | CRUD complet backups & planifications |
| boîtes usage | Barres d'utilisation du pool sur la carte boîte |
| créer/rescaler/renommer/supprimer serveur, games, modpacks | Gestion complète de la boîte sans ouvrir le panel |
| subusers * | Gestion des accès scopés depuis l'extension |

## Hors scope / contraintes produit à respecter

- Jamais de « box » dans les textes (terminologie « boîte/boîtes »)
- Pas de mention TeamSpeak/Mumble, pas de claim « unlimited servers »
- Jeux : Minecraft, Hytale, « and more » uniquement
- Le panel ne vend jamais : facturation/support restent sur ni-host.com
- Pterodactyl invisible côté user (l'API publique n'expose jamais sa marque)
