const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js')
const antre = require('../utils/antre.js')

const EPHEMERE = MessageFlags.Ephemeral
const COULEUR = 0xe0953a

const lireId = (valeur) => (/^\d+$/.test(valeur ?? '') ? Number.parseInt(valeur, 10) : null)
const lienSujet = (id) => antre.urlSite(`/forum/sujet/${id}`)

// Sections et derniers sujets, gardés une minute pour la saisie semi-automatique
const caches = { sections: { date: 0, liste: [] }, recents: { date: 0, liste: [] } }
async function chargerListe (cle, chemin, extraire) {
  const cache = caches[cle]
  if (Date.now() - cache.date > 60_000) {
    cache.liste = extraire(await antre.get(chemin))
    cache.date = Date.now()
  }
  return cache.liste
}
// La réponse entière du site : les catégories (Général, Jeux de rôle…) et les sections qu'elles rassemblent
const forumComplet = () => chargerListe('sections', '/forum/sections', (r) => r)
const sections = async () => (await forumComplet()).sections
const recents = () => chargerListe('recents', '/forum/recents', (r) => r.sujets)

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forum')
    .setDescription("Le forum de l'association : lire, répondre, créer un sujet (avec votre compte lié).")
    .addSubcommand((s) =>
      s
        .setName('recents')
        .setDescription('Les dernières discussions.')
        .addBooleanOption((o) => o.setName('public').setDescription('Afficher pour tout le salon (par défaut, vous seul(e) le voyez).'))
    )
    .addSubcommand((s) => s.setName('sections').setDescription('Les sections du forum.'))
    .addSubcommand((s) =>
      s
        .setName('chercher')
        .setDescription('Chercher un sujet.')
        .addStringOption((o) => o.setName('texte').setDescription('Mots du titre (2 caractères au moins)').setRequired(true).setMinLength(2).setMaxLength(60))
    )
    .addSubcommand((s) =>
      s
        .setName('lire')
        .setDescription("Lire les derniers messages d'un sujet.")
        .addStringOption((o) => o.setName('sujet').setDescription('Le sujet').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s
        .setName('repondre')
        .setDescription('Répondre à un sujet, au nom de votre compte du site.')
        .addStringOption((o) => o.setName('sujet').setDescription('Le sujet').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('message').setDescription('Votre réponse').setRequired(true).setMaxLength(4000))
    )
    .addSubcommand((s) =>
      s
        .setName('nouveau')
        .setDescription('Créer un sujet, au nom de votre compte du site.')
        .addStringOption((o) => o.setName('section').setDescription('La section').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('titre').setDescription('Le titre du sujet').setRequired(true).setMaxLength(120))
        .addStringOption((o) => o.setName('message').setDescription('Le premier message').setRequired(true).setMaxLength(4000))
    ),

  async execute (interaction) {
    const sous = interaction.options.getSubcommand()
    await interaction.deferReply(interaction.options.getBoolean('public') === true ? {} : { flags: EPHEMERE })
    try {
      const reponse = await this[`sous_${sous}`](interaction)
      await interaction.editReply({ allowedMentions: { parse: [] }, ...reponse })
    } catch (erreur) {
      if (!(erreur instanceof antre.ErreurAntre)) console.error(`Erreur /forum ${sous}`, erreur)
      await interaction.editReply({ content: antre.messageErreur(erreur), embeds: [], allowedMentions: { parse: [] } })
    }
  },

  async sous_recents () {
    const sujets = (await recents()).slice(0, 10)
    if (!sujets.length) return { content: "Le forum est encore vide." }
    const lignes = sujets.map((s) => `• [**${antre.neutraliser(antre.couper(s.titre, 100))}**](${lienSujet(s.id)}) — ${antre.neutraliser(s.section.titre)}`)
    return { embeds: [new EmbedBuilder().setColor(COULEUR).setTitle('💬 Dernières discussions').setURL(antre.urlSite('/forum')).setDescription(lignes.join('\n'))] }
  },

  async sous_sections () {
    const { categories, sections: liste } = await forumComplet()
    if (!liste.length) return { content: "Le forum n'a pas encore de section." }
    const ligne = (s) => `• **${antre.neutraliser(s.titre)}**${s.lectureSeule ? ' 🔒' : ''} — ${s.nbSujets} sujet${s.nbSujets > 1 ? 's' : ''}`
    // Rangées par catégorie ; celles qui n'en ont pas viennent à la fin
    const blocs = (categories ?? []).map((c) => ({ titre: c.titre, liste: liste.filter((s) => s.categorieId === c.id) })).filter((b) => b.liste.length)
    const autres = liste.filter((s) => !(categories ?? []).some((c) => c.id === s.categorieId))
    if (autres.length) blocs.push({ titre: blocs.length ? 'Autres sections' : 'Sections', liste: autres })
    const texte = blocs.map((b) => `__**${antre.neutraliser(b.titre)}**__\n${b.liste.map(ligne).join('\n')}`).join('\n\n')
    return { embeds: [new EmbedBuilder().setColor(COULEUR).setTitle('🗂️ Sections du forum').setURL(antre.urlSite('/forum')).setDescription(antre.couper(texte, 4000)).setFooter({ text: '🔒 = seuls les modérateurs peuvent y écrire' })] }
  },

  async sous_chercher (interaction) {
    const r = await antre.get(`/forum/recherche?q=${encodeURIComponent(interaction.options.getString('texte'))}`)
    if (!r.resultats.length) return { content: 'Aucun sujet ne correspond.' }
    const lignes = r.resultats.slice(0, 10).map((s) => `• [**${antre.neutraliser(antre.couper(s.titre, 100))}**](${lienSujet(s.id)}) — ${antre.neutraliser(s.section.titre)}`)
    return { embeds: [new EmbedBuilder().setColor(COULEUR).setTitle('🔎 Résultats').setDescription(lignes.join('\n'))] }
  },

  async sous_lire (interaction) {
    const id = lireId(interaction.options.getString('sujet'))
    if (!id) return { content: '❌ Choisissez un sujet dans la liste proposée.' }
    let page = await antre.get(`/forum/sujets/${id}`)
    const dernierePage = Math.ceil(page.total / page.taille)
    if (dernierePage > 1) page = await antre.get(`/forum/sujets/${id}?page=${dernierePage}`) // les messages les plus récents
    const messages = page.messages.slice(-5)
    const embed = new EmbedBuilder()
      .setColor(COULEUR)
      .setTitle(antre.couper(`${page.sujet.verrouille ? '🔒 ' : ''}${antre.neutraliser(page.sujet.titre)}`, 256))
      .setURL(lienSujet(id))
      .setDescription(`Section **${antre.neutraliser(page.section.titre)}** · ${page.total} message${page.total > 1 ? 's' : ''}`)
    for (const m of messages) {
      embed.addFields({ name: antre.couper(`${m.auteur.pseudo} · ${m.creeLe.slice(0, 10)}`, 256), value: antre.couper(antre.neutraliser(antre.bbcodeVersDiscord(m.contenu)), 1000) || '…' })
    }
    embed.setFooter({ text: page.peutRepondre ? 'Pour répondre : /forum repondre' : 'Ce sujet est verrouillé.' })
    return { embeds: [embed] }
  },

  async sous_repondre (interaction) {
    const id = lireId(interaction.options.getString('sujet'))
    if (!id) return { content: '❌ Choisissez un sujet dans la liste proposée.' }
    await antre.post(`/forum/sujets/${id}/messages`, { contenu: interaction.options.getString('message') }, { discordId: interaction.user.id })
    return { content: `✅ Votre réponse est publiée sur le forum : ${lienSujet(id)}` }
  },

  async sous_nouveau (interaction) {
    const sectionId = lireId(interaction.options.getString('section'))
    if (!sectionId) return { content: '❌ Choisissez une section dans la liste proposée.' }
    const r = await antre.post(
      `/forum/sections/${sectionId}/sujets`,
      { titre: interaction.options.getString('titre'), contenu: interaction.options.getString('message') },
      { discordId: interaction.user.id }
    )
    caches.recents.date = 0
    return { content: `✅ Votre sujet est publié sur le forum : ${lienSujet(r.id)}` }
  },

  async autocomplete (interaction) {
    const focus = interaction.options.getFocused(true)
    const saisie = String(focus.value).toLowerCase()
    let choix = []
    try {
      if (focus.name === 'sujet') {
        choix = (await recents()).filter((s) => s.titre.toLowerCase().includes(saisie)).map((s) => ({ name: antre.couper(`${s.titre} — ${s.section.titre}`, 100), value: String(s.id) }))
      } else if (focus.name === 'section') {
        choix = (await sections()).filter((s) => !s.lectureSeule && s.titre.toLowerCase().includes(saisie)).map((s) => ({ name: antre.couper(s.titre, 100), value: String(s.id) }))
      }
    } catch {
      // Site injoignable : la liste est simplement vide
    }
    await interaction.respond(choix.slice(0, 25)).catch(() => {})
  }
}
