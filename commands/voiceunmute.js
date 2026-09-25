const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js')
const { getEmbedAuthor } = require('../utils/utils')
const { getGuildConfig } = require('../utils/constants.js')
const { addSanction } = require('../utils/sanctions')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voiceunmute')
    .setDescription('Redonne la parole à un membre rendu muet en vocal.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre à qui redonner la parole')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute (interaction) {
    const author = getEmbedAuthor(interaction.user)

    const server = interaction.guild
    const targetMember = server.members.cache.get(interaction.user.id)

    if (!targetMember.permissions.has(PermissionsBitField.Flags.MuteMembers)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Mute Members"]')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const userToUnmute = interaction.options.getUser('membre')
    const reason = 'Parole rétablie par le modérateur'

    const member = await server.members.fetch(userToUnmute.id).catch(() => null)
    if (!member || !member.voice.channel) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle(`Le membre ${userToUnmute.displayName} n'est connecté dans aucun salon vocal.`)

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    // Vérification si le membre n'est PAS mute (déjà actif)
    if (!member.voice.mute) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle(`Le micro de ${userToUnmute.displayName} n'est pas coupé.`)

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    // Action Discord : Démute en vocal
    try {
      await member.voice.setMute(false)
    } catch (error) {
      console.error(error)
      return interaction.reply({ content: '❌ Je n\'ai pas pu réactiver le micro de ce membre. Vérifie mes permissions.', ephemeral: true })
    }

    // Envoi du MP à l'utilisateur
    const mpEmbed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setAuthor(author)
      .setTitle(`Votre micro a été réactivé sur le serveur ${server.name}`)

    try {
      await userToUnmute.send({ embeds: [mpEmbed] })
    } catch (error) {
      console.log("Impossible d'envoyer un MP à l'utilisateur")
    }

    await addSanction(userToUnmute.id, userToUnmute.displayName, {
      type: 'VoiceUnmute',
      date: Date.now(),
      moderator: interaction.user.id,
      reason
    })

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setAuthor(author)
      .setTitle(`Le micro de ${userToUnmute.displayName} a bien été réactivé !`)

    await interaction.reply({ embeds: [embed] })

    const { logChannel } = getGuildConfig(server.id)
    const channel = server.channels.cache.get(logChannel)
    if (channel) {
      const logEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor(author)
        .setTitle(`Le micro de ${userToUnmute.displayName} a été réactivé par ${interaction.user.displayName}`)

      await channel.send({ embeds: [logEmbed] })
    }
  }
}
