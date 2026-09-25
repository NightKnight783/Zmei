const { Events } = require('discord.js')
const { getGuildConfig } = require('../utils/constants.js')

module.exports = {
  name: Events.InteractionCreate,
  once: false,
  async execute (interaction) {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName)

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`)
        return
      }

      try {
        await command.execute(interaction)
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}`)
        console.error(error)
      }
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'pole_role_select') {
        const config = getGuildConfig(interaction.guild.id);
        const member = interaction.member;

        // Liste des clés de rôles gérées par ce menu
        const possibleRoleKeys = ['roleJeuVideo', 'roleWargame', 'roleEchecs', 'roleMJ'];
        
        const addedRoles = [];
        const removedRoles = [];

        // On reporte sa décision aux serveurs Discord
        await interaction.deferReply({ ephemeral: true });

        for (const key of possibleRoleKeys) {
            const roleId = config[key];
            if (!roleId) continue;

            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) continue; // Si le rôle configuré n'existe pas ou ID invalide

            // Si l'utilisateur a sélectionné ce rôle dans le menu
            if (interaction.values.includes(key)) {
                if (!member.roles.cache.has(roleId)) {
                    await member.roles.add(role).catch(console.error);
                    addedRoles.push(role.name);
                }
            } else {
                // S'il n'est pas sélectionné mais qu'il l'a déjà, on le retire
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(role).catch(console.error);
                    removedRoles.push(role.name);
                }
            }
        }

        let replyMessage = '✅ Vos rôles ont été mis à jour avec succès !\n';
        if (addedRoles.length > 0) replyMessage += `**Ajoutés :** ${addedRoles.join(', ')}\n`;
        if (removedRoles.length > 0) replyMessage += `**Retirés :** ${removedRoles.join(', ')}\n`;
        if (addedRoles.length === 0 && removedRoles.length === 0) replyMessage += '*Aucun changement.*';

        await interaction.editReply({ content: replyMessage });
      }
    }
  }
}
