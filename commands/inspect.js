const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js')
const { Database } = require('sqlite3')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inspect')
    .setDescription('Montre les 10 dernieres sanctions d\'un membre.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre à check')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute (interaction) {

    const author = {
      name: interaction.user.displayName,
      iconURL: 'https://cdn.discordapp.com/avatars/' + interaction.user.id + '/' + interaction.user.avatar
    }

    const db = new Database('Database.sqlite')
    const userToCheck = interaction.options.getUser('membre')
    const server = interaction.guild

    db.serialize(() => {
      db.get('SELECT * FROM data WHERE userId = ?', [userToCheck.id], async (error, value) => {
        if (error) {
          console.error(error)
          return
        }

        if (!value) {

          db.run('INSERT into data (userId, userName) values (?, ?)', [userToCheck.id, userToCheck.displayName])
        
          const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor(author)
            .setTitle(`Le membre ${userToCheck.displayName} ne possède aucune sanction enregistré!`)

          await interaction.reply(
            {
              embeds: [embed]
            })

        } else if (!(JSON.parse(value.sanctions)).length) {
          const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor(author)
            .setTitle(`Le membre ${userToCheck.displayName} ne possède aucune sanction enregistré!`)

          await interaction.reply(
            {
              embeds: [embed]
            })

        } else {
          const sanct = (JSON.parse(value.sanctions)).sort((a, b) => { return b.date - a.date })
          const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setAuthor(author)
            .setTitle(`Le membre ${userToCheck.displayName} possède ${sanct.length} sanction(s) enregistré!`)

          for (var i = 0; i < sanct.length && i < 10; i++) {
            embed.addFields({
              name: `${sanct[i].type} <t:${(sanct[i].date - (sanct[i].date % 1000)) / 1000}> par ${server.members.cache.get(sanct[i].moderator)? server.members.cache.get(sanct[i].moderator).displayName : 'Erreur'} ${sanct[i].time? ' pendant ' + sanct[i].time : ''}`,
              value: 'Reason: [' + sanct[i].reason + "]"
            })
          }

          await interaction.reply(
            {
              embeds: [embed]
            })
        }

        db.close()
      })
    })
  }
}
