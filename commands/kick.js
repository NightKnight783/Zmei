const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const { Database } = require('sqlite3');
const { testStaff } = require('../utils/utils');
const { logChannel } = require('../utils/constants.js');


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
    const db = new Database('Database.sqlite')

    const author = {
      name: interaction.user.displayName,
      iconURL: 'https://cdn.discordapp.com/avatars/' + interaction.user.id + '/' + interaction.user.avatar
    }

    const server = interaction.guild
    const member = server.members.cache.get(interaction.user.id)

    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        const embed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setAuthor(author)
          .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Kick Members"]')

        await interaction.reply(
          {
            embeds: [embed],
            ephemeral: true
          })

        return
    }

    const userToKick = interaction.options.getUser('membre')
    const reason = interaction.options.getString('raison') ? interaction.options.getString('raison') : 'Aucune raison donnée'

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
    }

    await memberToKick.kick( reason )

    const Sanct = {
      type: 'Kick',
      date: Date.now(),
      moderator: interaction.user.id,
      reason
    }

    db.serialize(() => {
      db.get('SELECT * FROM data WHERE userId = ?', [userToKick.id], async (error, value) => {
        if (error) {
          console.error(error)
          return
        }

        if (!value) {
          db.run('INSERT into data (userId, userName, sanctions) values (?, ?, ?)', [userToKick.id, userToKick.displayName, JSON.stringify([Sanct])])
        } else {
          db.run('UPDATE data SET sanctions = ? WHERE userId = ?', JSON.stringify([...JSON.parse(value.sanctions), Sanct]), userToKick.id)
        }

        const embed = new EmbedBuilder()
          .setColor(Colors.Grey)
          .setAuthor(author)
          .setTitle(`Le membre ${userToKick.displayName} a bien été kick!`)
          .setDescription(`Raison: [${reason}]`)

        const logEmbed = new EmbedBuilder()
          .setColor(Colors.Grey)
          .setAuthor(author)
          .setTitle(`Le membre ${userToKick.displayName} a été kick par ${interaction.user.displayName}`)
          .setDescription(`Raison: [${reason}]`)

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
