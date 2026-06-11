const { EmbedBuilder, Colors, Events } = require('discord.js')

const messageId = ''

const general = "1180556912731897959"

module.exports = {
  name: Events.MessageReactionAdd,
  once: false,
  async execute (reaction, user) {
    if (user.bot) return

    const guild = reaction.message.guild;
    const member = guild.members.cache.get(user.id)

    if (reaction.emoji.name === '🐾') {
      reaction.message.react('🐾')
    }

    /*switch (reaction.message.id) {
      case reglementMessage: {

        const role = guild.roles.cache.find(role => role.id === roleId)
        const role2 = guild.roles.cache.find(role => role.id === roleId2)
  
        if (member.roles.cache.has(roleId)) return
  
        await member.roles.add(role)
        await member.roles.add(role2)
  
        const channel = guild.channels.cache.get(general)
        if (!channel) { return }
    
        const embed = new EmbedBuilder()
          .setColor(Colors.Blue)
          .setAuthor({ name: member.user.displayName })
          .setThumbnail('https://cdn.discordapp.com/avatars/' + member.user.id + '/' + member.user.avatar)
          .setTitle(`Bienvenue à ${member.user.displayName}!`)
  
        const welcomePing = `<@${user.id}>`
    
        try {
            await channel.send({ embeds: [embed]})
            await channel.send(welcomePing).then(v => v.delete())
        } catch(e) {
            console.error(e)
        }
        break
      }
      case rolePingMessage: {
        let role = null

        switch (reaction.emoji.name) {
          case '❔': {
            role = guild.roles.cache.find(role => role.id === rolePingEnigme)
            break
          }
          case '🎨': {
            role = guild.roles.cache.find(role => role.id === rolePingDessin)
            break
          }
          case '🕹️' : {
            role = guild.roles.cache.find(role => role.id === rolePingAnimation)
            break
          }
          case '🏆' : {
            role = guild.roles.cache.find(role => role.id === rolePingTournois)
            break
          }
          default: {
            return
          }
        }

        if (member.roles.cache.has(role.id)) return
  
        await member.roles.add(role)
      }
    }*/
  }
}
