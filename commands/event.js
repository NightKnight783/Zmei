const { SlashCommandBuilder, PermissionFlagsBits, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('Gérer les événements du serveur.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Créer un nouvel événement officiel.')
                .addStringOption(option => option.setName('nom').setDescription('Nom de l\'événement').setRequired(true))
                .addStringOption(option => option.setName('date').setDescription('Date (JJ/MM/AAAA)').setRequired(true))
                .addStringOption(option => option.setName('heure').setDescription('Heure (HH:MM)').setRequired(true))
                .addStringOption(option => option.setName('description').setDescription('Description de l\'événement').setRequired(false))
                .addStringOption(option => option.setName('lieu').setDescription('Lieu ou salon vocal').setRequired(false))
                .addAttachmentOption(option => option.setName('image').setDescription('Image de couverture de l\'événement').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Affiche la liste des événements à venir.')
        ),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'create') {
            // Vérification des permissions
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
                return interaction.reply({ content: '❌ Vous n\'avez pas la permission de créer des événements.', ephemeral: true });
            }

            const name = interaction.options.getString('nom');
            const dateStr = interaction.options.getString('date');
            const timeStr = interaction.options.getString('heure');
            const description = interaction.options.getString('description') || '';
            const location = interaction.options.getString('lieu') || 'À définir';
            const image = interaction.options.getAttachment('image');

            // Parsing de la date (JJ/MM/AAAA) et de l'heure (HH:MM)
            const dateParts = dateStr.split('/');
            const timeParts = timeStr.split(':');

            if (dateParts.length !== 3 || timeParts.length !== 2) {
                return interaction.reply({ content: '❌ Format de date ou d\'heure invalide. Utilisez JJ/MM/AAAA et HH:MM.', ephemeral: true });
            }

            const day = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1; // Les mois commencent à 0 en JS
            const year = parseInt(dateParts[2], 10);
            const hours = parseInt(timeParts[0], 10);
            const minutes = parseInt(timeParts[1], 10);

            const scheduledStartTime = new Date(year, month, day, hours, minutes);

            // Vérifier que la date est dans le futur
            if (scheduledStartTime.getTime() <= Date.now()) {
                return interaction.reply({ content: '❌ La date et l\'heure de l\'événement doivent être dans le futur.', ephemeral: true });
            }

            // Fin prévue par défaut : 2 heures plus tard (Discord exige souvent une date de fin pour les événements externes)
            const scheduledEndTime = new Date(scheduledStartTime.getTime() + 2 * 60 * 60 * 1000);

            try {
                await interaction.deferReply({ ephemeral: false });

                const eventData = {
                    name: name,
                    scheduledStartTime: scheduledStartTime,
                    scheduledEndTime: scheduledEndTime,
                    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                    entityType: GuildScheduledEventEntityType.External,
                    entityMetadata: { location: location },
                    description: description
                };

                // Si une image a été fournie et qu'il s'agit bien d'une image
                if (image && image.contentType && image.contentType.startsWith('image/')) {
                    // Discord accepte directement l'URL de l'image
                    eventData.image = image.url;
                }

                const createdEvent = await interaction.guild.scheduledEvents.create(eventData);

                const embed = new EmbedBuilder()
                    .setColor(Colors.Green)
                    .setTitle('✅ Événement créé avec succès !')
                    .setDescription(`L'événement **${createdEvent.name}** a été programmé.\\n\\n🔗 **[Cliquez ici pour voir l'événement](${createdEvent.url})**`)
                    .setTimestamp();

                if (image) {
                    embed.setThumbnail(image.url);
                }

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error("Erreur création event:", error);
                await interaction.editReply({ content: '❌ Une erreur est survenue lors de la création de l\'événement. Vérifiez que mes permissions sont correctes.' });
            }

        } else if (interaction.options.getSubcommand() === 'list') {
            await interaction.deferReply({ ephemeral: false });

            try {
                const events = await interaction.guild.scheduledEvents.fetch();
                
                if (events.size === 0) {
                    return interaction.editReply({ content: '📅 Aucun événement n\'est actuellement programmé sur le serveur.' });
                }

                // Trier par date d'approche
                const sortedEvents = Array.from(events.values()).sort((a, b) => a.scheduledStartTimestamp - b.scheduledStartTimestamp);

                const embed = new EmbedBuilder()
                    .setColor(Colors.Purple)
                    .setTitle('📅 Prochains Événements')
                    .setDescription('Voici la liste des événements à venir sur le serveur :');

                for (const event of sortedEvents) {
                    // Formater la date en français (ajusté pour que ce soit lisible sans intl complexe)
                    const date = new Date(event.scheduledStartTimestamp);
                    const dateStr = date.toLocaleDateString('fr-FR') + ' à ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    
                    const location = event.entityMetadata ? event.entityMetadata.location : (event.channel ? `<#${event.channelId}>` : 'À définir');
                    
                    embed.addFields({
                        name: `${event.name}`,
                        value: `**Date:** ${dateStr}\\n**Lieu:** ${location}\\n**Intéressés:** 👥 ${event.userCount || 0}\\n🔗 [Lien de l'événement](${event.url})`,
                        inline: false
                    });
                }

                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error("Erreur listing events:", error);
                await interaction.editReply({ content: '❌ Impossible de récupérer la liste des événements.' });
            }
        }
    }
};
