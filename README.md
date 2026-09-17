# Isaac Achievement Manager

Application web locale qui lit ta progression sur *The Binding of Isaac: Rebirth* (Repentance+) et t'aide à savoir ce qu'il te reste à débloquer.

Version actuelle (jalon M2) :

- lecture du cache Steam local, de la sauvegarde Repentance+ et du profil Steam public ;
- détection des écarts entre ces sources (par exemple un secret débloqué en jeu mais absent de Steam) ;
- tableau de bord : progression globale et par extension, derniers déblocages, écarts ;
- liste des succès filtrable (état, extension, méthode d'obtention, personnage, secrets, recherche, écarts) ;
- fiche détaillée de chaque succès, tirée du wiki anglais : condition, ce qu'il débloque, astuces, liens vers les pages sources ;
- écran Paramètres : synchro du wiki avec avancement, chemins et compte détectés ;
- consultation du profil public d'un autre joueur (SteamID64, URL de profil ou pseudo personnalisé).

À venir : planificateur de routes (M3), conseiller IA via Ollama (M4). Le design complet est dans `docs/superpowers/specs/2026-09-16-isaac-achievement-manager-design.md`.

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

Au premier lancement, la base wiki n'existe pas encore : un bandeau le signale et renvoie vers l'écran Paramètres, dont le bouton « Synchroniser le wiki » la télécharge (environ 600 pages, une vingtaine de secondes). La même synchro existe en ligne de commande : `npm run sync-wiki`. Elle n'est jamais lancée automatiquement ; relance-la après une mise à jour du jeu ou du wiki.

L'application n'écoute que sur `127.0.0.1` et ne modifie jamais les fichiers de Steam ni du jeu. Elle écrit seulement dans `data/` : icônes en cache, base wiki (`kb.json`), copie des pages du wiki (`wiki-cache/`) et journal. Elle lit `data/settings.json` si l'utilisateur l'a créé.

## Dépannage

Si le double-clic sur `Isaac Manager.vbs` ne fait rien :

- vérifier `node --version` (Node 26 ou plus, et présent dans le PATH) ;
- vérifier que `npm install` et `npm run build` ont bien été faits ;
- lire `data/server.log` ;
- lancer `npm start` dans un terminal pour voir l'erreur directement.

Si la synchro du wiki échoue, la base précédente reste utilisée. Sans réseau, la synchro reprend les pages déjà copiées dans `data/wiki-cache/` ; le rapport indique combien.

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

L'écran Paramètres affiche les valeurs utilisées ; les modifier demande d'éditer ce fichier puis de relancer l'application.

## Sources lues

| Source | Emplacement |
|---|---|
| Schéma des succès | `Steam/appcache/stats/UserGameStatsSchema_250900.bin` |
| Succès Steam locaux | `Steam/appcache/stats/UserGameStats_<compte>_250900.bin` |
| Sauvegarde | `Steam/userdata/<compte>/250900/remote/rep+persistentgamedata{1,2,3}.dat` |
| Profil public | `https://steamcommunity.com/profiles/<SteamID64>/stats/250900/?xml=1` |
| Wiki (synchro manuelle) | `https://bindingofisaacrebirth.fandom.com/api.php` |

Le slot de sauvegarde affiché par défaut est le plus récemment modifié ; un sélecteur permet d'en changer.

Le contenu des fiches vient du [wiki The Binding of Isaac: Rebirth](https://bindingofisaacrebirth.fandom.com/) (Fandom), sous licence CC BY-SA ; chaque fiche renvoie vers ses pages sources.

## Développement

```bash
npm run dev        # serveur + Vite (rechargement à chaud) sur http://127.0.0.1:5250/
npm test           # tests Vitest (serveur et front)
npm run typecheck  # vérification TypeScript
npm run sync-wiki  # synchro du wiki sans interface
```

Les fichiers de `tests/fixtures/` sont des copies réelles (dont un SteamID) : à anonymiser avant toute publication du dépôt.
