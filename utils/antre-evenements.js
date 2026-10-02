/**
 * Les événements du site de l'association, reflétés sur Discord.
 *
 * Le site est la source de vérité : à chaque création, modification ou suppression d'un événement sur le site (signal « evenements »
 * de la connexion permanente, voir antre-notifications.js), le bot crée, met à jour ou supprime l'événement Discord correspondant
 * (la fonction « Événements » du serveur) sur les serveurs qui l'ont demandé (`evenementsAntre` dans constants.js). Un événement créé
 * avec `/event create` passe lui aussi par le site : une seule fiche, deux endroits.
 *
 * Le lien entre un événement du site et son événement Discord est gardé dans la base du bot (table `antre_evenements`). Rien n'est
 * recréé en double : si l'événement Discord existe déjà (son texte contient l'adresse de la page du site), il est repris tel quel.
 * Quelqu'un supprime un événement Discord à la main ? Le bot ne le recrée pas (il note simplement que c'est voulu).
 */
const { createHash } = require('node:crypto')
const { GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType, GuildScheduledEventStatus } = require('discord.js')

const FUSEAU = 'Europe/Paris'
/** Discord refuse un événement qui commence dans le passé : on laisse une minute de marge. */
const MARGE_DEBUT_MS = 60_000

// --- Dates : l'heure du site est l'heure de Paris, sans fuseau ---------------------------------------------------------------

/** Décalage (en ms) à ajouter à un instant UTC pour obtenir l'heure affichée à Paris à cet instant. */
function decalageParis (instantMs) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: FUSEAU, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(instantMs))
      .map((x) => [x.type, x.value])
  )
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(instantMs / 1000) * 1000
}

/** « 2026-10-09T20:00 » (heure de Paris) en instant réel : 18h00 UTC en été, 19h00 UTC en hiver. */
function dateParis (local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) throw new Error(`Date invalide : ${local}`)
  const nominal = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  // Le décalage dépend de l'instant (heure d'été ou d'hiver) : on l'affine une fois
  let instant = nominal - decalageParis(nominal)
  instant = nominal - decalageParis(instant)
  return new Date(instant)
}

/** « AAAA-MM-JJTHH:MM » : l'heure qu'il est à Paris (même format que les dates du site). */
function maintenantParis (date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date).replace(' ', 'T')
}

const formater = (instant) => instant.toISOString().slice(0, 16)

/** « 09/10/2026 » et « 20:00 » (ou « 20h00 ») → « 2026-10-09T20:00 », le format du site ; null si la date ou l'heure n'existe pas. */
function lireDateHeure (date, heure) {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(date).trim())
  const h = /^(\d{1,2})[:h](\d{2})$/.exec(String(heure).trim())
  if (!d || !h) return null
  const [jour, mois, annee, heures, minutes] = [d[1], d[2], d[3], h[1], h[2]].map(Number)
  if (heures > 23 || minutes > 59) return null
  const instant = new Date(Date.UTC(annee, mois - 1, jour, heures, minutes))
  if (instant.getUTCDate() !== jour || instant.getUTCMonth() !== mois - 1) return null // « 31/02 » n'existe pas
  return formater(instant)
}

/** « 2026-10-09T20:00 » + 120 minutes → « 2026-10-09T22:00 » (calcul sur l'heure affichée, sans fuseau). */
const ajouterMinutes = (local, minutes) => formater(new Date(Date.parse(`${local}:00Z`) + minutes * 60_000))

// --- L'événement Discord qui correspond à un événement du site -------------------------------------------------------------

/** Les champs de l'événement Discord, d'après la fiche du site (limites de Discord : nom 100, lieu 100, description 1000 caractères). */
function contenuEvenement (e, libelles, antre) {
  const lien = antre.urlSite(`/evenements/${e.id}`)
  const entete = [libelles[e.type] ?? '', e.resume ?? ''].filter(Boolean).join(' — ')
  return {
    name: antre.couper(antre.neutraliser(e.titre), 100),
    scheduledStartTime: dateParis(e.debut),
    scheduledEndTime: dateParis(e.fin),
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: antre.couper(e.lieu || 'À définir', 100) },
    description: antre.couper(`${entete ? `${antre.neutraliser(entete)}\n\n` : ''}Détails, tables et inscription : ${lien}`, 1000)
  }
}

/** Une empreinte du contenu : un événement n'est mis à jour sur Discord que si elle change. */
const empreinte = (c) => createHash('sha1').update(JSON.stringify([c.name, c.scheduledStartTime.toISOString(), c.scheduledEndTime.toISOString(), c.entityMetadata.location, c.description])).digest('hex')

// --- Mémoire du lien site ↔ Discord (base du bot) ------------------------------------------------------------------------------

function stockageSqlite (db) {
  const executer = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (erreur) => (erreur ? reject(erreur) : resolve())))
  const lire = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (erreur, lignes) => (erreur ? reject(erreur) : resolve(lignes))))
  const pret = executer(
    'CREATE TABLE IF NOT EXISTS antre_evenements (site_id INTEGER NOT NULL, guild_id TEXT NOT NULL, discord_id TEXT, empreinte TEXT NOT NULL DEFAULT \'\', retire INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (site_id, guild_id))'
  )
  return {
    async lister (guildId) {
      await pret
      return lire('SELECT site_id, guild_id, discord_id, empreinte, retire FROM antre_evenements WHERE guild_id = ?', [guildId])
    },
    async enregistrer (ligne) {
      await pret
      await executer(
        'INSERT INTO antre_evenements (site_id, guild_id, discord_id, empreinte, retire) VALUES (?, ?, ?, ?, ?) ' +
          'ON CONFLICT(site_id, guild_id) DO UPDATE SET discord_id = excluded.discord_id, empreinte = excluded.empreinte, retire = excluded.retire',
        [ligne.site_id, ligne.guild_id, ligne.discord_id, ligne.empreinte, ligne.retire ? 1 : 0]
      )
    },
    async supprimer (siteId, guildId) {
      await pret
      await executer('DELETE FROM antre_evenements WHERE site_id = ? AND guild_id = ?', [siteId, guildId])
    }
  }
}

// --- La synchronisation ---------------------------------------------------------------------------------------------------------

/** Code d'erreur Discord : l'événement n'existe (plus). */
const EVENEMENT_INCONNU = 10070

function creerSynchronisateur ({ antre, stockage, serveurs, libellesTypes, maintenant = () => Date.now(), journal = console }) {
  let courant = null
  let suivant = null
  const avertis = new Map()

  /** Une erreur n'est répétée qu'une fois par heure et par serveur : un site ou une permission manquante ne remplit pas les journaux. */
  function avertir (cle, erreur) {
    if (maintenant() - (avertis.get(cle) ?? 0) < 3_600_000) return
    avertis.set(cle, maintenant())
    journal.error(`Événements ANTRE → Discord (${cle}) : ${erreur?.message ?? erreur}`)
  }

  async function synchroniserServeur (guild, evenements, libelles) {
    const lignes = await stockage.lister(guild.id)
    const existants = await guild.scheduledEvents.fetch()
    const dansLaListe = new Set(evenements.map((e) => e.id))

    for (const e of evenements) {
      if (e.termine) continue
      const ligne = lignes.find((l) => l.site_id === e.id)
      if (ligne?.retire) continue
      const contenu = contenuEvenement(e, libelles, antre)
      const marque = empreinte(contenu)
      try {
        if (!ligne) {
          if (contenu.scheduledStartTime.getTime() <= maintenant() + MARGE_DEBUT_MS) continue // déjà commencé : Discord n'accepte plus de le créer
          const adresse = antre.urlSite(`/evenements/${e.id}`)
          const adopte = existants.find((x) => typeof x.description === 'string' && x.description.includes(adresse))
          const discord = adopte ?? (await guild.scheduledEvents.create({ ...contenu, reason: "Événement créé sur le site de l'ANTRE" }))
          await stockage.enregistrer({ site_id: e.id, guild_id: guild.id, discord_id: discord.id, empreinte: adopte ? '' : marque, retire: 0 })
          if (adopte) await modifier(guild, adopte, contenu, { site_id: e.id, guild_id: guild.id, discord_id: adopte.id, empreinte: '', retire: 0 }, marque)
        } else {
          const discord = existants.get(ligne.discord_id)
          if (!discord) {
            // Supprimé (ou terminé) du côté de Discord alors que l'événement du site est encore à venir : voulu, on ne le recrée pas
            await stockage.enregistrer({ ...ligne, retire: 1 })
          } else if (ligne.empreinte !== marque) {
            await modifier(guild, discord, contenu, ligne, marque)
          }
        }
      } catch (erreur) {
        avertir(`${guild.id} / événement ${e.id}`, erreur)
      }
    }

    // Événements qui ne sont plus dans la liste « à venir » du site : supprimés, terminés, ou au-delà des 50 premiers
    for (const ligne of lignes) {
      if (dansLaListe.has(ligne.site_id)) continue
      try {
        let fiche = null
        try {
          fiche = (await antre.get(`/evenements/${ligne.site_id}`)).evenement
        } catch (erreur) {
          if (erreur.statut !== 404) throw erreur // site injoignable : on réessaiera
        }
        if (fiche && !fiche.termine) continue // toujours à venir (au-delà des 50 premiers) : on le garde
        if (!fiche && ligne.discord_id && !ligne.retire) {
          await guild.scheduledEvents.delete(ligne.discord_id).catch((erreur) => {
            if (erreur?.code !== EVENEMENT_INCONNU) throw erreur
          })
        }
        await stockage.supprimer(ligne.site_id, guild.id)
      } catch (erreur) {
        avertir(`${guild.id} / événement ${ligne.site_id}`, erreur)
      }
    }
  }

  /** Met l'événement Discord à jour. Un événement déjà commencé garde son heure de début (Discord la verrouille). */
  async function modifier (guild, discord, contenu, ligne, marque) {
    const enCours = discord.status === GuildScheduledEventStatus.Active
    const changements = enCours
      ? { name: contenu.name, description: contenu.description, entityMetadata: contenu.entityMetadata, scheduledEndTime: contenu.scheduledEndTime }
      : { name: contenu.name, description: contenu.description, entityMetadata: contenu.entityMetadata, scheduledStartTime: contenu.scheduledStartTime, scheduledEndTime: contenu.scheduledEndTime }
    await guild.scheduledEvents.edit(discord.id, { ...changements, reason: "Événement modifié sur le site de l'ANTRE" })
    await stockage.enregistrer({ ...ligne, empreinte: marque })
  }

  async function passer (client) {
    try {
      if (!antre.estConfigure()) return
      const guilds = serveurs().map((id) => client.guilds.cache.get(id)).filter(Boolean)
      if (!guilds.length) return
      const { evenements } = await antre.get('/bot/evenements')
      const libelles = (await libellesTypes()).valeur
      for (const guild of guilds) {
        try {
          await synchroniserServeur(guild, evenements, libelles)
        } catch (erreur) {
          avertir(guild.id, erreur)
        }
      }
    } catch (erreur) {
      avertir('site', erreur)
    }
  }

  /**
   * Lance une synchronisation. Pendant qu'une passe tourne, les demandes suivantes se regroupent en une seule passe qui commence
   * juste après : rien n'est perdu, et deux passes ne se marchent jamais dessus. Ne lève jamais d'erreur.
   */
  function synchroniser (client) {
    if (!courant) {
      courant = passer(client).finally(() => {
        courant = null
      })
      return courant
    }
    suivant ??= courant.then(() => {
      suivant = null
      courant = passer(client).finally(() => {
        courant = null
      })
      return courant
    })
    return suivant
  }

  /** L'événement Discord (objet) qui reflète un événement du site sur ce serveur, s'il existe. */
  async function evenementDiscord (guild, siteId) {
    const ligne = (await stockage.lister(guild.id)).find((l) => l.site_id === siteId && !l.retire)
    if (!ligne?.discord_id) return null
    return (await guild.scheduledEvents.fetch(ligne.discord_id).catch(() => null)) ?? null
  }

  return { synchroniser, evenementDiscord }
}

// --- Instance du bot ----------------------------------------------------------------------------------------------------------------

let instance = null
function instanceDuBot () {
  if (!instance) {
    const antre = require('./antre.js')
    const { db } = require('./database.js')
    const { getGuildsEvenementsAntre } = require('./constants.js')
    const { libellesTypes } = require('./antre-affichage.js')
    instance = creerSynchronisateur({ antre, stockage: stockageSqlite(db), serveurs: getGuildsEvenementsAntre, libellesTypes })
  }
  return instance
}

/** Pour les tests : remplace le synchronisateur du bot (sa base SQLite, le site) par un autre. */
function utiliser (autre) {
  instance = autre
}

module.exports = {
  utiliser,
  decalageParis,
  dateParis,
  maintenantParis,
  lireDateHeure,
  ajouterMinutes,
  contenuEvenement,
  empreinte,
  stockageSqlite,
  creerSynchronisateur,
  synchroniser: (client) => instanceDuBot().synchroniser(client),
  evenementDiscord: (guild, siteId) => instanceDuBot().evenementDiscord(guild, siteId)
}
