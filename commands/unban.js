const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js')
const { getEmbedAuthor } = require('../utils/utils')
const { getGuildConfig } = require('../utils/constants.js')
const { addSanction } = require('../utils/sanctions')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannis quelqu\'un.')
    .addUserOption(option =>
      option
        .setName('utilisateur')
        .setDescription('L\'utilisateur à débannir (par ID s\'il n\'est plus sur le serveur)')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(option =>
      option
        .setName('raison')
        .setRequired(false)
        .setDescription('La raison du débannissement')
    ),
  async execute (interaction) {
    const author = getEmbedAuthor(interaction.user)

    const server = interaction.guild
    const member = server.members.cache.get(interaction.user.id)

    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Ban Members"]')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const userToUnban = interaction.options.getUser('utilisateur')
    const reason = interaction.options.getString('raison') || 'Aucune raison donnée'

    const ban = await server.bans.fetch(userToUnban.id).catch(() => null)
    if (!ban) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle(`${userToUnban.displayName} n'est pas banni de ce serveur.`)

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    await server.bans.remove(userToUnban.id, reason)

    await addSanction(userToUnban.id, userToUnban.displayName, {
      type: 'Unban',
      date: Date.now(),
      moderator: interaction.user.id,
      reason
    })

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setAuthor(author)
      .setTitle(`${userToUnban.displayName} a bien été débanni!`)
      .setDescription(`Raison: [${reason}]`)

    await interaction.reply({ embeds: [embed] })

    const { logChannel } = getGuildConfig(server.id)
    const channel = server.channels.cache.get(logChannel)
    if (channel) {
      const logEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor(author)
        .setTitle(`${userToUnban.displayName} a été débanni par ${interaction.user.displayName}`)
        .setDescription(`Raison: [${reason}]`)

      await channel.send({ embeds: [logEmbed] })
    }
  }
}
