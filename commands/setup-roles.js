const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-roles')
    .setDescription('Affiche le menu déroulant pour la sélection des rôles (Pôles).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Purple)
      .setTitle('🎭 Choix des Pôles')
      .setDescription('Sélectionnez dans le menu ci-dessous les pôles auxquels vous souhaitez participer !\\nVous pouvez en choisir plusieurs.');

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('pole_role_select')
      .setPlaceholder('Choisissez vos pôles...')
      .setMinValues(0)
      .setMaxValues(4)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Jeu Vidéo')
          .setDescription('Rejoindre le pôle Jeu Vidéo')
          .setEmoji('🎮')
          .setValue('roleJeuVideo'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Wargame')
          .setDescription('Rejoindre le pôle Wargame')
          .setEmoji('🎲')
          .setValue('roleWargame'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Échecs')
          .setDescription('Rejoindre le pôle Échecs')
          .setEmoji('♟️')
          .setValue('roleEchecs'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Maître du Jeu (MJ)')
          .setDescription('Prendre le rôle de MJ')
          .setEmoji('🐉')
          .setValue('roleMJ')
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Le menu de sélection de rôles a été mis en place !', ephemeral: true });
  }
};
