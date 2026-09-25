const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js')
const { testStaff, getEmbedAuthor } = require('../utils/utils')
const { getGuildConfig } = require('../utils/constants.js')
const { addSanction } = require('../utils/sanctions')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick quelqu\'un.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre a kick')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addStringOption(option =>
      option
        .setName('raison')
        .setRequired(false)
        .setDescription('La raison du kick')
    ),
  async execute (interaction) {
    const author = getEmbedAuthor(interaction.user)

    const server = interaction.guild
    const member = server.members.cache.get(interaction.user.id)

    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Kick Members"]')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const userToKick = interaction.options.getUser('membre')
    const reason = interaction.options.getString('raison') || 'Aucune raison donnée'

    const memberToKick = server.members.cache.get(userToKick.id)

    if (testStaff(userToKick, interaction)) { return }

    const mpEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setAuthor(author)
      .setTitle(`Vous avez été kick du serveur ${server.name}`)
      .setDescription(`Raison: [${reason}]`)

    try {
      await memberToKick.send({ embeds: [mpEmbed] })
    } catch (error) {
      // L'utilisateur a ses MPs fermés, on ignore
    }

    await memberToKick.kick(reason)

    await addSanction(userToKick.id, userToKick.displayName, {
      type: 'Kick',
      date: Date.now(),
      moderator: interaction.user.id,
      reason
    })

    const embed = new EmbedBuilder()
      .setColor(Colors.Grey)
      .setAuthor(author)
      .setTitle(`Le membre ${userToKick.displayName} a bien été kick!`)
      .setDescription(`Raison: [${reason}]`)

    await interaction.reply({ embeds: [embed] })

    const { logChannel } = getGuildConfig(server.id)
    const channel = server.channels.cache.get(logChannel)
    if (channel) {
      const logEmbed = new EmbedBuilder()
        .setColor(Colors.Grey)
        .setAuthor(author)
        .setTitle(`Le membre ${userToKick.displayName} a été kick par ${interaction.user.displayName}`)
        .setDescription(`Raison: [${reason}]`)

      await channel.send({ embeds: [logEmbed] })
    }
  }
}
