# Zmeï

Bot Discord de l'association ANTRE : modération, niveaux, événements du serveur, et lien avec le site de l'association.

## Lien avec le site de l'association (ANTRE-App)

Le bot peut parler au site (forum, événements, campagnes, notifications) au nom d'un membre qui a **lié son compte Discord à son compte du site**.

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

(ou les variables d'environnement `ANTRE_URL` et `ANTRE_API_KEY`). Sans ces deux valeurs, les commandes `/antre` et `/forum` répondent que le lien n'est pas configuré et les notifications Discord sont désactivées. Côté site, définir `BOT_API_KEY` dans l'environnement du serveur (voir `backend/.env.example` et `SECURITE.md` du site). Puis `npm run deploy` pour publier les nouvelles commandes.

### Lier son compte

- **Le plus simple** : sur le site, **Mon compte → Discord → « Se connecter avec Discord »** : on autorise le site sur la page de Discord (comme « Se connecter avec Google »), c'est tout. `/antre lier` dans Discord donne le lien vers cette page.
- **Avec un code** (si le site n'a pas d'application Discord configurée, ou en secours) : sur le site, « Obtenir un code de liaison » (valable 10 minutes, usage unique) ; dans Discord, `/antre lier` puis le bouton **« J'ai un code »** ouvre une **fenêtre privée** où le coller (il n'apparaît jamais dans un salon).
- `/antre delier` (ou « Délier » sur le site) coupe la liaison.

### Commandes

| Commande | Rôle |
| --- | --- |
| `/antre lier` · `/antre delier` · `/antre moi` | liaison du compte, état |
| `/antre evenements` | prochains événements et leurs tables |
| `/antre interet` | dire quelle table vous intéresse (ce n'est pas une réservation) |
| `/antre retirer` | se retirer d'un événement, ou seulement de sa table |
| `/antre campagnes` | campagnes en cours (`mes:true` : les miennes) |
| `/antre notifications` | ses notifications du site |
| `/forum recents` · `sections` · `chercher` · `lire` | consulter le forum |
| `/forum repondre` · `/forum nouveau` | répondre, ou créer un sujet (au nom du compte lié) |

Les messages du site s'écrivent en **Markdown** (comme sur Discord : `**gras**`, `*italique*`, `> citation`, `- liste`…, que `/forum lire` garde tel quel) et avec des **balises** (`[b]`, `[url=…]`, `[quote=Pseudo]`, `[list]`…), que `/forum lire` traduit en mise en forme Discord (gras, italique, citation, liste, texte caché) ; il laisse de côté ce que Discord ne sait pas faire (couleurs, tailles, alignement) et transforme les images et les pages du site en liens complets. Ce que vous écrivez avec `/forum repondre` et `/forum nouveau` peut contenir la même syntaxe. La liaison par code transmet aussi l'empreinte de votre avatar Discord, pour que vous puissiez le reprendre comme avatar du forum (**Mon compte → Mon avatar**).

Les réponses personnelles sont visibles de vous seul(e). Le bot agit avec les droits d'un **simple membre** : jamais de modération ni d'administration depuis Discord, même si le compte lié est modérateur ou administrateur sur le site, et rien sur la messagerie privée du site.

### Notifications en message privé

Si le membre a activé le canal Discord (**Mon compte → Notifications**), le site le signale **aussitôt** au bot : le bot garde une connexion permanente avec le site (`GET /api/bot/discord/flux`, Server-Sent Events, ouverte *par le bot* : rien à ouvrir sur votre box, pas de tunnel). À chaque signal (et à chaque reconnexion), il relit la file (`GET /api/bot/discord/envois`), envoie chaque notification en message privé, puis accuse réception. Si la connexion tombe (site redémarré, réseau), elle se rétablit toute seule ; une relève de secours toutes les 5 minutes garantit qu'aucun message ne reste en file. Si la personne n'accepte pas les messages privés du serveur, la notification est abandonnée (elle reste dans la cloche du site).
