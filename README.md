# Zmeï

Bot Discord de l'association ANTRE : modération, niveaux, événements du serveur, et lien avec le site de l'association.

## Commandes du serveur

| Commande | Rôle | Qui la voit |
| --- | --- | --- |
| `/ping` · `/roll` · `/level` · `/leaderboard` · `/help` | dés (`2d20`, `4d6!+2`, `2d20kl1`, `1d10i`…), niveau et classement d'xp, aide | tout le monde |
| `/warn` · `/mute` · `/unmute` · `/kick` · `/ban` · `/unban` · `/voicemute` · `/voiceunmute` | modération ; chaque sanction est gardée (`/inspect`, `/sanction-remove`), annoncée à la personne en message privé et écrite dans le salon de logs | selon les permissions Discord (Modérer, Exclure, Expulser, Bannir, Couper le micro) |
| `/inspect` · `/sanction-remove` | historique des sanctions d'un membre (10 par page), suppression d'une sanction par son numéro | Modérer les membres |
| `/clear` · `/embed` | supprimer les derniers messages (1 à 100), publier un message en « embed » | Gérer les messages |
| `/setup-roles` | publie le menu où chacun choisit ses pôles (rôles Jeu vidéo, Wargame, Échecs, MJ) | Gérer les rôles |

**`/help` n'affiche que les commandes auxquelles la personne a accès** : une commande n'est listée que si ses permissions Discord (celles que la commande exige) le permettent, et `/event` ne détaille la création d'événement qu'avec la permission « Gérer les événements ». Un membre ordinaire ne voit donc ni la modération, ni `/embed`, ni `/setup-roles`.

**Fonctions automatiques** : gain d'xp à chaque message (20 à 50, au plus toutes les 15 secondes, niveaux jusqu'à 100) ; réaction 🐾 quand on mentionne le bot ; **logs** dans le salon de logs du serveur (message modifié, message supprimé avec ses pièces jointes si elles ont pu être gardées, connexions, déconnexions et changements de salon vocal) ; **salons vocaux temporaires** (rejoindre « Crée ton salon » crée un salon au nom du membre, supprimé quand il est vide). Les commandes qui échouent (rôle du bot trop bas, permission manquante…) répondent par un message clair au lieu de rester sans réponse.

## Lien avec le site de l'association (ANTRE-App)

Le bot peut parler au site (événements, campagnes, notifications) au nom d'un membre qui a **lié son compte Discord à son compte du site**.

### Configuration

Dans `config.json` (jamais versionné) :

```json
{
  "token": "…",
  "clientId": "…",
  "guildId": "…",
  "antreUrl": "https://antre.example",
  "antreCleApi": "la même valeur que BOT_API_KEY côté site"
}
```

(ou les variables d'environnement `ANTRE_URL` et `ANTRE_API_KEY`). Sans ces deux valeurs, la commande `/antre` répond que le lien n'est pas configuré et les notifications Discord sont désactivées. Côté site, définir `BOT_API_KEY` dans l'environnement du serveur (voir `backend/.env.example` et `SECURITE.md` du site). Puis `npm run deploy` pour publier les nouvelles commandes.

### Lier son compte

- **Le plus simple** : sur le site, **Mon compte → Discord → « Se connecter avec Discord »** : on autorise le site sur la page de Discord (comme « Se connecter avec Google »), c'est tout. `/antre lier` dans Discord donne le lien vers cette page.
- **Avec un code** (si le site n'a pas d'application Discord configurée, ou en secours) : sur le site, « Obtenir un code de liaison » (valable 10 minutes, usage unique) ; dans Discord, `/antre lier` puis le bouton **« J'ai un code »** ouvre une **fenêtre privée** où le coller (il n'apparaît jamais dans un salon).
- `/antre delier` (ou « Délier » sur le site) coupe la liaison.

### Commandes

| Commande | Rôle |
| --- | --- |
| `/antre lier` · `/antre delier` · `/antre moi` | liaison du compte, état |
| `/antre evenements` | prochains événements et leurs tables |
| `/antre campagnes` | campagnes en cours (`inscrites:true` : seulement celles où je suis inscrit(e)) |
| `/antre notifications` | ses notifications du site |
| `/event create` | créer un événement : il est créé **sur le site** (au nom du compte lié, qui doit être modérateur ou administrateur du site) puis ici |
| `/event list` · `/event info` | les événements du site ; `info` : dates, lieu, tables (jeu, MJ) et nombre de joueurs |

**Ce que le bot fait, et ne fait pas.** Discord sert d'abord à discuter ; le bot n'est pas une seconde interface du site. Il sert à **voir** les événements (avec leurs tables et le nombre de joueurs), à **lister** les campagnes, à **recevoir les notifications** du site en message privé, et à **créer un événement** (modérateurs et administrateurs). Tout le reste se fait sur le site : s'inscrire à une table, écrire sur le forum, **suivre un sujet** (on est alors prévenu de chaque réponse, par la cloche, et par e-mail, message privé Discord ou téléphone selon **Mon compte → Notifications**), rejoindre une campagne.

La liaison par code transmet aussi l'empreinte de votre avatar Discord, pour que vous puissiez le reprendre comme avatar du forum (**Mon compte → Mon avatar**).

Les réponses personnelles sont visibles de vous seul(e). Le site n'accepte du bot, au nom d'un membre lié, que de la **lecture** des événements et des campagnes (et de marquer ses notifications comme lues) : jamais de modération ni d'administration, même si le compte lié est modérateur ou administrateur, et rien sur la messagerie privée. **Seule écriture : créer un événement** (`/event create`), qui garde le vrai rôle du compte lié : un modérateur ou un administrateur du site le peut, un simple membre reçoit le même refus que sur le site. Modifier ou supprimer un événement reste réservé au site.

### Les événements du site sur Discord

Le **site est la source de vérité** : chaque événement créé, modifié ou supprimé sur le site est aussitôt reflété par le bot en **événement Discord** (la fonction « Événements » du serveur : nom, heures — l'heure du site est celle de Paris —, lieu, et un lien vers la page du site pour les tables et l'inscription). `/event create` suit le même chemin : l'événement naît sur le site, puis ici. Une seule fiche, deux endroits, jamais de doublon.

- Le site prévient le bot par la connexion permanente (signal `evenements`, identifiants seulement) ; une relève de secours toutes les 5 minutes rattrape une coupure.
- Le lien site ↔ Discord est gardé dans la base du bot (table `antre_evenements`). Un événement Discord qui existe déjà et dont le texte contient l'adresse de sa page du site est repris, pas recréé.
- **Jamais de doublon, jamais d'orphelin** : à chaque passe (démarrage, signal du site, relève de secours), le bot retire les événements Discord **qu'il a lui-même créés** (et dont le texte pointe vers une page de ce site) dont l'événement du site n'existe plus, et les doublons d'un même événement du site (il garde celui qu'il connaît, sinon le plus ancien). Cela répare tout seul un lien perdu (base du bot restaurée, site réinitialisé, deux bots à la fois). Les événements créés à la main ou par quelqu'un d'autre ne sont jamais touchés, et en cas de doute (site injoignable) rien n'est supprimé.
- Un événement Discord **supprimé à la main** n'est pas recréé tant que l'événement existe sur le site. Un événement déjà commencé n'est pas créé (Discord refuse de programmer dans le passé) ; un événement en cours garde son heure de début.
- Le bot a besoin des permissions **Gérer les événements** et **Créer des événements** sur le serveur.
- **Par serveur** : seuls les serveurs marqués `evenementsAntre: true` dans `utils/constants.js` reflètent les événements du site (pour l'instant le serveur de test). Les autres gardent leurs événements Discord à eux, et `/event create` / `/event list` y fonctionnent comme avant (sans le site).
- `npm test` lance les tests du bot (130 : modération, dés, niveaux, aide, rôles, logs, salons vocaux, synchronisation des événements ; faux serveur Discord et faux site, aucun accès réseau).

### Notifications en message privé

Si le membre a activé le canal Discord (**Mon compte → Notifications**), le site le signale **aussitôt** au bot : le bot garde une connexion permanente avec le site (`GET /api/bot/discord/flux`, Server-Sent Events, ouverte *par le bot* : rien à ouvrir sur votre box, pas de tunnel). À chaque signal (et à chaque reconnexion), il relit la file (`GET /api/bot/discord/envois`), envoie chaque notification en message privé, puis accuse réception. Si la connexion tombe (site redémarré, réseau), elle se rétablit toute seule ; une relève de secours toutes les 5 minutes garantit qu'aucun message ne reste en file. Si la personne n'accepte pas les messages privés du serveur, la notification est abandonnée (elle reste dans la cloche du site).
