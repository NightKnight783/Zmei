const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js')
const { Database } = require('sqlite3')
const { getMedal } = require('../utils/utils')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Montre les membres avec le plus d\'xp.'),
  async execute (interaction) {
    const author = {
      name: interaction.user.globalName,
      iconURL: 'https://cdn.discordapp.com/avatars/' + interaction.user.id + '/' + interaction.user.avatar
    }

    const db = new Database('Database.sqlite')

    db.all('SELECT * FROM data ORDER BY level DESC, xp DESC LIMIT 10', [], (error, value) => {
      if (error) {
        console.error(error)
        return
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setAuthor(author)
        .setTitle('Leaderboard')
        .setDescription('Voici les ' + value.length + ' membres les plus actifs du serveur:')

      for (let i = 1; i <= value.length; i++) {
        embed.addFields({
          name: getMedal(i) + ' ' + value[i - 1].userName,
          value: 'Level: ' + value[i - 1].level + ' | Xp: ' + value[i - 1].xp + ''
        })
      }

      db.close()

      interaction.reply({
        embeds: [embed]
      })
    })
  }
}
