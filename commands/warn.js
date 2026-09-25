const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js')
const { testStaff, getEmbedAuthor } = require('../utils/utils')
const { getGuildConfig } = require('../utils/constants.js')
const { addSanction } = require('../utils/sanctions')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Donne un avertissement à quelqu\'un.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre a avertir')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption(option =>
      option
        .setName('raison')
        .setRequired(false)
        .setDescription('La raison de l\'avertissement')
    ),
  async execute (interaction) {
    const author = getEmbedAuthor(interaction.user)

    const server = interaction.guild
    const member = server.members.cache.get(interaction.user.id)

    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Moderate Members"]')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const userToWarn = interaction.options.getUser('membre')
    const reason = interaction.options.getString('raison') || 'Aucune raison donnée'

    if (testStaff(userToWarn, interaction)) { return }

    const mpEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setAuthor(author)
      .setTitle(`Vous avez été averti sur le serveur ${server.name}`)
      .setDescription(`Raison: [${reason}]`)

    try {
      await userToWarn.send({ embeds: [mpEmbed] })
    } catch (error) {
      // L'utilisateur a ses MPs fermés, on ignore
    }

    await addSanction(userToWarn.id, userToWarn.displayName, {
      type: 'Warn',
      date: Date.now(),
      moderator: interaction.user.id,
      reason
    })

    const embed = new EmbedBuilder()
      .setColor(Colors.Grey)
      .setAuthor(author)
      .setTitle(`Le membre ${userToWarn.displayName} a bien été avertis!`)
      .setDescription(`Raison: [${reason}]`)

    await interaction.reply({ embeds: [embed] })

    const { logChannel } = getGuildConfig(server.id)
    const channel = server.channels.cache.get(logChannel)
    if (channel) {
      const logEmbed = new EmbedBuilder()
        .setColor(Colors.Grey)
        .setAuthor(author)
        .setTitle(`Le membre ${userToWarn.displayName} a été avertis par ${interaction.user.displayName}`)
        .setDescription(`Raison: [${reason}]`)

      await channel.send({ embeds: [logEmbed] })
    }
  }
}
