const { EmbedBuilder } = require('discord.js')
const antre = require('./antre.js')
const evenements = require('./antre-evenements.js')

/** Relève de secours : si le signal d'un envoi se perdait (coupure), le bot relit tout de même la file à ce rythme. */
const INTERVALLE_SECOURS = 300_000
/** Sans aucune nouvelle du site (battements toutes les 25 s compris) pendant ce délai, la connexion est considérée coupée. */
const SILENCE_MAX = 70_000
/** Code d'erreur Discord : la personne n'accepte pas les messages privés des membres de ce serveur. */
const MESSAGES_PRIVES_FERMES = 50007

let enCours = false
let repriseDemandee = false
let dernierAvertissement = 0

/** Envoie en message privé les notifications que le site a mises en file pour les membres qui ont lié leur compte et demandé ce canal. */
async function distribuer (client) {
  // Un signal arrivé pendant un passage n'est pas perdu : on repasse juste après
  if (enCours) {
    repriseDemandee = true
    return
  }
  enCours = true
  try {
    const { envois } = await antre.get('/bot/discord/envois')
    for (const envoi of envois) {
      let accuse = { livre: true }
      try {
        const utilisateur = await client.users.fetch(envoi.discordId)
        await utilisateur.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe0953a)
              .setTitle(antre.couper(antre.neutraliser(envoi.titre), 256))
              .setURL(envoi.lien)
              .setDescription(antre.couper(antre.neutraliser(envoi.corps || 'Ouvrir sur le site'), 2000))
              .setFooter({ text: "ANTRE — vous pouvez changer ces notifications dans « Mon compte » sur le site" })
          ],
          allowedMentions: { parse: [] }
        })
      } catch (erreur) {
        accuse = { livre: false, raison: erreur?.code === MESSAGES_PRIVES_FERMES ? 'dm_ferme' : 'erreur' }
        if (accuse.raison === 'erreur') console.error(`Notification Discord ${envoi.id} non envoyée :`, erreur?.message ?? erreur)
      }
      await antre.post(`/bot/discord/envois/${envoi.id}`, accuse).catch((erreur) => console.error('Accusé de réception impossible :', erreur.message))
    }
  } catch (erreur) {
    // Site injoignable ou clé refusée : on le dit au plus une fois par heure, le temps que cela revienne
    if (Date.now() - dernierAvertissement > 3_600_000) {
      dernierAvertissement = Date.now()
      console.error(`Notifications ANTRE : ${erreur.message}`)
    }
  } finally {
    enCours = false
    if (repriseDemandee) {
      repriseDemandee = false
      void distribuer(client)
    }
  }
}

/**
 * Connexion permanente au site : il signale « envoi » dès qu'un message Discord est en file, et le bot le distribue aussitôt ;
 * il signale « evenements » dès qu'un événement est créé, modifié ou supprimé, et le bot met à jour les événements Discord.
 * Si la connexion tombe (site redémarré, réseau), elle se rétablit toute seule avec un délai croissant ; à chaque (re)connexion
 * le bot relit la file, donc rien n'est perdu pendant la coupure.
 */
async function ecouterSite (client) {
  let attente = 1000
  for (;;) {
    const controle = new AbortController()
    let garde
    try {
      const reponse = await antre.ouvrirFlux('/bot/discord/flux', controle.signal)
      if (!reponse.ok || !reponse.body) throw new Error(`flux refusé (${reponse.status})`)
      attente = 1000
      let dernier = Date.now()
      garde = setInterval(() => {
        if (Date.now() - dernier > SILENCE_MAX) controle.abort() // plus de battement : on se reconnecte
      }, 10_000)
      const decodeur = new TextDecoder()
      let tampon = ''
      for await (const morceau of reponse.body) {
        dernier = Date.now()
        tampon = (tampon + decodeur.decode(morceau, { stream: true })).replace(/\r\n/g, '\n')
        let coupe
        while ((coupe = tampon.indexOf('\n\n')) !== -1) {
          const bloc = tampon.slice(0, coupe)
          tampon = tampon.slice(coupe + 2)
          const type = /^event: (.+)$/m.exec(bloc)?.[1]
          if (type === 'pret' || type === 'envoi') void distribuer(client)
          // Un événement a été créé, modifié ou supprimé sur le site : les événements Discord le suivent
          if (type === 'pret' || type === 'evenements') void evenements.synchroniser(client)
        }
      }
    } catch (erreur) {
      if (Date.now() - dernierAvertissement > 3_600_000) {
        dernierAvertissement = Date.now()
        console.error(`Connexion permanente au site ANTRE interrompue : ${erreur.message} (nouvel essai dans ${Math.round(attente / 1000)} s)`)
      }
    } finally {
      clearInterval(garde)
      controle.abort()
    }
    await new Promise((resolve) => setTimeout(resolve, attente))
    attente = Math.min(attente * 2, 60_000)
  }
}

/** Lance la distribution régulière (rien si le lien avec le site n'est pas configuré). */
function demarrer (client) {
  if (!antre.estConfigure()) {
    console.log('Notifications ANTRE désactivées : antreUrl / antreCleApi ne sont pas configurés.')
    return
  }
  console.log('Notifications ANTRE activées (connexion permanente au site, relève de secours toutes les 5 minutes).')
  void ecouterSite(client)
  setInterval(() => {
    void distribuer(client)
    void evenements.synchroniser(client)
  }, INTERVALLE_SECOURS).unref()
}

module.exports = { demarrer }
