const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js')
const { Database } = require('sqlite3')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Montre votre niveau actuel.'),
  async execute (interaction) {
    const db = new Database('Database.sqlite')

    const author = {
      name: interaction.user.globalName,
      iconURL: 'https://cdn.discordapp.com/avatars/' + interaction.user.id + '/' + interaction.user.avatar
    }

    db.serialize(() => {
      db.get('SELECT * FROM data WHERE userId = ?', [interaction.user.id], async (error, value) => {
        if (error) {
          console.error(error)
          return
        }

        if (!value) {
          // Create user in Database if not exist
          db.run('INSERT into data (userId, userName, xpCooldown) values (?, ?, ?)', [interaction.user.id, interaction.user.globalName, Date.now()])

          const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setAuthor(author)
            .setTitle('Vous êtes actuellement niveau 1')
            .setDescription('Vous avez 0 xp\nVous manquez 500 xp pour passer au niveau suivant!')

          await interaction.reply(
            {
              embeds: [embed]
            })
        } else {
          const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setAuthor(author)
            .setTitle(`Vous êtes actuellement niveau ${value.level}`)
            .setDescription(`Vous avez ${value.xp} xp\nVous manquez ${(500 + (value.level - 1) * 100) - value.xp} xp pour passer au niveau suivant!`)

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
