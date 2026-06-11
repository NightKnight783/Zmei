const { EmbedBuilder, Colors, Events } = require('discord.js')
const { logChannel } = require('../utils/constants.js');

module.exports = {
  name: Events.MessageDelete,
    once: false,
    async execute (message) {
        if (message.partial) return; 
        if (message.author?.bot) return; 

        const logEmbed = new EmbedBuilder()
            .setTitle(':x:  Message Supprimé')
            .setColor(Colors.Red)
            .setAuthor({ 
                name: message.author.tag, 
                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
            })
            .setDescription(`Dans le salon ${message.channel}`)
            .addFields(
                { name: 'Message :', value: message.content || '*Vide ou média*' },
            )
            .setTimestamp()
            .setFooter({ text: `ID du Message : ${message.id}` });

        const channel = message.guild.channels.cache.get(logChannel)

        const filesToSend = [];

            // On vérifie si le message contenait des pièces jointes (images, fichiers...)
            if (message.attachments.size > 0) {
                for (const [id, attachment] of message.attachments) {
                    // On vérifie s'il s'agit bien d'une image
                    if (attachment.contentType?.startsWith('image/')) {
                        try {
                            // On tente de télécharger l'image immédiatement avant que Discord ne la supprime
                            const response = await fetch(attachment.url);
                            
                            if (response.ok) {
                                const arrayBuffer = await response.arrayBuffer();
                                const buffer = Buffer.from(arrayBuffer);
                                
                                // On recrée un fichier propre à envoyer
                                const file = new AttachmentBuilder(buffer, { name: attachment.name });
                                filesToSend.push(file);
                            }
                        } catch (error) {
                            console.error("[Logs] Erreur lors de la récupération de l'image supprimée :", error);
                        }
                    }
                }
            }

            // Si le message contenait des images qu'on a réussi à sauver
            if (filesToSend.length > 0) {
                logEmbed.addFields({ name: 'Pièce(s) jointe(s) sauvegardée(s) :', value: `⚠️ L'image ci-dessous a été supprimée par l'utilisateur.` });
                await channel.send({ embeds: [logEmbed], files: filesToSend });
            } else {
                // Si le message contenait une image mais qu'elle a été purgée trop vite par Discord
                if (message.attachments.size > 0) {
                    logEmbed.addFields({ name: 'Pièce jointe :', value: '❌ L\'image a été supprimée trop rapidement des serveurs de Discord pour être récupérée.' });
                }
                await channel.send({ embeds: [logEmbed] });
            }
    }
}
