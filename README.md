# Isaac Achievement Manager

Application web locale qui lit ta progression sur *The Binding of Isaac: Rebirth* (Repentance+) et t'aide à savoir ce qu'il te reste à débloquer.

Version actuelle (jalon M1) :

- lecture du cache Steam local, de la sauvegarde Repentance+ et du profil Steam public ;
- détection des écarts entre ces sources (par exemple un secret débloqué en jeu mais absent de Steam) ;
- tableau de bord : progression globale et par extension, derniers déblocages, écarts ;
- liste des succès filtrable (état, extension, secrets, recherche, écarts) ;
- consultation du profil public d'un autre joueur (SteamID64, URL de profil ou pseudo personnalisé).

À venir : fiches détaillées tirées du wiki (M2), planificateur de routes (M3), conseiller IA via Ollama (M4). Le design complet est dans `docs/superpowers/specs/2026-09-16-isaac-achievement-manager-design.md`.

## Prérequis

- Windows avec Steam installé et le jeu lancé au moins une fois.
- Node.js 26 ou plus récent (le serveur est écrit en TypeScript et exécuté directement par Node).
- Pour la vérification croisée et les autres joueurs : détails de jeu du profil Steam en public.

## Installation

```bash
npm install
npm run build
```

## Utilisation

- Double-clic sur `Isaac Manager.vbs` : le serveur démarre sans fenêtre et le navigateur s'ouvre sur <http://127.0.0.1:5250/>. S'il tourne déjà, le navigateur s'ouvre simplement.
- Ou, dans un terminal : `npm start`.
- Arrêt : bouton « Arrêter » dans l'interface, ou `npm run stop`.
- Journal du serveur lancé par le `.vbs` : `data/server.log`.

L'application n'écoute que sur `127.0.0.1` et ne modifie jamais les fichiers de Steam ni du jeu. Elle écrit seulement dans `data/` (icônes en cache, journal, réglages).

## Réglages

Fichier optionnel `data/settings.json` :

```json
{
  "port": 5250,
  "accountId": 123456789
}
```

- `port` : port d'écoute local.
- `accountId` : id de compte Steam à utiliser (sinon : compte connecté à Steam s'il a des données Isaac, puis le dernier compte connecté qui en a).

## Sources lues

| Source | Emplacement |
|---|---|
| Schéma des succès | `Steam/appcache/stats/UserGameStatsSchema_250900.bin` |
| Succès Steam locaux | `Steam/appcache/stats/UserGameStats_<compte>_250900.bin` |
| Sauvegarde | `Steam/userdata/<compte>/250900/remote/rep+persistentgamedata{1,2,3}.dat` |
| Profil public | `https://steamcommunity.com/profiles/<SteamID64>/stats/250900/?xml=1` |

Le slot de sauvegarde affiché par défaut est le plus récemment modifié ; un sélecteur permet d'en changer.

## Développement

```bash
npm run dev        # serveur + Vite (rechargement à chaud) sur http://127.0.0.1:5250/
npm test           # tests Vitest (serveur et front)
npm run typecheck  # vérification TypeScript
```

Les fichiers de `tests/fixtures/` sont des copies réelles (dont un SteamID) : à anonymiser avant toute publication du dépôt.
