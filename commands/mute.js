const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js')
const { testStaff, getEmbedAuthor } = require('../utils/utils')
const { getGuildConfig } = require('../utils/constants.js')
const { addSanction } = require('../utils/sanctions')

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000 // Discord n'autorise pas plus de 28 jours

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute quelqu\'un.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre a mute')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addStringOption(option =>
      option
        .setName('raison')
        .setRequired(false)
        .setMaxLength(512) // limite de Discord pour la raison inscrite au journal du serveur
        .setDescription('La raison du mute')
    )
    .addIntegerOption(option =>
      option
        .setName('duree')
        .setRequired(false)
        .setDescription('La durée du mute, dans l\'unité choisie (par défaut : 1)')
    )
    .addStringOption(option =>
      option
        .setName('unite')
        .setRequired(false)
        .setDescription('L\'unité de la durée du mute (par défaut : minutes)')
        .addChoices(
          { name: 'Minutes', value: 'minute' },
          { name: 'Heures', value: 'heure' },
          { name: 'Jours', value: 'jour' }
        )
    ),
  async execute (interaction) {
    const author = getEmbedAuthor(interaction.user)

    const server = interaction.guild

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.MuteMembers)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Mute Members"]')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const userToMute = interaction.options.getUser('membre')
    const reason = interaction.options.getString('raison') || 'Aucune raison donnée'

    const time = interaction.options.getInteger('duree') ?? 1
    let unite = interaction.options.getString('unite') || 'minute'

    const memberToMute = await server.members.fetch(userToMute.id).catch(() => null)
    if (!memberToMute) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle(`Le membre ${userToMute.displayName} n'est plus sur le serveur.`)

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    if (await testStaff(userToMute, interaction)) { return }

    if (time < 1) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Le temps donnée est invalide, il doit être supérieure ou égale a 1.')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const unitSeconds = unite === 'minute' ? 60 : unite === 'heure' ? 60 * 60 : 24 * 60 * 60
    const timeStamp = time * 1000 * unitSeconds

    if (timeStamp > MAX_TIMEOUT_MS) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('La durée du mute ne peut pas dépasser 28 jours (limite de Discord).')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const mpEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setAuthor(author)
      .setTitle(`Vous avez été mute du serveur ${server.name} pendant \`${time} ${unite}\``)
      .setDescription(`Raison: [${reason}]`)

    // Si les MPs sont fermés, on ignore
    const mp = await memberToMute.send({ embeds: [mpEmbed] }).catch(() => null)

    try {
      await memberToMute.timeout(timeStamp, reason)
    } catch (error) {
      // Rôle du membre au-dessus de celui du bot, administrateur (Discord n'en met pas en sourdine), permission manquante… : on retire le message qui annonçait le mute
      await mp?.delete().catch(() => {})
      console.error('Erreur /mute', error)
      await interaction.reply({ content: `❌ Je n'ai pas pu mettre ${userToMute.displayName} en sourdine. Mon rôle est-il bien au-dessus du sien, n'est-il pas administrateur, et ai-je la permission « Exclure temporairement des membres » ?`, ephemeral: true })
      return
    }

    if (time > 1) unite += 's'

    await addSanction(userToMute.id, userToMute.displayName, {
      type: 'Mute',
      date: Date.now(),
      moderator: interaction.user.id,
      reason,
      time: `${time} ${unite}`
    })

    const embed = new EmbedBuilder()
      .setColor(Colors.Grey)
      .setAuthor(author)
      .setTitle(`Le membre ${userToMute.displayName} a bien été mute pendant \`${time} ${unite}\`!`)
      .setDescription(`Raison: [${reason}]`)

    await interaction.reply({ embeds: [embed] })

    const { logChannel } = getGuildConfig(server.id)
    const channel = server.channels.cache.get(logChannel)
    if (channel) {
      const logEmbed = new EmbedBuilder()
        .setColor(Colors.Grey)
        .setAuthor(author)
        .setTitle(`Le membre ${userToMute.displayName} a été mute par ${interaction.user.displayName}`)
        .setDescription(`Durée: \`${time} ${unite}\`\nRaison: [${reason}]`)

      await channel.send({ embeds: [logEmbed] })
    }
  }
}
