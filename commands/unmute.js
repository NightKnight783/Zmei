const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js')
const { getEmbedAuthor } = require('../utils/utils')
const { getGuildConfig } = require('../utils/constants.js')
const { addSanction } = require('../utils/sanctions')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Retire le mute (timeout) d\'un membre.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre à démute')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addStringOption(option =>
      option
        .setName('raison')
        .setRequired(false)
        .setDescription('La raison du démute')
    ),
  async execute (interaction) {
    const author = getEmbedAuthor(interaction.user)

    const server = interaction.guild
    const member = server.members.cache.get(interaction.user.id)

    if (!member.permissions.has(PermissionsBitField.Flags.MuteMembers)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Mute Members"]')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const userToUnmute = interaction.options.getUser('membre')
    const reason = interaction.options.getString('raison') || 'Aucune raison donnée'

    const memberToUnmute = await server.members.fetch(userToUnmute.id).catch(() => null)
    if (!memberToUnmute) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle(`Le membre ${userToUnmute.displayName} n'est plus sur le serveur.`)

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    if (!memberToUnmute.isCommunicationDisabled()) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle(`Le membre ${userToUnmute.displayName} n'est pas mute.`)

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    await memberToUnmute.timeout(null, reason)

    const mpEmbed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setAuthor(author)
      .setTitle(`Vous n'êtes plus mute sur le serveur ${server.name}`)
      .setDescription(`Raison: [${reason}]`)

    try {
      await userToUnmute.send({ embeds: [mpEmbed] })
    } catch (error) {
      // L'utilisateur a ses MPs fermés, on ignore
    }

    await addSanction(userToUnmute.id, userToUnmute.displayName, {
      type: 'Unmute',
      date: Date.now(),
      moderator: interaction.user.id,
      reason
    })

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setAuthor(author)
      .setTitle(`Le membre ${userToUnmute.displayName} a bien été démute!`)
      .setDescription(`Raison: [${reason}]`)

    await interaction.reply({ embeds: [embed] })

    const { logChannel } = getGuildConfig(server.id)
    const channel = server.channels.cache.get(logChannel)
    if (channel) {
      const logEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor(author)
        .setTitle(`Le membre ${userToUnmute.displayName} a été démute par ${interaction.user.displayName}`)
        .setDescription(`Raison: [${reason}]`)

      await channel.send({ embeds: [logEmbed] })
    }
  }
}
