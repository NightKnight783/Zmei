const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js')
const { Database } = require('sqlite3')
const { testStaff } = require('../utils/utils')
const { logChannel } = require('../utils/constants.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voicemute')
    .setDescription('Coupe le micro d\'un membre dans un salon vocal.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre à rendre muet')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addStringOption(option =>
      option
        .setName('raison')
        .setRequired(false)
        .setDescription('La raison de la coupure micro')
    ),
  async execute (interaction) {
    const db = new Database('Database.sqlite')

    const author = {
      name: interaction.user.displayName,
      iconURL: 'https://cdn.discordapp.com/avatars/' + interaction.user.id + '/' + interaction.user.avatar
    }

    const server = interaction.guild
    const targetMember = server.members.cache.get(interaction.user.id)

    // Vérification des permissions du modérateur
    if (!targetMember.permissions.has(PermissionsBitField.Flags.MuteMembers)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Mute Members"]')

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    const userToMute = interaction.options.getUser('membre')
    const reason = interaction.options.getString('raison') ? interaction.options.getString('raison') : 'Aucune raison donnée'

    // Protection du staff
    if (testStaff(userToMute, interaction)) { return }

    // Récupération du membre ciblé pour vérifier son état vocal
    const member = await server.members.fetch(userToMute.id).catch(() => null)
    if (!member || !member.voice.channel) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle(`Le membre ${userToMute.displayName} n'est connecté dans aucun salon vocal.`)

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    // NOUVEAU : Vérification si le membre est DÉJÀ mute
    if (member.voice.mute) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle(`Le membre ${userToMute.displayName} a déjà son micro coupé par le serveur.`)

      await interaction.reply({ embeds: [embed], ephemeral: true })
      db.close()
      return
    }

    // Action Discord : Mute en vocal
    try {
      await member.voice.setMute(true, reason)
    } catch (error) {
      console.error(error)
      return interaction.reply({ content: '❌ Je n\'ai pas pu couper le micro de ce membre. Vérifie mes permissions.', ephemeral: true })
    }

    // Envoi du MP à l'utilisateur
    const mpEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setAuthor(author)
      .setTitle(`Votre micro a été coupé sur le serveur ${server.name}`)
      .setDescription(`Raison: [${reason}]`)

    try {
      await userToMute.send({ embeds: [mpEmbed] })
    } catch (error) {
      console.log("Impossible d'envoyer un MP à l'utilisateur (DMs fermés)")
    }

    // Structure de la sanction pour la base de données
    const Sanct = {
      type: 'VoiceMute',
      date: Date.now(),
      moderator: interaction.user.id,
      reason
    }

    // Sauvegarde en Base de Données
    db.serialize(() => {
      db.get('SELECT * FROM data WHERE userId = ?', [userToMute.id], async (error, value) => {
        if (error) {
          console.error(error)
          return
        }

        if (!value) {
          db.run('INSERT into data (userId, userName, sanctions) values (?, ?, ?)', [userToMute.id, userToMute.displayName, JSON.stringify([Sanct])])
        } else {
          db.run('UPDATE data SET sanctions = ? WHERE userId = ?', JSON.stringify([...JSON.parse(value.sanctions), Sanct]), userToMute.id)
        }

        // Réponses et Logs
        const embed = new EmbedBuilder()
          .setColor(Colors.Grey)
          .setAuthor(author)
          .setTitle(`Le micro de ${userToMute.displayName} a bien été coupé !`)
          .setDescription(`Raison: [${reason}]`)

        const logEmbed = new EmbedBuilder()
          .setColor(Colors.Grey)
          .setAuthor(author)
          .setTitle(`Le micro de ${userToMute.displayName} a été coupé par ${interaction.user.displayName}`)
          .setDescription(`Raison: [${reason}]`)

        await interaction.reply({ embeds: [embed] })

        const channel = server.channels.cache.get(logChannel)
        if (channel) {
          await channel.send({ embeds: [logEmbed] })
        }
        db.close()
      })
    })
  }
}