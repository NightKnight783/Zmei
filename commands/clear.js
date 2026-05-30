const { SlashCommandBuilder, Colors, EmbedBuilder, PermissionFlagsBits } = require('discord.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Surprime les derniers message.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option
        .setName('nombre')
        .setRequired(false)
        .setDescription('Le nombre de message à supprimer (Défault: 10).')
    ).addBooleanOption(option =>
      option
        .setName('épinglés')
        .setRequired(false)
        .setDescription('Supprimer les méssage épinglés? (Défault: False)')
    ),
  async execute (interaction) {
    const member = interaction.guild.members.cache.get(interaction.user.id)

    const author = {
      name: interaction.user.displayName,
      iconURL: 'https://cdn.discordapp.com/avatars/' + interaction.user.id + '/' + interaction.user.avatar
    }

    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor(author)
        .setTitle('Désolé mais vous n\'avez pas la permission d\'utiliser cette commande. [Requiert la permission "Manage Messages"]')

      await interaction.reply(
        {
          embeds: [embed],
          ephemeral: true
        })
      return
    }

    const quantity = interaction.options.getInteger('nombre') ? interaction.options.getInteger('nombre') : 10
    const pinned = interaction.options.getBoolean('épinglés') ? interaction.options.getBoolean('épinglés') : false

    let fetched = await interaction.channel.messages.fetch({ limit: quantity })
    if (!pinned) {
      fetched = fetched.filter(mes => !mes.pinned)
    }

    await interaction.channel.bulkDelete(fetched).then(message => {
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor(author)
        .setTitle(`Suppression avec succès de ${message.size}!`)

      interaction.reply(
        {
          embeds: [embed],
          ephemeral: true
        })
    })
  }
}
