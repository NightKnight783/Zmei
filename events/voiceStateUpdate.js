const { EmbedBuilder, Colors, Events, ChannelType, PermissionsBitField } = require('discord.js')
const { getGuildConfig } = require('../utils/constants.js');
module.exports = {
    name: Events.VoiceStateUpdate,
    once: false,
    async execute(oldState, newState) {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const guildId = newState.guild ? newState.guild.id : oldState.guild.id;
        const { logChannel, createVoiceChannelId, tempVoiceCategoryId } = getGuildConfig(guildId);
        
        // --- GESTION DES SALONS VOCAUX DYNAMIQUES ---
        
        // 1. Création d'un salon si l'utilisateur rejoint le "Salon de Création"
        if (newState.channelId === createVoiceChannelId && createVoiceChannelId && tempVoiceCategoryId) {
            try {
                const newChannel = await newState.guild.channels.create({
                    name: `Salon de ${member.user.username}`,
                    type: ChannelType.GuildVoice,
                    parent: tempVoiceCategoryId,
                    permissionOverwrites: [
                        {
                            id: member.id,
                            allow: [
                                PermissionsBitField.Flags.ManageChannels,
                                PermissionsBitField.Flags.MoveMembers,
                                PermissionsBitField.Flags.MuteMembers,
                                PermissionsBitField.Flags.DeafenMembers
                            ]
                        }
                    ]
                });
                
                // Déplacer le membre dans le nouveau salon
                await member.voice.setChannel(newChannel);
            } catch (error) {
                console.error("Erreur lors de la création d'un salon vocal dynamique :", error);
            }
        }

        // 2. Suppression d'un salon dynamique s'il devient vide
        if (oldState.channelId) {
            const oldChannel = oldState.channel;
            // Si le salon est vide, qu'il est dans la catégorie temporaire et que ce n'est pas le salon de création
            if (oldChannel && oldChannel.members.size === 0 && oldChannel.parentId === tempVoiceCategoryId && oldChannel.id !== createVoiceChannelId) {
                try {
                    await oldChannel.delete();
                } catch (error) {
                    console.error("Erreur lors de la suppression d'un salon vocal dynamique :", error);
                }
            }
        }

        // --- FIN GESTION DES SALONS VOCAUX DYNAMIQUES ---

        const channel = newState.client.channels.cache.get(logChannel);
        if (!channel) return console.log("[Logs] Salon de logs introuvable pour le vocal.");

        const embed = new EmbedBuilder()
            .setAuthor({ 
                name: member.user.tag, 
                iconURL: member.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTimestamp();

        // Cas 1 : L'utilisateur se connecte à un salon vocal
        if (!oldState.channelId && newState.channelId) {
            embed.setTitle('🟢 Connexion Vocale')
                 .setColor(Colors.Green) // Vert
                 .setDescription(`${member} a rejoint le salon vocal **${newState.channel}**.`);
        }
        
        // Cas 2 : L'utilisateur quitte complètement les salons vocaux
        else if (oldState.channelId && !newState.channelId) {
            embed.setTitle('🔴 Déconnexion Vocale')
                 .setColor(Colors.Red) // Rouge
                 .setDescription(`${member} a quitté le salon vocal **${oldState.channel}**.`);
        }
        
        // Cas 3 : L'utilisateur change de salon vocal
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            embed.setTitle('🔀 Changement de Salon')
                 .setColor(Colors.Blue) // Bleu
                 .setDescription(`${member} a migré de **${oldState.channel}** vers **${newState.channel}**.`);
        } 
        
        // Cas 4 : Autre chose (Mute, Deafen, Stream...), on ne logge pas pour éviter le spam
        else {
            return; 
        }

        await channel.send({ embeds: [embed] });
    }
};