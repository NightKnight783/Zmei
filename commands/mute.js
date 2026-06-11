const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const { Database } = require('sqlite3');
const { testStaff } = require('../utils/utils');
const { logChannel } = require('../utils/constants.js');


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
		.setDescription('La raison du mute')
	)
  .addIntegerOption(option =>
    option
      .setName('duree')
      .setRequired(false)
      .setDescription('La durée du mute')
  )
  .addStringOption(option =>
    option
      .setName('temps')
      .setRequired(false)
      .setDescription('L\'unitée de temps du mute')
      .addChoices(
        { name: 'Minutes', value: 'minute' },
        { name: 'Heures', value: 'heure' },
        { name: 'Jours', value: 'jour' }
      )
  ),
  async execute (interaction) {
    const db = new Database('Database.sqlite')

    const author = {
      name: interaction.user.displayName,
      iconURL: 'https://cdn.discordapp.com/avatars/' + interaction.user.id + '/' + interaction.user.avatar
    }

    const server = interaction.guild
    const member = server.members.cache.get(interaction.user.id)

    if (!member.permissions.has(PermissionsBitField.Flags.MuteMembers)) {
        const embed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setAuthor(author)
          .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Mute Members"]')

        await interaction.reply(
          {
            embeds: [embed],
            ephemeral: true
          })

        return
    }

    const userToMute = interaction.options.getUser('membre')
    const reason = interaction.options.getString('raison') ? interaction.options.getString('raison') : 'Aucune raison donnée'

    const time = interaction.options.getInteger('duree') ? interaction.options.getInteger('duree') : 1
    let unite = interaction.options.getString('temps') ? interaction.options.getString('temps') : 'minute'

    if (testStaff(userToMute, interaction)) { return }

    if (time < 1) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Le temps donnée est invalide, il doit être supérieure ou égale a 1.')

      await interaction.reply(
        {
          embeds: [embed],
          ephemeral: true
        })
      return
    }

    const timeStamp = time * 1000 *
      unite === 'minute'? 60 :
      unite === 'heure' ? 60 * 60 : 24 * 60 * 60

    const memberToMute = server.members.cache.get(userToMute.id)

    const mpEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setAuthor(author)
      .setTitle(`Vous avez été mute du serveur ${server.name} pendant \`${time} ${unite}\``)
      .setDescription(`Raison: [${reason}]`)

    try {
      await memberToMute.send({ embeds: [mpEmbed] })
    } catch (error) {
    }

    await memberToMute.timeout(timeStamp, reason)

    if (time > 1)
      unite += 's'

    const Sanct = {
      type: 'Mute',
      date: Date.now(),
      moderator: interaction.user.id,
      reason,
      time: `${time} ${unite}`
    }

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

        const embed = new EmbedBuilder()
          .setColor(Colors.Grey)
          .setAuthor(author)
          .setTitle(`Le membre ${userToMute.displayName} a bien été mute pendant \`${time} ${unite}\`!`)
          .setDescription(`Raison: [${reason}]`)

        const logEmbed = new EmbedBuilder()
          .setColor(Colors.Grey)
          .setAuthor(author)
          .setTitle(`Le membre ${userToMute.displayName} a été mute par ${interaction.user.displayName}`)
          .setDescription(`Durée: \`${time} ${unite}\`\nRaison: [${reason}]`)

        await interaction.reply(
          {
            embeds: [embed]
          })

        const channel = server.channels.cache.get(logChannel)
        if (channel) {
          await channel.send({ embeds: [logEmbed]})
        }

        db.close()
      })
    })
  }
}
