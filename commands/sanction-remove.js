const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js')
const { removeSanction } = require('../utils/sanctions')
const { getGuildConfig } = require('../utils/constants.js')
const { getEmbedAuthor } = require('../utils/utils')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sanction-remove')
    .setDescription('Supprime une sanction de l\'historique d\'un membre via son numéro.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre concerné')
        .setRequired(true))
    .addIntegerOption(option =>
      option
        .setName('numero')
        .setDescription('Le numéro de la sanction (visible via /inspect)')
        .setRequired(true)
        .setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute (interaction) {
    const author = getEmbedAuthor(interaction.user)

    const targetUser = interaction.options.getUser('membre')
    const numero = interaction.options.getInteger('numero')

    const removed = await removeSanction(targetUser.id, numero)

    if (!removed) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle(`Aucune sanction #${numero} trouvée pour ${targetUser.displayName}.`)

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setAuthor(author)
      .setTitle(`La sanction #${numero} (${removed.type}) de ${targetUser.displayName} a été supprimée.`)
      .setDescription(`Raison d'origine: [${removed.reason}]`)

    await interaction.reply({ embeds: [embed] })

    const { logChannel } = getGuildConfig(interaction.guild.id)
    const channel = interaction.guild.channels.cache.get(logChannel)
    if (channel) {
      const logEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor(author)
        .setTitle(`La sanction #${numero} (${removed.type}) de ${targetUser.displayName} a été supprimée par ${interaction.user.displayName}`)
        .setDescription(`Raison d'origine: [${removed.reason}]`)

      await channel.send({ embeds: [logEmbed] })
    }
  }
}
