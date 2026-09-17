# Isaac Achievement Manager

Application web locale qui lit ta progression sur *The Binding of Isaac: Rebirth* (Repentance+) et t'aide à savoir ce qu'il te reste à débloquer.

Version actuelle (jalon M4) :

- lecture du cache Steam local, de la sauvegarde Repentance+ et du profil Steam public ;
- détection des écarts entre ces sources (par exemple un secret débloqué en jeu mais absent de Steam) ;
- tableau de bord : progression globale et par extension, derniers déblocages, trois meilleures runs, grille des marques de complétion des 34 personnages, écarts ;
- planificateur de routes : runs à faire par personnage (fins à battre, chemin, succès obtenus, prérequis), triées par succès gagnés par heure, et succès hors routes (défis, compteurs, placards de Home, divers) ;
- conseiller IA : questions libres à un modèle Ollama du réseau local, qui répond en français à partir de ta progression, des runs conseillées et des fiches du wiki ; bouton « Demander au conseiller » sur chaque run et sur la fiche d'un succès manquant ;
- liste des succès filtrable (état, extension, méthode d'obtention, personnage, secrets, recherche, écarts) ;
- fiche détaillée de chaque succès, tirée du wiki anglais : condition, ce qu'il débloque, astuces, liens vers les pages sources, et pour un succès manquant ses prérequis et les runs du plan qui l'obtiennent ;
- écran Paramètres : synchro du wiki avec avancement, serveur Ollama et modèle du conseiller, chemins et compte détectés ;
- consultation du profil public d'un autre joueur (SteamID64, URL de profil ou pseudo personnalisé).

Le design complet est dans `docs/superpowers/specs/2026-09-16-isaac-achievement-manager-design.md`.

## Prérequis

- Windows avec Steam installé et le jeu lancé au moins une fois.
- Node.js 26 ou plus récent (le serveur est écrit en TypeScript et exécuté directement par Node).
- Pour la vérification croisée et les autres joueurs : détails de jeu du profil Steam en public.
- Pour le conseiller : un serveur [Ollama](https://ollama.com/) joignable (par défaut `http://127.0.0.1:11434`) avec le modèle choisi (par défaut `qwen3.5:9b`).

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

L'application n'écoute que sur `127.0.0.1` et ne modifie jamais les fichiers de Steam ni du jeu. Elle écrit seulement dans `data/` : icônes en cache, base wiki (`kb.json`), copie des pages du wiki (`wiki-cache/`), journal, et `settings.json` quand les réglages du conseiller sont enregistrés depuis l'interface.

## Routes

L'onglet Routes et le tableau de bord ont besoin de la base wiki. Les marques de complétion viennent de la sauvegarde (compteurs du jeu) ; pour un autre joueur, elles sont déduites de ses succès, et celles qu'aucun succès ne prouve s'affichent « ? ». Le mode conseillé est difficile tant que le succès « toutes les marques en difficile » du personnage manque. Les durées des runs et les coefficients de difficulté des personnages sont des estimations manuelles, pas des mesures. Par défaut, seules les runs jouables tout de suite sont listées ; la case « Afficher aussi les runs à débloquer » montre les autres avec les succès à obtenir d'abord. Quand un succès demande plusieurs runs (toutes les marques en difficile, ou plusieurs fins avec le même personnage), le plan ajoute des runs de préparation, sans succès immédiat, avant la run qui l'obtient ; une run dont un succès dépend d'une run à débloquer est elle aussi à débloquer. Sans aucune run à proposer, l'écran indique que les succès liés aux marques sont tous obtenus.

## Conseiller

L'onglet Conseiller envoie ta question au serveur Ollama avec un résumé de ta progression (succès, marques de complétion, dix premières runs conseillées) et jusqu'à vingt fiches de succès choisies d'après les noms cités dans la question (succès, numéros comme #45, personnages, boss, objets). La réponse arrive au fil de l'eau ; « Arrêter la réponse » la coupe aussi côté serveur. Les fiches transmises au modèle s'affichent sous la réponse et ouvrent la fiche du succès. La conversation reste en mémoire tant que la page est ouverte : un rechargement l'efface, et seuls les cinq derniers échanges sont renvoyés au modèle.

Le modèle ne doit s'appuyer que sur ces données, mais un petit modèle peut encore se tromper : vérifie dans les fiches. Le premier message peut prendre une dizaine de secondes, le temps que le serveur charge le modèle ; une réponse est coupée au-delà d'environ 1 500 jetons, et l'appli abandonne après 120 secondes sans rien recevoir (serveur occupé par une autre demande, par exemple). Sans base wiki, le conseiller ne connaît que ta progression.

La pastille « Conseiller » de l'en-tête indique si le serveur répond et si le modèle y est installé. L'écran Paramètres permet de changer l'adresse du serveur et le modèle (la liste propose les modèles installés) : l'enregistrement écrit `data/settings.json` et s'applique sans redémarrer.

## Dépannage

Si le double-clic sur `Isaac Manager.vbs` ne fait rien :

- vérifier `node --version` (Node 26 ou plus, et présent dans le PATH) ;
- vérifier que `npm install` et `npm run build` ont bien été faits ;
- lire `data/server.log` ;
- lancer `npm start` dans un terminal pour voir l'erreur directement.

Si la synchro du wiki échoue, la base précédente reste utilisée. Sans réseau, la synchro reprend les pages déjà copiées dans `data/wiki-cache/` ; le rapport indique combien.

Si le conseiller ne répond pas : vérifier dans Paramètres l'adresse du serveur (bouton « Vérifier la connexion »), que le modèle est installé (`ollama pull qwen3.5:9b` sur le serveur) et que le pare-feu du serveur laisse passer le port 11434. Le reste de l'application fonctionne sans Ollama.

## Réglages

Fichier optionnel `data/settings.json` :

```json
{
  "port": 5250,
  "accountId": 123456789,
  "ollama": { "url": "http://127.0.0.1:11434", "model": "qwen3.5:9b" }
}
```

- `port` : port d'écoute local.
- `accountId` : id de compte Steam à utiliser (sinon : compte connecté à Steam s'il a des données Isaac, puis le dernier compte connecté qui en a).
- `ollama` : adresse du serveur Ollama et modèle du conseiller ; l'écran Paramètres les modifie directement.

L'écran Paramètres affiche les valeurs utilisées ; pour `port` et `accountId`, il faut éditer ce fichier puis relancer l'application. Un fichier illisible n'est jamais écrasé : l'enregistrement des réglages du conseiller est alors refusé.

## Sources lues

| Source | Emplacement |
|---|---|
| Schéma des succès | `Steam/appcache/stats/UserGameStatsSchema_250900.bin` |
| Succès Steam locaux | `Steam/appcache/stats/UserGameStats_<compte>_250900.bin` |
| Sauvegarde (secrets, compteurs, marques de complétion) | `Steam/userdata/<compte>/250900/remote/rep+persistentgamedata{1,2,3}.dat` |
| Profil public | `https://steamcommunity.com/profiles/<SteamID64>/stats/250900/?xml=1` |
| Wiki (synchro manuelle) | `https://bindingofisaacrebirth.fandom.com/api.php` |
| Conseiller | serveur Ollama du réseau local (`/api/tags`, `/api/chat`) |

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
