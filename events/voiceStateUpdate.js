const { EmbedBuilder, Colors, Events } = require('discord.js')
const { logChannel } = require('../utils/constants.js');

module.exports = {
    name: Events.VoiceStateUpdate,
    once: false,
    async execute(oldState, newState) {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

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