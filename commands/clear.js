const { SlashCommandBuilder, Colors, EmbedBuilder, PermissionFlagsBits } = require('discord.js')
const { getEmbedAuthor } = require('../utils/utils')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Surprime les derniers message.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option
        .setName('nombre')
        .setRequired(false)
        .setDescription('Le nombre de message à supprimer (Défault: 10).')
    ).addBooleanOption(option =>
      option
        .setName('épinglés')
        .setRequired(false)
        .setDescription('Supprimer les méssage épinglés? (Défault: False)')
    ),
  async execute (interaction) {
    const member = interaction.guild.members.cache.get(interaction.user.id)
    const author = getEmbedAuthor(interaction.user)

    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Manage Messages"]')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const quantity = interaction.options.getInteger('nombre') ?? 10
    const pinned = interaction.options.getBoolean('épinglés') ?? false

    let fetched = await interaction.channel.messages.fetch({ limit: quantity })
    if (!pinned) {
      fetched = fetched.filter(mes => !mes.pinned)
    }

    try {
      // Le second argument `true` filtre automatiquement les messages de plus de
      // 14 jours, que Discord refuse de toute façon de supprimer en masse.
      const deleted = await interaction.channel.bulkDelete(fetched, true)

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor(author)
        .setTitle(`Suppression avec succès de ${deleted.size}!`)

      if (deleted.size < fetched.size) {
        embed.setDescription(`⚠️ ${fetched.size - deleted.size} message(s) de plus de 14 jours n'ont pas pu être supprimés (limite de Discord).`)
      }

      await interaction.reply({ embeds: [embed], ephemeral: true })
    } catch (error) {
      console.error(error)
      await interaction.reply({ content: '❌ Une erreur est survenue lors de la suppression des messages.', ephemeral: true })
    }
  }
}
