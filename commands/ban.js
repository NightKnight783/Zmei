const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js')
const { testStaff, getEmbedAuthor } = require('../utils/utils')
const { getGuildConfig } = require('../utils/constants.js')
const { addSanction } = require('../utils/sanctions')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannis quelqu\'un.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre a ban')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(option =>
      option
        .setName('raison')
        .setRequired(false)
        .setMaxLength(512) // limite de Discord pour la raison inscrite au journal du serveur
        .setDescription('La raison du banissement')
    ),
  async execute (interaction) {
    const author = getEmbedAuthor(interaction.user)

    const server = interaction.guild

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Ban Members"]')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const memberToBan = interaction.options.getUser('membre')
    const reason = interaction.options.getString('raison') || 'Aucune raison donnée'

    if (await testStaff(memberToBan, interaction)) { return }

    const mpEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setAuthor(author)
      .setTitle(`Vous avez été banni du serveur ${server.name}`)
      .setDescription(`Raison: [${reason}]`)

    // Le message privé part avant le bannissement (ensuite plus aucun serveur en commun) ; s'il échoue (MP fermés), on ignore
    const mp = await memberToBan.send({ embeds: [mpEmbed] }).catch(() => null)

    try {
      await server.bans.create(memberToBan.id, { reason })
    } catch (error) {
      // Rôle du membre au-dessus de celui du bot, propriétaire du serveur, permission manquante… : on retire le message qui annonçait le bannissement
      await mp?.delete().catch(() => {})
      console.error('Erreur /ban', error)
      await interaction.reply({ content: `❌ Je n'ai pas pu bannir ${memberToBan.displayName}. Mon rôle est-il bien au-dessus du sien, et ai-je la permission « Bannir des membres » ?`, ephemeral: true })
      return
    }

    await addSanction(memberToBan.id, memberToBan.displayName, {
      type: 'Ban',
      date: Date.now(),
      moderator: interaction.user.id,
      reason
    })

    const embed = new EmbedBuilder()
      .setColor(Colors.Grey)
      .setAuthor(author)
      .setTitle(`Le membre ${memberToBan.displayName} a bien été banni!`)
      .setDescription(`Raison: [${reason}]`)

    await interaction.reply({ embeds: [embed] })

    const { logChannel } = getGuildConfig(server.id)
    const channel = server.channels.cache.get(logChannel)
    if (channel) {
      const logEmbed = new EmbedBuilder()
        .setColor(Colors.Grey)
        .setAuthor(author)
        .setTitle(`Le membre ${memberToBan.displayName} a été banni par ${interaction.user.displayName}`)
        .setDescription(`Raison: [${reason}]`)

      await channel.send({ embeds: [logEmbed] })
    }
  }
}
