const { SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js')

const COLLECTOR_TIME = 5 * 60 * 1000 // 5 minutes

// Regroupement manuel pour un affichage plus lisible que la liste brute des
// commandes. Toute commande absente de ces listes tombe dans "Autres".
const CATEGORIES = {
  Modération: ['ban', 'unban', 'kick', 'mute', 'unmute', 'voicemute', 'voiceunmute', 'warn', 'clear', 'inspect', 'sanction-remove'],
  Communauté: ['embed', 'event', 'setup-roles'],
  'XP & Fun': ['level', 'leaderboard', 'roll'],
  Utilitaire: ['ping', 'help']
}

const buildInfosEmbed = () => new EmbedBuilder()
  .setColor(Colors.Blue)
  .setTitle('📌 Infos serveur')
  .setDescription('*Cette section sera bientôt complétée par le staff.*')

const buildXpEmbed = () => new EmbedBuilder()
  .setColor(Colors.Blue)
  .setTitle('⭐ Système d\'XP')
  .setDescription(
    'Vous gagnez entre **20 et 50 xp** aléatoirement à chaque message envoyé (les messages des bots ne comptent pas), ' +
    'avec un temps de recharge de **15 secondes** entre deux gains pour éviter le spam.\n\n' +
    'Pour passer au niveau suivant, il faut atteindre `500 + (niveau actuel - 1) x 100` xp.\n' +
    'Le niveau maximum est **100**.\n\n' +
    '**Commandes utiles**\n' +
    '`/level` — Voir votre niveau et votre xp actuels.\n' +
    '`/leaderboard` — Voir le classement des membres les plus actifs.'
  )

const buildCommandsEmbed = (interaction) => {
  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('📜 Liste des commandes')

  const allCommands = interaction.client.commands
  const seen = new Set()

  for (const [category, names] of Object.entries(CATEGORIES)) {
    const lines = names
      .filter(name => allCommands.has(name))
      .map(name => {
        seen.add(name)
        return `\`/${name}\` — ${allCommands.get(name).data.description}`
      })

    if (lines.length > 0) {
      embed.addFields({ name: category, value: lines.join('\n') })
    }
  }

  const others = [...allCommands.values()].filter(cmd => !seen.has(cmd.data.name))
  if (others.length > 0) {
    embed.addFields({
      name: 'Autres',
      value: others.map(cmd => `\`/${cmd.data.name}\` — ${cmd.data.description}`).join('\n')
    })
  }

  return embed
}

const TABS = {
  infos: { label: 'Infos serveur', build: buildInfosEmbed },
  xp: { label: 'Système XP', build: buildXpEmbed },
  commands: { label: 'Commandes', build: buildCommandsEmbed }
}

const buildRow = (active) => new ActionRowBuilder().addComponents(
  Object.entries(TABS).map(([key, tab]) =>
    new ButtonBuilder()
      .setCustomId(`help_${key}`)
      .setLabel(tab.label)
      .setStyle(key === active ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(key === active)
  )
)

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Affiche l\'aide du bot (infos serveur, système d\'xp, commandes).'),
  async execute (interaction) {
    let activeTab = 'commands'

    await interaction.reply({
      embeds: [TABS[activeTab].build(interaction)],
      components: [buildRow(activeTab)]
    })

    const message = await interaction.fetchReply()
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: COLLECTOR_TIME })

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: 'Seul l\'auteur de la commande peut changer d\'onglet.', ephemeral: true })
        return
      }

      activeTab = i.customId.replace('help_', '')
      await i.update({
        embeds: [TABS[activeTab].build(interaction)],
        components: [buildRow(activeTab)]
      })
    })

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] })
      } catch (error) {
        // Le message a peut-être été supprimé entre temps, on ignore
      }
    })
  }
}
