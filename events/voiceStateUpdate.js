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

        // Instantané de ce qui s'est passé. `newState` est mis à jour sur place par le changement suivant (par exemple celui que provoque
        // le déplacement dans un salon dynamique, plus bas) : lu plus tard, il décrirait un autre événement.
        const idAvant = oldState.channelId;
        const idApres = newState.channelId;
        const salonAvant = oldState.channel;
        const salonApres = newState.channel;

        // --- LOGS (d'abord : dans l'ordre où les choses se passent, et avant qu'un salon temporaire ne soit supprimé) ---

        // Un salon temporaire disparaît : sa mention deviendrait « #inconnu », on écrit donc son nom
        const decrire = (salon) => {
            if (!salon) return '*un salon inconnu*';
            return salon.parentId === tempVoiceCategoryId ? `**${salon.name}**` : `${salon}`;
        };

        const channel = newState.client.channels.cache.get(logChannel);
        if (!channel) {
            console.log("[Logs] Salon de logs introuvable pour le vocal.");
        } else {
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: member.user.tag,
                    iconURL: member.user.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp();

            if (!idAvant && idApres) {
                // Cas 1 : L'utilisateur se connecte à un salon vocal
                embed.setTitle('🟢 Connexion Vocale')
                     .setColor(Colors.Green) // Vert
                     .setDescription(`${member} a rejoint le salon vocal ${decrire(salonApres)}.`);
            } else if (idAvant && !idApres) {
                // Cas 2 : L'utilisateur quitte complètement les salons vocaux
                embed.setTitle('🔴 Déconnexion Vocale')
                     .setColor(Colors.Red) // Rouge
                     .setDescription(`${member} a quitté le salon vocal ${decrire(salonAvant)}.`);
            } else if (idAvant && idApres && idAvant !== idApres) {
                // Cas 3 : L'utilisateur change de salon vocal
                embed.setTitle('🔀 Changement de Salon')
                     .setColor(Colors.Blue) // Bleu
                     .setDescription(`${member} a migré de ${decrire(salonAvant)} vers ${decrire(salonApres)}.`);
            } else {
                // Cas 4 : Autre chose (Mute, Deafen, Stream...), on ne logge pas pour éviter le spam
                embed.setTitle(null);
            }

            if (embed.data.title) await channel.send({ embeds: [embed] });
        }

        // --- GESTION DES SALONS VOCAUX DYNAMIQUES ---

        // 1. Création d'un salon si l'utilisateur rejoint le "Salon de Création"
        if (idApres === createVoiceChannelId && createVoiceChannelId && tempVoiceCategoryId) {
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
        if (idAvant) {
            const oldChannel = salonAvant;
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
    }
};
