const { EmbedBuilder, Colors, Events } = require('discord.js')
const { getGuildConfig } = require('../utils/constants.js');
const { couper } = require('../utils/utils.js');
module.exports = {
    name: Events.MessageUpdate,
    once: false,
    async execute(oldMessage, newMessage) {
        if (oldMessage.partial) return;
        if (oldMessage.author?.bot) return;
        if (!oldMessage.guild) return; // message privé : pas de serveur, pas de salon de logs

        if (oldMessage.content === newMessage.content) return;

        const { logChannel } = getGuildConfig(oldMessage.guild.id);
        const channel = oldMessage.guild.channels.cache.get(logChannel);
        if (!channel) return console.log("[Logs] Salon de logs introuvable pour les messages édités.");

        const embed = new EmbedBuilder()
            .setTitle('📝 Message Édité')
            .setColor(Colors.Orange)
            .setAuthor({ 
                name: oldMessage.author.tag, 
                iconURL: oldMessage.author.displayAvatarURL({ dynamic: true }) 
            })
            .setDescription(`Dans le salon ${oldMessage.channel}`)
            .addFields(
                // Un champ d'embed ne dépasse pas 1024 caractères, un message peut en avoir bien plus
                { name: 'Ancien contenu :', value: couper(oldMessage.content || '*Vide ou média*', 1024) },
                { name: 'Nouveau contenu :', value: couper(newMessage.content || '*Vide ou média*', 1024) }
            )
            .setTimestamp()
            .setFooter({ text: `ID du Message : ${oldMessage.id}` });

        await channel.send({ embeds: [embed] });
    }
};