const { Events } = require('discord.js')
const { getGuildConfig } = require('../utils/constants.js')

const MESSAGE_ERREUR = {
  content: '❌ Une erreur est survenue en exécutant cette commande. Si cela se répète, prévenez le staff (le rôle ou les permissions du bot sont peut-être en cause).',
  ephemeral: true
}

/** Une commande qui échoue répond quand même : sans cela, Discord affiche « L'application ne répond plus » sans autre explication. */
async function repondreErreur (interaction) {
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(MESSAGE_ERREUR)
    else await interaction.reply(MESSAGE_ERREUR)
  } catch {
    // L'interaction a expiré (plus de trois secondes sans réponse) : rien d'autre à faire
  }
}

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
        await repondreErreur(interaction)
      }
    } else if (interaction.isAutocomplete()) {
      // Saisie semi-automatique (listes de choix des commandes /antre et /event)
      const command = interaction.client.commands.get(interaction.commandName)
      if (!command || typeof command.autocomplete !== 'function') return
      try {
        await command.autocomplete(interaction)
      } catch (error) {
        console.error(`Autocomplete ${interaction.commandName}`, error)
      }
    } else if (interaction.isButton()) {
      // Boutons des commandes qui en gèrent (« antre_code » pour /antre) ; les autres (ex. « help_… ») ont leurs propres collecteurs
      const command = interaction.client.commands.get(interaction.customId.split('_')[0])
      if (!command || typeof command.bouton !== 'function') return
      try {
        await command.bouton(interaction)
      } catch (error) {
        console.error(`Bouton ${interaction.customId}`, error)
        await repondreErreur(interaction)
      }
    } else if (interaction.isModalSubmit()) {
      // Fenêtres de saisie : l'identifiant commence par le nom de la commande (« antre_lier » pour /antre)
      const command = interaction.client.commands.get(interaction.customId.split('_')[0])
      if (!command || typeof command.modal !== 'function') return
      try {
        await command.modal(interaction)
      } catch (error) {
        console.error(`Fenêtre ${interaction.customId}`, error)
        await repondreErreur(interaction)
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
