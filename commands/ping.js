const { SlashCommandBuilder } = require('discord.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Répond avec pong!'),
  async execute (interaction) {
    const time = Date.now()
    await interaction.reply('Pinging...')
    await interaction.editReply('Pong! ' + (Date.now() - time).toString() + 'ms.')
  }
}
