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
        .setMaxLength(512) // limite de Discord pour la raison inscrite au journal du serveur
        .setDescription('La raison du kick')
    ),
  async execute (interaction) {
    const author = getEmbedAuthor(interaction.user)

    const server = interaction.guild

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.KickMembers)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Kick Members"]')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const userToKick = interaction.options.getUser('membre')
    const reason = interaction.options.getString('raison') || 'Aucune raison donnée'

    const memberToKick = await server.members.fetch(userToKick.id).catch(() => null)
    if (!memberToKick) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle(`Le membre ${userToKick.displayName} n'est plus sur le serveur.`)

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    if (await testStaff(userToKick, interaction)) { return }

    const mpEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setAuthor(author)
      .setTitle(`Vous avez été kick du serveur ${server.name}`)
      .setDescription(`Raison: [${reason}]`)

    // Le message privé part avant l'expulsion (ensuite plus aucun serveur en commun) ; s'il échoue (MP fermés), on ignore
    const mp = await memberToKick.send({ embeds: [mpEmbed] }).catch(() => null)

    try {
      await memberToKick.kick(reason)
    } catch (error) {
      // Rôle du membre au-dessus de celui du bot, propriétaire du serveur, permission manquante… : on retire le message qui annonçait l'expulsion
      await mp?.delete().catch(() => {})
      console.error('Erreur /kick', error)
      await interaction.reply({ content: `❌ Je n'ai pas pu expulser ${userToKick.displayName}. Mon rôle est-il bien au-dessus du sien, et ai-je la permission « Expulser des membres » ?`, ephemeral: true })
      return
    }

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
