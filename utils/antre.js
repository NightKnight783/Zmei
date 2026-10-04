/**
 * Client de l'API du site de l'association (ANTRE-App).
 *
 * Configuration (config.json, ou variables d'environnement) :
 *   antreUrl     adresse du site, par exemple "https://antre.example"   (ANTRE_URL)
 *   antreCleApi  clé API du bot, la même que BOT_API_KEY côté site       (ANTRE_API_KEY)
 *
 * Le bot agit au nom d'un membre qui a lié son compte (en-tête X-Discord-Id, identifiant que Discord garantit) : il a les
 * droits d'un simple membre, jamais ceux d'un modérateur ou d'un administrateur, même si le compte lié en a sur le site.
 */
let config = {}
try {
  config = require('../config.json')
} catch {
  // Pas de config.json : on se rabat sur les variables d'environnement
}

const base = String(config.antreUrl || process.env.ANTRE_URL || '').replace(/\/+$/, '')
const cle = String(config.antreCleApi || process.env.ANTRE_API_KEY || '')

/** Erreur renvoyée par le site : { erreur: { code, message } } ou panne réseau (statut 0). */
class ErreurAntre extends Error {
  constructor (statut, code, message) {
    super(message)
    this.statut = statut
    this.code = code
  }
}

const estConfigure = () => base !== '' && cle !== ''
const urlSite = (chemin = '') => `${base}${chemin}`

/**
 * Appelle l'API. `discordId` : agir au nom du membre lié à ce compte Discord.
 * Renvoie le JSON de la réponse (null pour 204) ou lève une ErreurAntre.
 */
async function appeler (methode, chemin, { corps, discordId, delai = 10_000 } = {}) {
  if (!estConfigure()) throw new ErreurAntre(0, 'non_configure', "Le lien avec le site de l'association n'est pas configuré (antreUrl et antreCleApi).")
  const entetes = { 'x-api-key': cle, accept: 'application/json' }
  if (discordId) entetes['x-discord-id'] = discordId
  let body
  if (corps !== undefined) {
    entetes['content-type'] = 'application/json'
    body = JSON.stringify(corps)
  }
  let reponse
  try {
    reponse = await fetch(`${base}/api${chemin}`, { method: methode, headers: entetes, body, signal: AbortSignal.timeout(delai) })
  } catch {
    throw new ErreurAntre(0, 'injoignable', "Le site de l'association ne répond pas pour le moment. Réessayez dans un instant.")
  }
  const texte = await reponse.text()
  let json = null
  if (texte) {
    try {
      json = JSON.parse(texte)
    } catch {
      throw new ErreurAntre(reponse.status, 'reponse_invalide', 'Réponse inattendue du site.')
    }
  }
  if (!reponse.ok) throw new ErreurAntre(reponse.status, json?.erreur?.code ?? 'erreur', json?.erreur?.message ?? `Erreur ${reponse.status}.`)
  return json
}

/**
 * Ouvre une connexion longue (Server-Sent Events) vers le site : le site y envoie des signaux dès qu'il y a quelque chose à faire,
 * le bot n'a plus à l'interroger régulièrement. Renvoie la réponse HTTP (le corps se lit comme un flux). Le bot est celui qui
 * se connecte (connexion sortante) : rien à ouvrir côté bot, même derrière une box ou un pare-feu.
 */
async function ouvrirFlux (chemin, signal) {
  if (!estConfigure()) throw new ErreurAntre(0, 'non_configure', "Le lien avec le site de l'association n'est pas configuré (antreUrl et antreCleApi).")
  return fetch(`${base}/api${chemin}`, { headers: { 'x-api-key': cle, accept: 'text/event-stream' }, signal })
}

const get = (chemin, options) => appeler('GET', chemin, options)
const post = (chemin, corps, options) => appeler('POST', chemin, { ...options, corps: corps ?? {} })
const put = (chemin, corps, options) => appeler('PUT', chemin, { ...options, corps: corps ?? {} })
const supprimer = (chemin, options) => appeler('DELETE', chemin, options)

/** Message à montrer à la personne : celui du site quand il est clair, une consigne pour un compte non lié. */
function messageErreur (erreur) {
  if (!(erreur instanceof ErreurAntre)) return '❌ Une erreur est survenue.'
  if (erreur.code === 'discord_non_lie') return "❌ Votre compte Discord n'est pas lié à votre compte du site. Sur le site : **Mon compte → Discord**, puis ici : `/antre lier`."
  if (erreur.code === 'bot_interdit') return "❌ Cette action n'est pas possible depuis Discord : utilisez le site."
  if (erreur.code === 'bot_non_configure') return "❌ La liaison avec le site n'est pas activée côté site."
  return `❌ ${erreur.message}`
}

// --- Petits utilitaires d'affichage -------------------------------------------------------------------------------

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

/** « ven. 9 oct. à 20h00 » depuis « 2026-10-09T20:00 » (heure locale de l'association, sans conversion). */
function dateEvenement (local) {
  const d = new Date(`${local}:00Z`)
  if (Number.isNaN(d.getTime())) return local
  const [h, m] = local.slice(11, 16).split(':')
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} à ${Number(h)}h${m}`
}

/** Coupe un texte à `max` caractères (Discord limite les messages, titres et champs). */
const couper = (texte, max) => (texte.length > max ? `${texte.slice(0, max - 1)}…` : texte)

/** Empêche un texte venu d'un membre de mentionner @everyone, un rôle ou quelqu'un, et de casser la mise en forme. */
const neutraliser = (texte) => String(texte).replace(/@(everyone|here)/gi, '@​$1').replace(/<@[!&]?(\d+)>/g, '<@​$1>')

module.exports = { ErreurAntre, estConfigure, urlSite, appeler, ouvrirFlux, get, post, put, supprimer, messageErreur, dateEvenement, couper, neutraliser }
