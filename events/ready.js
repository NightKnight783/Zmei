const { Events } = require('discord.js')
const notificationsAntre = require('../utils/antre-notifications.js')

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute (client) {
    console.log(`Ready! Logged in as ${client.user.tag}`)
    notificationsAntre.demarrer(client)
  }
}
