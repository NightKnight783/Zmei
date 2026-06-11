const { EmbedBuilder, Colors, Events } = require('discord.js')
const { logChannel } = require('../utils/constants.js');

module.exports = {
    name: Events.MessageUpdate,
    once: false,
    async execute(oldMessage, newMessage) {
        if (oldMessage.partial) return;
        if (oldMessage.author?.bot) return;

        if (oldMessage.content === newMessage.content) return;

        const channel = oldMessage.client.channels.cache.get(logChannel);
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
                { name: 'Ancien contenu :', value: oldMessage.content || '*Vide ou média*' },
                { name: 'Nouveau contenu :', value: newMessage.content || '*Vide ou média*' }
            )
            .setTimestamp()
            .setFooter({ text: `ID du Message : ${oldMessage.id}` });

        await channel.send({ embeds: [embed] });
    }
};