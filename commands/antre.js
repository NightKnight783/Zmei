const { SlashCommandBuilder, EmbedBuilder, Colors, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js')
const antre = require('../utils/antre.js')
// La liste des événements à venir (gardée une minute, elle sert aussi à la saisie semi-automatique) et leur affichage sont partagés avec /event
const { COULEUR, evenementsAVenir, nomEvenement, nomTable, embedListe } = require('../utils/antre-affichage.js')

const EPHEMERE = MessageFlags.Ephemeral

/** Lit l'identifiant choisi dans une liste (la personne peut aussi avoir tapé du texte libre : on le refuse poliment). */
const lireId = (valeur) => (/^\d+$/.test(valeur ?? '') ? Number.parseInt(valeur, 10) : null)

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antre')
    .setDescription("Le site de l'association : lier son compte, événements, campagnes, notifications.")
    .addSubcommand((s) => s.setName('lier').setDescription('Lier votre compte Discord à votre compte du site (un code vous est demandé).'))
    .addSubcommand((s) => s.setName('delier').setDescription('Délier votre compte Discord de votre compte du site.'))
    .addSubcommand((s) => s.setName('moi').setDescription('Voir à quel compte du site le vôtre est lié.'))
    .addSubcommand((s) =>
      s
        .setName('evenements')
        .setDescription('Les prochains événements, avec leurs tables.')
        .addBooleanOption((o) => o.setName('public').setDescription('Afficher pour tout le salon (par défaut, vous seul(e) le voyez).'))
    )
    .addSubcommand((s) =>
      s
        .setName('interet')
        .setDescription("Dire quelle table vous intéresse (ce n'est pas une réservation).")
        .addStringOption((o) => o.setName('evenement').setDescription("L'événement").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('table').setDescription('La table (sinon, vous venez sans choisir de table)').setAutocomplete(true))
        .addStringOption((o) => o.setName('mot').setDescription('Un petit mot pour le MJ (300 caractères, sans lien)').setMaxLength(300))
        .addBooleanOption((o) => o.setName('nouveau').setDescription("C'est votre première partie avec l'ANTRE"))
    )
    .addSubcommand((s) =>
      s
        .setName('retirer')
        .setDescription("Se retirer d'un événement ou d'une table (un imprévu !).")
        .addStringOption((o) => o.setName('evenement').setDescription("L'événement").setRequired(true).setAutocomplete(true))
        .addBooleanOption((o) => o.setName('garder_evenement').setDescription("Rester inscrit(e) à l'événement, en quittant seulement la table."))
    )
    .addSubcommand((s) =>
      s
        .setName('campagnes')
        .setDescription('Les campagnes en cours.')
        .addBooleanOption((o) => o.setName('mes').setDescription('Seulement les campagnes que je mène, où je joue ou que je suis.'))
    )
    .addSubcommand((s) =>
      s
        .setName('notifications')
        .setDescription('Vos dernières notifications du site.')
        .addBooleanOption((o) => o.setName('tout_lire').setDescription('Les marquer toutes comme lues après les avoir affichées.'))
    ),

  async execute (interaction) {
    const sous = interaction.options.getSubcommand()
    if (sous === 'lier') return this.proposerLiaison(interaction)

    const public_ = sous === 'evenements' && interaction.options.getBoolean('public') === true
    await interaction.deferReply(public_ ? {} : { flags: EPHEMERE })
    try {
      const reponse = await this[`sous_${sous}`](interaction)
      await interaction.editReply({ allowedMentions: { parse: [] }, ...reponse })
    } catch (erreur) {
      if (!(erreur instanceof antre.ErreurAntre)) console.error(`Erreur /antre ${sous}`, erreur)
      await interaction.editReply({ content: antre.messageErreur(erreur), embeds: [], allowedMentions: { parse: [] } })
    }
  },

  // --- Liaison ----------------------------------------------------------------------------------------------------------
  // La voie normale : le bouton « Se connecter avec Discord » du site (Mon compte → Discord). À défaut, un code donné par le
  // site, saisi ici dans une fenêtre privée, jamais dans le salon (un code lu par d'autres leur permettrait de lier leur compte).

  async proposerLiaison (interaction) {
    if (!antre.estConfigure()) return interaction.reply({ content: antre.messageErreur(new antre.ErreurAntre(0, 'non_configure', "Le lien avec le site de l'association n'est pas configuré.")), flags: EPHEMERE })
    const boutons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Lier avec Discord').setStyle(ButtonStyle.Link).setURL(antre.urlSite('/compte#discord')),
      new ButtonBuilder().setCustomId('antre_code').setLabel("J'ai un code").setStyle(ButtonStyle.Secondary)
    )
    return interaction.reply({
      content:
        'Pour lier votre compte du site à Discord :\n' +
        '1. Ouvrez **Mon compte → Discord** sur le site (bouton ci-dessous), connectez-vous si besoin ;\n' +
        '2. cliquez sur **« Se connecter avec Discord »** et autorisez le site : c’est tout.\n\n' +
        'Vous avez plutôt un code affiché sur le site ? Cliquez sur **« J’ai un code »**.',
      components: [boutons],
      flags: EPHEMERE
    })
  },

  /** Appelé par events/interactionCreate.js quand on clique un bouton de cette commande. */
  async bouton (interaction) {
    if (interaction.customId === 'antre_code') return this.ouvrirFenetreLiaison(interaction)
  },

  async ouvrirFenetreLiaison (interaction) {
    const fenetre = new ModalBuilder()
      .setCustomId('antre_lier')
      .setTitle('Lier mon compte au site')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('code')
            .setLabel('Code affiché sur le site')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('ABCD-EFGH')
            .setMinLength(8)
            .setMaxLength(12)
            .setRequired(true)
        )
      )
    await interaction.showModal(fenetre)
  },

  /** Appelé par events/interactionCreate.js quand une fenêtre de ce bot est envoyée. */
  async modal (interaction) {
    if (interaction.customId !== 'antre_lier') return
    await interaction.deferReply({ flags: EPHEMERE })
    try {
      const code = interaction.fields.getTextInputValue('code')
      const r = await antre.post('/bot/discord/lier', {
        code,
        discordId: interaction.user.id,
        discordNom: interaction.user.globalName || interaction.user.username,
        // L'empreinte de l'avatar Discord : permet au membre de le reprendre comme avatar du forum (rien d'autre n'est envoyé)
        discordAvatar: interaction.user.avatar ?? null
      })
      await interaction.editReply({
        content: `✅ Votre compte Discord est lié au compte **${r.pseudo}** du site.\nVous pouvez maintenant utiliser \`/forum\` et \`/antre\`, et recevoir vos notifications ici si vous les activez sur le site (**Mon compte → Notifications**).`,
        allowedMentions: { parse: [] }
      })
    } catch (erreur) {
      if (!(erreur instanceof antre.ErreurAntre)) console.error('Erreur liaison', erreur)
      await interaction.editReply({ content: antre.messageErreur(erreur) })
    }
  },

  async sous_delier (interaction) {
    await antre.supprimer(`/bot/discord/${interaction.user.id}`)
    return { content: "✅ Votre compte Discord n'est plus lié au site. Les notifications Discord sont arrêtées." }
  },

  async sous_moi (interaction) {
    let r
    try {
      r = await antre.get(`/bot/discord/membre/${interaction.user.id}`)
    } catch (erreur) {
      if (erreur instanceof antre.ErreurAntre && erreur.statut === 404) return { content: antre.messageErreur(new antre.ErreurAntre(401, 'discord_non_lie', '')) }
      throw erreur
    }
    return {
      content:
        `Votre compte Discord est lié au compte **${r.pseudo}** du site.\n` +
        (r.nonLues > 0 ? `🔔 ${r.nonLues} notification${r.nonLues > 1 ? 's' : ''} non lue${r.nonLues > 1 ? 's' : ''} (\`/antre notifications\`).` : 'Aucune notification non lue.') +
        (r.emailVerifie ? '' : "\n⚠️ L'adresse e-mail de votre compte n'est pas confirmée : vous ne pouvez pas encore participer (inscriptions, forum). Confirmez-la sur le site.")
    }
  },

  // --- Événements ------------------------------------------------------------------------------------------------------

  async sous_evenements () {
    const liste = await evenementsAVenir()
    if (!liste.length) return { content: 'Aucun événement à venir pour le moment.' }
    return { embeds: [embedListe(liste)] }
  },

  async sous_interet (interaction) {
    const evenementId = lireId(interaction.options.getString('evenement'))
    if (!evenementId) return { content: '❌ Choisissez un événement dans la liste proposée.' }
    const valeurTable = interaction.options.getString('table')
    const tableId = valeurTable ? lireId(valeurTable) : null
    if (valeurTable && !tableId) return { content: '❌ Choisissez une table dans la liste proposée (ou laissez ce champ vide).' }

    await antre.put(
      `/evenements/${evenementId}/inscription`,
      { tableId, commentaire: interaction.options.getString('mot') ?? '', nouveau: interaction.options.getBoolean('nouveau') === true },
      { discordId: interaction.user.id }
    )
    const evenement = (await evenementsAVenir()).find((e) => e.id === evenementId)
    const table = evenement?.tables.find((t) => t.id === tableId)
    return {
      content:
        `✅ C'est noté pour **${evenement ? evenement.titre : `l'événement ${evenementId}`}**` +
        (table ? `, table **${table.titre || table.jeu}**` : ', sans table choisie') +
        ".\nCe n'est pas une réservation : la répartition définitive se fait sur place. Un imprévu ? `/antre retirer`."
    }
  },

  async sous_retirer (interaction) {
    const evenementId = lireId(interaction.options.getString('evenement'))
    if (!evenementId) return { content: '❌ Choisissez un événement dans la liste proposée.' }
    const options = { discordId: interaction.user.id }
    if (interaction.options.getBoolean('garder_evenement')) {
      const { evenement } = await antre.get(`/evenements/${evenementId}`, options)
      const tableId = evenement.monInscription?.tableId
      if (!tableId) return { content: "ℹ️ Vous n'êtes inscrit(e) à aucune table de cet événement." }
      await antre.supprimer(`/tables/${tableId}/inscription`, options)
      return { content: `✅ Vous ne participez plus à la table de **${evenement.titre}**, mais restez inscrit(e) à l'événement.` }
    }
    await antre.supprimer(`/evenements/${evenementId}/inscription`, options)
    return { content: "✅ Vous êtes retiré(e) de l'événement. Le MJ de votre table en est prévenu. Vous pourrez vous réinscrire quand vous voulez." }
  },

  // --- Campagnes et notifications ----------------------------------------------------------------------------------------

  async sous_campagnes (interaction) {
    const mes = interaction.options.getBoolean('mes') === true
    const r = mes ? await antre.get('/campagnes/miennes', { discordId: interaction.user.id }) : await antre.get('/campagnes?statut=en_cours')
    const liste = r.campagnes.filter((c) => !mes || c.statut === 'en_cours').slice(0, 10)
    if (!liste.length) return { content: mes ? "Vous n'avez aucune campagne en cours. Découvrez-les sur le site." : 'Aucune campagne en cours pour le moment.' }
    const lignes = liste.map((c) => {
      const lien = { mj: ' · **vous êtes le MJ**', actif: ' · **vous jouez**', demande: ' · demande en attente', ancien: ' · ancien joueur' }[c.monStatut] ?? ''
      const suivante = c.prochaineSeance ? ` · prochaine séance ${antre.dateEvenement(c.prochaineSeance.debut)}` : ''
      return `• [**${antre.neutraliser(c.titre)}**](${antre.urlSite(`/campagnes/${c.id}`)}) — ${antre.neutraliser(c.jeu)} · ${c.type === 'ouverte' ? 'ouverte' : 'fermée'} · ${c.nbJoueurs} joueur${c.nbJoueurs > 1 ? 's' : ''}${suivante}${lien}`
    })
    return { embeds: [new EmbedBuilder().setColor(COULEUR).setTitle(mes ? '🎲 Mes campagnes' : '🎲 Campagnes en cours').setDescription(antre.couper(lignes.join('\n'), 4000)).setURL(antre.urlSite('/campagnes'))] }
  },

  async sous_notifications (interaction) {
    const options = { discordId: interaction.user.id }
    const r = await antre.get('/notifications?limite=10', options)
    if (!r.notifications.length) return { content: 'Aucune notification pour le moment.' }
    const lignes = r.notifications.map((n) => `${n.lue ? '▫️' : '🔔'} **${antre.neutraliser(antre.couper(n.titre, 120))}**${n.corps ? `\n${antre.neutraliser(antre.couper(n.corps, 200))}` : ''}\n[Ouvrir](${antre.urlSite(n.lien)})`)
    if (interaction.options.getBoolean('tout_lire')) await antre.post('/notifications/lues', {}, options)
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Orange)
          .setTitle('🔔 Notifications')
          .setDescription(antre.couper(lignes.join('\n\n'), 4000))
          .setFooter({ text: `${r.nonLues} non lue${r.nonLues > 1 ? 's' : ''}${interaction.options.getBoolean('tout_lire') ? ' (maintenant marquées comme lues)' : ''}` })
      ]
    }
  },

  // --- Saisie semi-automatique ------------------------------------------------------------------------------------------

  async autocomplete (interaction) {
    const focus = interaction.options.getFocused(true)
    const saisie = String(focus.value).toLowerCase()
    let choix = []
    try {
      const evenements = await evenementsAVenir()
      if (focus.name === 'evenement') {
        const sousCommande = interaction.options.getSubcommand()
        choix = evenements
          .filter((e) => sousCommande !== 'interet' || e.tables.length > 0)
          .filter((e) => nomEvenement(e).toLowerCase().includes(saisie))
          .map((e) => ({ name: nomEvenement(e), value: String(e.id) }))
      } else if (focus.name === 'table') {
        const evenement = evenements.find((e) => e.id === lireId(interaction.options.getString('evenement')))
        choix = (evenement?.tables ?? []).filter((t) => nomTable(t).toLowerCase().includes(saisie)).map((t) => ({ name: nomTable(t), value: String(t.id) }))
      }
    } catch {
      // Site injoignable : la liste est simplement vide
    }
    await interaction.respond(choix.slice(0, 25)).catch(() => {})
  }
}
