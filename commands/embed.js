const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Crée et envoie un message sous forme d\'embed personnalisé.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(option =>
      option.setName('titre')
        .setDescription('Le titre de l\'embed')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('description')
        .setDescription('La description de l\'embed (tapez \\n pour faire un retour à la ligne)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('couleur')
        .setDescription('La couleur de l\'embed (ex: #ff0000, Blue, Red, etc.)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('image')
        .setDescription('L\'URL d\'une image à afficher en grand')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('thumbnail')
        .setDescription('L\'URL d\'une petite image à afficher en haut à droite')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('footer')
        .setDescription('Le texte du pied de page')
        .setRequired(false)
    ),

  async execute(interaction) {
    const title = interaction.options.getString('titre');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('couleur');
    const image = interaction.options.getString('image');
    const thumbnail = interaction.options.getString('thumbnail');
    const footer = interaction.options.getString('footer');

    // Vérification : il faut au moins un élément affichable
    if (!title && !description && !image) {
        return interaction.reply({ content: '❌ Vous devez fournir au moins un titre, une description ou une image pour créer l\'embed.', ephemeral: true });
    }

    const embed = new EmbedBuilder();

    if (title) embed.setTitle(title);
    
    // Remplace les \n tapés dans la commande par de vrais retours à la ligne
    if (description) embed.setDescription(description.replace(/\\n/g, '\n'));

    if (footer) embed.setFooter({ text: footer });

    if (image) {
        if (image.startsWith('http')) {
            embed.setImage(image);
        } else {
            return interaction.reply({ content: '❌ L\'URL de l\'image est invalide. Elle doit commencer par http/https.', ephemeral: true });
        }
    }

    if (thumbnail) {
        if (thumbnail.startsWith('http')) {
            embed.setThumbnail(thumbnail);
        } else {
            return interaction.reply({ content: '❌ L\'URL du thumbnail est invalide. Elle doit commencer par http/https.', ephemeral: true });
        }
    }

    if (color) {
        try {
            embed.setColor(color);
        } catch (e) {
            // Fallback si le format de couleur n'est pas reconnu par discord.js
            embed.setColor(Colors.Blue);
        }
    } else {
        embed.setColor(Colors.Blue); // Couleur par défaut
    }

    // Le bot envoie l'embed dans le salon où la commande a été tapée
    await interaction.channel.send({ embeds: [embed] });
    
    // On répond à l'utilisateur de manière invisible (éphémère) pour ne pas polluer
    await interaction.reply({ content: '✅ L\'embed a été envoyé avec succès dans ce salon !', ephemeral: true });
  }
};
