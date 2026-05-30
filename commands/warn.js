const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const { Database } = require('sqlite3');
const { testStaff } = require('../utils/utils');

const logs = "1249462029476167842"

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
    const db = new Database('Database.sqlite')

    const author = {
      name: interaction.user.displayName,
      iconURL: 'https://cdn.discordapp.com/avatars/' + interaction.user.id + '/' + interaction.user.avatar
    }

    const server = interaction.guild
    const member = server.members.cache.get(interaction.user.id)

    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        const embed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setAuthor(author)
          .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Moderate Members"]')

      await interaction.reply(
        {
          embeds: [embed],
          ephemeral: true
        })

      return
    }

    const userToWarn = interaction.options.getUser('membre')
    const reason = interaction.options.getString('raison') ? interaction.options.getString('raison') : 'Aucune raison donnée'

    if (testStaff(userToWarn, interaction)) { return }

    const Sanct = {
      type: 'Warn',
      date: Date.now(),
      moderator: interaction.user.id,
      reason
    }

    db.serialize(() => {
      db.get('SELECT * FROM data WHERE userId = ?', [userToWarn.id], async (error, value) => {
        if (error) {
          console.error(error)
          return
        }

        if (!value) {
          db.run('INSERT into data (userId, userName, sanctions) values (?, ?, ?)', [userToWarn.id, userToWarn.displayName, JSON.stringify([Sanct])])
        } else {
          db.run('UPDATE data SET sanctions = ? WHERE userId = ?', JSON.stringify([...JSON.parse(value.sanctions), Sanct]), userToWarn.id)
        }

        const embed = new EmbedBuilder()
          .setColor(Colors.Grey)
          .setAuthor(author)
          .setTitle(`Le membre ${userToWarn.displayName} a bien été avertis!`)
          .setDescription(`Raison: [${reason}]`)

        const logEmbed = new EmbedBuilder()
          .setColor(Colors.Grey)
          .setAuthor(author)
          .setTitle(`Le membre ${userToWarn.displayName} a été avertis par ${interaction.user.displayName}`)
          .setDescription(`Raison: [${reason}]`)

        await interaction.reply(
          {
            embeds: [embed]
          })

        const channel = server.channels.cache.get(logs)
        await channel.send({ embeds: [logEmbed]})

        db.close()
      })
    })
  }
}
