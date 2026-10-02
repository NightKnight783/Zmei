/**
 * Ce que le bot montre des événements du site : la liste des événements à venir (gardée une minute, elle sert aussi aux listes de
 * choix), les noms des types d'événement, et les fiches (liste et détail avec les tables et le nombre de joueurs).
 * Partagé par /antre et /event.
 */
const { EmbedBuilder } = require('discord.js')
const antre = require('./antre.js')

const COULEUR = 0xe0953a // l'orange du site

// --- Données ----------------------------------------------------------------------------------------------------------------

let cacheEvenements = { date: 0, liste: [] }
/** Les événements à venir (50 au plus), avec leurs tables. Relus au plus une fois par minute. */
async function evenementsAVenir () {
  if (Date.now() - cacheEvenements.date > 60_000) {
    const r = await antre.get('/bot/evenements')
    cacheEvenements = { date: Date.now(), liste: r.evenements.filter((e) => !e.termine) }
  }
  return cacheEvenements.liste
}
/** Oublie la liste gardée (après la création d'un événement : il doit apparaître tout de suite). */
const oublierEvenements = () => {
  cacheEvenements = { date: 0, liste: [] }
}

/** Les libellés des types d'événement (« nocturne » → « Nocturne »), lus sur le site et gardés dix minutes. */
function creerLibellesTypes (client, maintenant = () => Date.now()) {
  let cache = { date: 0, valeur: {}, types: [] }
  return async function libellesTypes () {
    if (maintenant() - cache.date > 600_000) {
      try {
        const meta = await client.get('/meta')
        const valeur = {}
        const types = []
        for (const categorie of meta.categories ?? []) {
          for (const t of categorie.types ?? []) {
            valeur[t.cle] = t.libelle
            types.push({ cle: t.cle, libelle: t.libelle, categorie: categorie.libelle })
          }
        }
        cache = { date: maintenant(), valeur, types }
      } catch {
        // Sans les libellés, un événement n'indique simplement pas son type
      }
    }
    return cache
  }
}
const libellesTypes = creerLibellesTypes(antre)

// --- Noms courts (listes de choix) ----------------------------------------------------------------------------------------------

const nomEvenement = (e) => antre.couper(`${antre.dateEvenement(e.debut)} — ${e.titre}`, 100)
const nomTable = (t) => antre.couper(`${t.titre || t.jeu}${t.titre ? ` (${t.jeu})` : ''} — ${t.mj}${t.cloturee ? ' · inscriptions closes' : ''}`, 100)

const pluriel = (n, un, plusieurs = `${un}s`) => `${n} ${n > 1 ? plusieurs : un}`

// --- Fiches ---------------------------------------------------------------------------------------------------------------------

/** « ven. 9 oct. à 20h00 → 6h00 » (ou « → sam. 10 oct. à 6h00 » si l'événement dépasse la nuit). */
function plage (debut, fin) {
  if (!fin) return antre.dateEvenement(debut)
  const memeJour = debut.slice(0, 10) === fin.slice(0, 10)
  const [h, m] = fin.slice(11, 16).split(':')
  return `${antre.dateEvenement(debut)} → ${memeJour ? `${Number(h)}h${m}` : antre.dateEvenement(fin)}`
}

/** Une ligne sur ce que l'événement propose : tables et intéressés, ou « venez simplement ». */
function resumeTables (e) {
  const tables = e.tables ?? []
  if (!tables.length) return 'Pas de table : venez simplement.'
  return `${pluriel(tables.length, 'table')} · ${pluriel(e.nbInteresses, 'intéressé')}`
}

/** La liste des prochains événements (embed). */
function embedListe (liste, { titre = '📅 Prochains événements', limite = 8 } = {}) {
  const embed = new EmbedBuilder().setColor(COULEUR).setTitle(titre).setURL(antre.urlSite('/evenements'))
  for (const e of liste.slice(0, limite)) {
    embed.addFields({
      name: antre.couper(antre.neutraliser(`${antre.dateEvenement(e.debut)} — ${e.titre}`), 256),
      value: antre.couper(`${e.lieu ? `${antre.neutraliser(e.lieu)}\n` : ''}${resumeTables(e)}\n[Voir sur le site](${antre.urlSite(`/evenements/${e.id}`)})`, 1024)
    })
  }
  if (liste.length > limite) embed.setDescription(`Et ${pluriel(liste.length - limite, 'autre')} sur le [site](${antre.urlSite('/evenements')}).`)
  embed.setFooter({ text: "Dire quelle table vous intéresse n'est pas une réservation : la répartition se fait sur place. — /antre interet" })
  return embed
}

/** Une table en deux lignes : jeu et MJ, puis le nombre de joueurs intéressés pour le nombre de places. */
function ligneTable (t) {
  const joueurs = `${t.nbInteresses ?? t.interesses ?? 0}/${t.placesMax ?? t.joueursMax} joueurs`
  const etat = t.cloturee ? ' · inscriptions closes' : t.tresDemandee ? ' · très demandée' : ''
  const campagne = t.campagne ? ` · campagne **${antre.neutraliser(t.campagne.titre)}**` : ''
  const mj = t.mj?.pseudo ?? t.mj
  return {
    name: antre.couper(antre.neutraliser(`🎲 ${t.titre || t.jeu}${t.titre ? ` (${t.jeu})` : ''}`), 256),
    value: antre.couper(`MJ : ${antre.neutraliser(mj ?? '?')}${t.reserviste ? ' (réserve)' : ''}\n${joueurs}${etat}${campagne}`, 1024)
  }
}

/** Le détail d'un événement du site (réponse de GET /evenements/:id) : dates, lieu, tables et nombre de joueurs. */
function embedEvenement (e, libelles = {}) {
  const entete = [libelles[e.type], e.lieu ? `📍 ${antre.neutraliser(e.lieu)}` : ''].filter(Boolean).join(' · ')
  const embed = new EmbedBuilder()
    .setColor(COULEUR)
    .setTitle(antre.couper(antre.neutraliser(e.titre), 256))
    .setURL(antre.urlSite(`/evenements/${e.id}`))
    .setDescription(
      antre.couper(
        [`🗓 ${plage(e.debut, e.fin)}`, entete, e.resume ? antre.neutraliser(e.resume) : ''].filter(Boolean).join('\n') + (e.termine ? '\n\n*Cet événement est terminé.*' : ''),
        4000
      )
    )
  const tables = e.tables ?? []
  for (const t of tables.slice(0, 20)) embed.addFields(ligneTable(t))
  if (tables.length > 20) embed.addFields({ name: '…', value: `${pluriel(tables.length - 20, 'autre table')} sur le site.` })
  const pasDeTable = e.nbInscritsTotal - tables.reduce((somme, t) => somme + (t.nbInteresses ?? 0), 0)
  const bilan = []
  if (e.nbInscritsTotal !== undefined) bilan.push(`${pluriel(e.nbInscritsTotal, 'personne inscrite', 'personnes inscrites')}`)
  if (tables.length && pasDeTable > 0) bilan.push(`dont ${pasDeTable} sans table choisie`)
  if (!tables.length && !e.avecTables) bilan.push('pas de table : venez simplement')
  if (e.heureRepartition) bilan.push(`répartition à ${e.heureRepartition.replace(':', 'h')}`)
  const liens = [`[Page de l'événement](${antre.urlSite(`/evenements/${e.id}`)})`]
  if (e.discussionId) liens.push(`[Discussion du forum](${antre.urlSite(`/forum/sujet/${e.discussionId}`)})`)
  embed.addFields({ name: 'En résumé', value: `${bilan.join(' · ') || '—'}\n${liens.join(' · ')}` })
  embed.setFooter({ text: "Un intérêt pour une table n'est pas une réservation : la répartition se fait sur place." })
  return embed
}

module.exports = { COULEUR, evenementsAVenir, oublierEvenements, creerLibellesTypes, libellesTypes, nomEvenement, nomTable, plage, embedListe, embedEvenement }
