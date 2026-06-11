const { EmbedBuilder, Colors, Events } = require('discord.js')
const { Database } = require('sqlite3')
const { getRandomInt } = require('../utils/utils')
const { clientId } = require('../config.json')

const cooldown = 15 * 1000 // 15s

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute (message) {
    if (message.author.bot) return

    const db = new Database('Database.sqlite')

    if (message.content?.includes(`<@${clientId}>`)) {
      // Handle the bot mention
      message.react('🐾')
    }

    db.serialize(() => {
      db.get('SELECT * FROM data WHERE userId = ?', [message.author.id], async (error, value) => {
        if (error) {
          console.error(error)
          return
        }

        if (!value) {
          // Create user in Database if not exist
          db.run('INSERT into data (userId, userName, xpCooldown) values (?, ?, ?)', [message.author.id, message.author.displayName, Date.now()])
        } else {
          // Si le dernier message envoyé date de moins de 15s on ignore
          if (Date.now() - (new Date(value.xpCooldown)).getTime() < cooldown) return

          let level = parseInt(value.level)
          let xp = parseInt(value.xp) + getRandomInt(30, 20)

          if (level < 100 && 500 + (level - 1) * 100 <= xp) {
            xp -= (500 + (level - 1) * 100)
            level++

            const author = {
              name: message.author.displayName,
              iconURL: 'https://cdn.discordapp.com/avatars/' + message.author.id + '/' + message.author.avatar
            }

            const embed = new EmbedBuilder()
              .setColor(Colors.Blue)
              .setAuthor(author)
              .setTitle(`Bravo ${message.author.displayName}!`)
              .setDescription(`Vous avez attend le niveau ${level}!`)

            const channel = message.guild.channels.cache.get(message.channelId)

            if (!channel) { return }

            await channel.send({ embeds: [embed] })
          }
          db.run('UPDATE data SET xp = ?, level = ?, userName = ?, xpCooldown = ? WHERE userId = ?',
            [
              xp,
              level,
              message.author.displayName,
              Date.now(),
              value.userId
            ])
        }

        db.close()
      })
    })
  }
}
