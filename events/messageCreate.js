const { EmbedBuilder, Colors, Events } = require('discord.js')
const { db } = require('../utils/database')
const { getRandomInt, getEmbedAuthor } = require('../utils/utils')
const { cacheAttachments } = require('../utils/attachmentCache')
const { clientId } = require('../config.json')

const cooldown = 15 * 1000 // 15s

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute (message) {
    if (message.author.bot) return

    if (message.attachments.size > 0) {
      // Volontairement non attendu : ne doit pas ralentir le traitement du message.
      cacheAttachments(message.id, message.attachments)
    }

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
          // Vérification du cooldown (15 secondes entre chaque gain d'XP)
          if (Date.now() - (new Date(value.xpCooldown)).getTime() < cooldown) return

          let level = parseInt(value.level)
          // Gain d'XP aléatoire entre 20 et 50
          let xp = parseInt(value.xp) + getRandomInt(30, 20)

          // Vérification du passage de niveau (formule: 500 + (niveau - 1) * 100)
          // Le niveau max est capé à 100.
          if (level < 100 && 500 + (level - 1) * 100 <= xp) {
            xp -= (500 + (level - 1) * 100)
            level++

            const author = getEmbedAuthor(message.author)

            const embed = new EmbedBuilder()
              .setColor(Colors.Blue)
              .setAuthor(author)
              .setTitle(`Bravo ${message.author.displayName}!`)
              .setDescription(`Vous avez atteint le niveau ${level}!`) // Correction de la faute d'orthographe "attend" -> "atteint"

            const channel = message.guild.channels.cache.get(message.channelId)

            if (!channel) { return }

            await channel.send({ embeds: [embed] })
          }
          
          // Mise à jour de la base de données
          db.run('UPDATE data SET xp = ?, level = ?, userName = ?, xpCooldown = ? WHERE userId = ?',
            [
              xp,
              level,
              message.author.displayName,
              Date.now(),
              value.userId
            ])
        }
      })
    })
  }
}
