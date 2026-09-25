const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js')
const { getSanctions } = require('../utils/sanctions')
const { getEmbedAuthor } = require('../utils/utils')

const PAGE_SIZE = 10
const COLLECTOR_TIME = 3 * 60 * 1000 // 3 minutes

const buildEmbed = (author, userToCheck, server, sanctions, page, totalPages) => {
  const embed = new EmbedBuilder()
    .setColor(Colors.Orange)
    .setAuthor(author)
    .setTitle(`Le membre ${userToCheck.displayName} possède ${sanctions.length} sanction(s) enregistrée(s)`)
    .setFooter({ text: `Page ${page + 1}/${totalPages} — Utilisez le numéro (#) avec /sanction-remove pour en supprimer une` })

  const pageItems = sanctions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  for (const sanct of pageItems) {
    const moderator = server.members.cache.get(sanct.moderator)
    embed.addFields({
      name: `#${sanct.numero} · ${sanct.type} <t:${Math.floor(sanct.date / 1000)}> par ${moderator ? moderator.displayName : 'Erreur'}${sanct.time ? ' pendant ' + sanct.time : ''}`,
      value: `Raison: [${sanct.reason}]`
    })
  }

  return embed
}

const buildRow = (page, totalPages) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('sanctions_prev').setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
  new ButtonBuilder().setCustomId('sanctions_next').setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
)

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inspect')
    .setDescription('Montre les sanctions d\'un membre.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre à check')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute (interaction) {
    const author = getEmbedAuthor(interaction.user)
    const userToCheck = interaction.options.getUser('membre')
    const server = interaction.guild

    const rawSanctions = await getSanctions(userToCheck.id)

    if (rawSanctions.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor(author)
        .setTitle(`Le membre ${userToCheck.displayName} ne possède aucune sanction enregistrée!`)

      await interaction.reply({ embeds: [embed] })
      return
    }

    // On associe à chaque sanction son numéro d'origine (ordre de création, stable
    // dans le temps) avant de trier par date pour l'affichage.
    const sanctions = rawSanctions
      .map((sanct, i) => ({ ...sanct, numero: i + 1 }))
      .sort((a, b) => b.date - a.date)

    const totalPages = Math.ceil(sanctions.length / PAGE_SIZE)
    let page = 0

    const embed = buildEmbed(author, userToCheck, server, sanctions, page, totalPages)
    const components = totalPages > 1 ? [buildRow(page, totalPages)] : []

    await interaction.reply({ embeds: [embed], components })

    if (totalPages <= 1) return

    const message = await interaction.fetchReply()
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: COLLECTOR_TIME })

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: 'Seul l\'auteur de la commande peut changer de page.', ephemeral: true })
        return
      }

      page += i.customId === 'sanctions_next' ? 1 : -1
      await i.update({
        embeds: [buildEmbed(author, userToCheck, server, sanctions, page, totalPages)],
        components: [buildRow(page, totalPages)]
      })
    })

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] })
      } catch (error) {
        // Le message a peut-être été supprimé entre temps, on ignore
      }
    })
  }
}
