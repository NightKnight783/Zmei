const { SlashCommandBuilder, PermissionFlagsBits, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType, EmbedBuilder, Colors, MessageFlags } = require('discord.js');
const antre = require('../utils/antre.js');
const { evenementsAntreActifs } = require('../utils/constants.js');
const synchro = require('../utils/antre-evenements.js');
const { evenementsAVenir, oublierEvenements, libellesTypes, nomEvenement, embedListe, embedEvenement } = require('../utils/antre-affichage.js');

/** Durée par défaut d'un événement quand on n'indique pas d'heure de fin. */
const DUREE_PAR_DEFAUT_MIN = 120;

/** Sur un serveur qui reflète les événements du site, `/event` passe par le site : une seule fiche, deux endroits. */
const passeParLeSite = (interaction) => antre.estConfigure() && evenementsAntreActifs(interaction.guildId);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('Gérer les événements du serveur et ceux du site de l\'association.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Créer un nouvel événement officiel (sur le site et ici).')
                .addStringOption(option => option.setName('nom').setDescription('Nom de l\'événement').setRequired(true).setMaxLength(120))
                .addStringOption(option => option.setName('date').setDescription('Date (JJ/MM/AAAA)').setRequired(true))
                .addStringOption(option => option.setName('heure').setDescription('Heure de début (HH:MM)').setRequired(true))
                .addStringOption(option => option.setName('fin').setDescription('Heure de fin (HH:MM), le lendemain si elle est avant le début (défaut : 2 h après le début)').setRequired(false))
                .addStringOption(option => option.setName('type').setDescription('Type d\'événement (défaut : autre événement de jeu de rôle)').setRequired(false).setAutocomplete(true))
                .addStringOption(option => option.setName('description').setDescription('Description de l\'événement').setRequired(false))
                .addStringOption(option => option.setName('lieu').setDescription('Lieu ou salon vocal').setRequired(false).setMaxLength(100))
                .addAttachmentOption(option => option.setName('image').setDescription('Image de couverture (serveurs sans lien avec le site seulement)').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Affiche la liste des événements à venir.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Détails d\'un événement du site : tables et nombre de joueurs.')
                .addStringOption(option => option.setName('evenement').setDescription('L\'événement').setRequired(true).setAutocomplete(true))
        ),

    async execute(interaction) {
        const sous = interaction.options.getSubcommand();
        if (sous === 'info') return this.info(interaction);
        if (sous === 'create') return passeParLeSite(interaction) ? this.creerViaLeSite(interaction) : this.creerSurDiscord(interaction);
        return passeParLeSite(interaction) ? this.listerLeSite(interaction) : this.listerDiscord(interaction);
    },

    // --- Avec le site : les événements sont ceux de l'association ----------------------------------------------------

    /**
     * Crée l'événement sur le site au nom du compte lié (modérateur ou administrateur du site) ; le bot en fait aussitôt
     * l'événement Discord (même chemin que pour un événement créé sur le site : pas de doublon).
     */
    async creerViaLeSite(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const debut = synchro.lireDateHeure(interaction.options.getString('date'), interaction.options.getString('heure'));
            if (!debut) {
                return interaction.editReply({ content: '❌ Date ou heure invalide. Utilisez JJ/MM/AAAA et HH:MM (par exemple 09/10/2026 et 20:00).' });
            }
            if (debut <= synchro.maintenantParis()) {
                return interaction.editReply({ content: '❌ La date et l\'heure de l\'événement doivent être dans le futur (heure de Paris).' });
            }

            let fin = synchro.ajouterMinutes(debut, DUREE_PAR_DEFAUT_MIN);
            const heureFin = interaction.options.getString('fin');
            if (heureFin) {
                // L'heure de fin est celle du jour du début ; avant (ou égale à) le début : le lendemain (nocturne)
                const finLue = synchro.lireDateHeure(interaction.options.getString('date'), heureFin);
                if (!finLue) return interaction.editReply({ content: '❌ Heure de fin invalide. Utilisez HH:MM (par exemple 23:30).' });
                fin = finLue > debut ? finLue : synchro.ajouterMinutes(finLue, 24 * 60);
            }

            const description = interaction.options.getString('description') || '';
            const { types } = await libellesTypes();
            const type = interaction.options.getString('type') || 'jdr';
            if (types.length && !types.some((t) => t.cle === type)) {
                return interaction.editReply({ content: '❌ Choisissez un type dans la liste proposée (ou laissez ce champ vide).' });
            }

            const { evenement } = await antre.post('/evenements', {
                titre: interaction.options.getString('nom'),
                type,
                debut,
                fin,
                lieu: interaction.options.getString('lieu') || '',
                // Un texte court sert de résumé (affiché dans les listes), un long de message de présentation
                resume: description.length <= 400 ? description : '',
                message: description.length > 400 ? description : ''
            }, { discordId: interaction.user.id });

            oublierEvenements();
            // Le site a aussi prévenu le bot : cet appel attend simplement que l'événement Discord existe pour en donner le lien
            await synchro.synchroniser(interaction.client);
            const discord = interaction.guild ? await synchro.evenementDiscord(interaction.guild, evenement.id) : null;

            const liens = [`🔗 [Page de l'événement sur le site](${antre.urlSite(`/evenements/${evenement.id}`)})`];
            if (discord) liens.push(`📅 [Événement Discord](${discord.url})`);
            else liens.push('📅 L\'événement Discord apparaît dans un instant (le bot a besoin de la permission « Gérer les événements »).');
            const embed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('✅ Événement créé')
                .setDescription(`**${antre.neutraliser(evenement.titre)}**\n🗓 ${antre.dateEvenement(evenement.debut)}\n\n${liens.join('\n')}`)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
        } catch (error) {
            if (!(error instanceof antre.ErreurAntre)) console.error('Erreur création event via le site:', error);
            // Un compte lié qui n'est pas modérateur reçoit « interdit » du site : on explique en clair
            const message = error instanceof antre.ErreurAntre && error.statut === 403 && error.code !== 'bot_interdit'
                ? '❌ Seuls les modérateurs et les administrateurs du site peuvent créer des événements.'
                : antre.messageErreur(error);
            await interaction.editReply({ content: message, embeds: [], allowedMentions: { parse: [] } });
        }
    },

    async listerLeSite(interaction) {
        await interaction.deferReply({ ephemeral: false });
        try {
            const liste = await evenementsAVenir();
            if (!liste.length) return interaction.editReply({ content: '📅 Aucun événement à venir sur le site pour le moment.' });
            await interaction.editReply({ embeds: [embedListe(liste, { titre: '📅 Prochains événements de l\'ANTRE' })], allowedMentions: { parse: [] } });
        } catch (error) {
            if (!(error instanceof antre.ErreurAntre)) console.error('Erreur listing events (site):', error);
            await interaction.editReply({ content: antre.messageErreur(error) });
        }
    },

    /** Détails d'un événement du site : dates, lieu, tables (jeu, MJ) et nombre de joueurs. Ouvert à tout le monde. */
    async info(interaction) {
        await interaction.deferReply({ ephemeral: false });
        try {
            const id = /^\d+$/.test(interaction.options.getString('evenement') ?? '') ? Number.parseInt(interaction.options.getString('evenement'), 10) : null;
            if (!id) return interaction.editReply({ content: '❌ Choisissez un événement dans la liste proposée.' });
            const { evenement } = await antre.get(`/evenements/${id}`);
            const { valeur } = await libellesTypes();
            await interaction.editReply({ embeds: [embedEvenement(evenement, valeur)], allowedMentions: { parse: [] } });
        } catch (error) {
            if (!(error instanceof antre.ErreurAntre)) console.error('Erreur info event:', error);
            await interaction.editReply({ content: error instanceof antre.ErreurAntre && error.statut === 404 ? '❌ Cet événement n\'existe plus.' : antre.messageErreur(error) });
        }
    },

    /** Saisie semi-automatique : les événements à venir du site, ou les types d'événement. */
    async autocomplete(interaction) {
        const focus = interaction.options.getFocused(true);
        const saisie = String(focus.value).toLowerCase();
        let choix = [];
        try {
            if (focus.name === 'evenement') {
                choix = (await evenementsAVenir())
                    .filter((e) => nomEvenement(e).toLowerCase().includes(saisie))
                    .map((e) => ({ name: nomEvenement(e), value: String(e.id) }));
            } else if (focus.name === 'type') {
                choix = (await libellesTypes()).types
                    .filter((t) => `${t.libelle} ${t.categorie}`.toLowerCase().includes(saisie))
                    .map((t) => ({ name: antre.couper(`${t.libelle} (${t.categorie})`, 100), value: t.cle }));
            }
        } catch {
            // Site injoignable : la liste est simplement vide
        }
        await interaction.respond(choix.slice(0, 25)).catch(() => {});
    },

    // --- Sans le site : les événements Discord du serveur, comme avant -------------------------------------------------

    async creerSurDiscord(interaction) {
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
        const scheduledEndTime = new Date(scheduledStartTime.getTime() + DUREE_PAR_DEFAUT_MIN * 60 * 1000);

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
                .setDescription(`L'événement **${createdEvent.name}** a été programmé.\n\n🔗 **[Cliquez ici pour voir l'événement](${createdEvent.url})**`)
                .setTimestamp();

            if (image) {
                embed.setThumbnail(image.url);
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Erreur création event:", error);
            await interaction.editReply({ content: '❌ Une erreur est survenue lors de la création de l\'événement. Vérifiez que mes permissions sont correctes.' });
        }
    },

    async listerDiscord(interaction) {
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
                    value: `**Date:** ${dateStr}\n**Lieu:** ${location}\n**Intéressés:** 👥 ${event.userCount || 0}\n🔗 [Lien de l'événement](${event.url})`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Erreur listing events:", error);
            await interaction.editReply({ content: '❌ Impossible de récupérer la liste des événements.' });
        }
    }
};
