const { EmbedBuilder, Colors, Events, AttachmentBuilder } = require('discord.js')
const { getGuildConfig } = require('../utils/constants.js')
const { getCachedAttachments } = require('../utils/attachmentCache')

module.exports = {
  name: Events.MessageDelete,
  once: false,
  async execute (message) {
    if (message.partial) return
    if (message.author?.bot) return

    const { logChannel } = getGuildConfig(message.guild.id)
    const channel = message.guild.channels.cache.get(logChannel)
    if (!channel) return console.log('[Logs] Salon de logs introuvable pour les messages supprimés.')

    const logEmbed = new EmbedBuilder()
      .setTitle(':x:  Message Supprimé')
      .setColor(Colors.Red)
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL({ dynamic: true })
      })
      .setDescription(`Dans le salon ${message.channel}`)
      .addFields(
        { name: 'Message :', value: message.content || '*Vide ou média*' }
      )
      .setTimestamp()
      .setFooter({ text: `ID du Message : ${message.id}` })

    const filesToSend = []

    if (message.attachments.size > 0) {
      // Les URLs des pièces jointes deviennent inaccessibles dès que Discord traite
      // la suppression du message : on ne peut donc pas les re-télécharger ici. On
      // utilise à la place le cache rempli à la création du message (voir
      // utils/attachmentCache.js), seul moment où elles sont encore récupérables.
      const cached = getCachedAttachments(message.id)

      if (cached && cached.length > 0) {
        let imageAttached = false

        for (const file of cached) {
          filesToSend.push(new AttachmentBuilder(file.buffer, { name: file.name }))

          if (!imageAttached && file.contentType?.startsWith('image/')) {
            logEmbed.setImage(`attachment://${file.name}`)
            imageAttached = true
          }
        }

        if (cached.length < message.attachments.size) {
          logEmbed.addFields({ name: 'Pièces jointes manquantes', value: '⚠️ Certaines pièces jointes étaient trop volumineuses pour être sauvegardées et n\'ont pas pu être récupérées.' })
        }
      } else {
        logEmbed.addFields({ name: 'Pièces jointes perdues', value: '❌ Les fichiers n\'ont pas pu être récupérés (message envoyé avant le dernier redémarrage du bot, ou fichiers trop volumineux).' })
      }
    }

    if (filesToSend.length > 0) {
      logEmbed.addFields({ name: 'Pièces jointes sauvegardées', value: '⚠️ Les fichiers ci-dessous ont pu être récupérés avant suppression.' })
      await channel.send({ embeds: [logEmbed], files: filesToSend })
    } else {
      await channel.send({ embeds: [logEmbed] })
    }
  }
}
