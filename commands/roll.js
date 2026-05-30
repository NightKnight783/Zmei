const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const crypto = require('crypto');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Lance des dés (gère ! en explosion, i avec implosion, kh et kl pour garder les meilleurs/pires résultats)')
    .addStringOption(option =>
        option.setName('formule')
            .setDescription('Ex:2d20, 1d10!, 4d6!+2, 2d20kl1, 4d4!kh1, 1d10i, 2d10!i, 4d6ikh3')
            .setRequired(true)
    ),

  async execute(interaction) {
    const formula = interaction.options.getString('formule').replace(/\s+/g, '').toLowerCase();
    const terms = formula.match(/[+-]?[^+-]+/g);

    if (!terms) {
        return interaction.reply({ content: "❌ Formule invalide.", ephemeral: true });
    }

    let total = 0;
    let detailsText = [];

    for (const term of terms) {
        const isNegative = term.startsWith('-');
        const signMultiplier = isNegative ? -1 : 1;
        
        let cleanTerm = term.replace(/^[+-]/, '');

        // 1. Détection de l'explosion "!"
        const isExploding = cleanTerm.includes('!');
        if (isExploding) {
            cleanTerm = cleanTerm.replace('!', '');
        }

        // 2. Détection de l'implosion "i"
        const isImploding = cleanTerm.includes('i');
        if (isImploding) {
            cleanTerm = cleanTerm.replace('i', '');
        }

        // 3. Détection des modificateurs de garde "kh" ou "kl"
        let keepType = null;
        let keepCount = 0;
        const keepMatch = cleanTerm.match(/(kh|kl)(\d+)/);
        
        if (keepMatch) {
            keepType = keepMatch[1];
            keepCount = parseInt(keepMatch[2]);
            cleanTerm = cleanTerm.replace(/(kh|kl)\d+/, '');
        }

        if (cleanTerm.includes('d')) {
            const [countStr, facesStr] = cleanTerm.split('d');
            const count = countStr === '' ? 1 : parseInt(countStr);
            const faces = parseInt(facesStr);

            if (isNaN(count) || isNaN(faces) || faces <= 0 || count <= 0) {
                return interaction.reply({ content: `❌ Format de dé invalide : \`${cleanTerm}\``, ephemeral: true });
            }
            
            if (count > 100) {
                return interaction.reply({ content: `❌ Tu ne peux pas lancer plus de 100 dés d'un coup !`, ephemeral: true });
            }

            let diceGroups = [];

            for (let i = 0; i < count; i++) {
                let initialRoll = crypto.randomInt(1, faces + 1);
                let dieTotal = initialRoll;
                let dieRollsText = [];

                // Formatage visuel du premier dé
                if (initialRoll === faces && isExploding) {
                    dieRollsText.push(`${initialRoll}!`);
                } else if (initialRoll === 1 && isImploding) {
                    dieRollsText.push(`${initialRoll}i`);
                } else {
                    dieRollsText.push(`${initialRoll}`);
                }

                // CAS A : LOGIQUE D'EXPLOSION POSITIVE EN CHAÎNE
                if (isExploding && faces > 1 && initialRoll === faces) {
                    let currentRoll = initialRoll;
                    let explosionCount = 0;
                    
                    while (currentRoll === faces && explosionCount < 20) {
                        currentRoll = crypto.randomInt(1, faces + 1);
                        dieTotal += currentRoll;
                        dieRollsText.push((currentRoll === faces) ? `${currentRoll}!` : `${currentRoll}`);
                        explosionCount++;
                    }
                }
                // CAS B : LOGIQUE D'IMPLOSION NÉGATIVE EN CHAÎNE (Nouveauté !)
                else if (isImploding && faces > 1 && initialRoll === 1) {
                    let continueImplosion = true;
                    let implosionCount = 0;
                    
                    while (continueImplosion && implosionCount < 20) {
                        let currentImplosionRoll = crypto.randomInt(1, faces + 1);
                        dieTotal -= currentImplosionRoll; // On soustrait le jet de pénalité
                        
                        if (currentImplosionRoll === faces) {
                            // Si la pénalité fait le score MAX, elle explose négativement (on met un ! pour l'indiquer)
                            dieRollsText.push(`-${currentImplosionRoll}!`);
                            continueImplosion = true; 
                        } else {
                            // Sinon, la chaîne de la guigne s'arrête ici
                            dieRollsText.push(`-${currentImplosionRoll}`);
                            continueImplosion = false;
                        }
                        implosionCount++;
                    }
                }

                diceGroups.push({
                    totalValue: dieTotal,
                    rollsText: dieRollsText,
                    kept: true
                });
            }

            // 4. Application du Kh / Kl
            if (keepType) {
                let sortedDice = [...diceGroups];
                
                if (keepType === 'kh') {
                    sortedDice.sort((a, b) => b.totalValue - a.totalValue);
                } else if (keepType === 'kl') {
                    sortedDice.sort((a, b) => a.totalValue - b.totalValue);
                }

                const actualKeepCount = Math.min(keepCount, sortedDice.length);
                for (let j = actualKeepCount; j < sortedDice.length; j++) {
                    sortedDice[j].kept = false;
                }
            }

            // 5. Calcul final et mise en forme visuelle
            let subTotal = 0;
            let rollsTextArray = [];

            for (const die of diceGroups) {
                const dieString = die.rollsText.join(', ');
                if (die.kept) {
                    subTotal += die.totalValue;
                    rollsTextArray.push(dieString);
                } else {
                    rollsTextArray.push(`~~${dieString}~~`);
                }
            }
            
            total += subTotal * signMultiplier;
            
            const signStr = term.charAt(0) === '-' ? '- ' : (detailsText.length > 0 ? '+ ' : '');
            
            let displayTerm = cleanTerm;
            if (isExploding) displayTerm += '!';
            if (isImploding) displayTerm += 'i';
            if (keepType) displayTerm += `${keepType}${keepCount}`;

            detailsText.push(`${signStr}${displayTerm} ([${rollsTextArray.join('], [')}])`);

        } else {
            const modifier = parseInt(cleanTerm);
            if (isNaN(modifier)) {
                return interaction.reply({ content: `❌ Modificateur invalide : \`${cleanTerm}\``, ephemeral: true });
            }

            total += modifier * signMultiplier;
            const signStr = term.charAt(0) === '-' ? '- ' : (detailsText.length > 0 ? '+ ' : '');
            detailsText.push(`${signStr}${modifier}`);
        }
    }

    const resultEmbed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setAuthor({ 
            name: `${interaction.user.username} lance les dés !`, 
            iconURL: interaction.user.displayAvatarURL() 
        })
        .setTitle(`Formule : \`${formula}\``)
        .addFields(
            { name: 'Détails des jets', value: detailsText.join(' ') || 'Aucun détail' },
            { name: 'Total', value: `**${total}**` }
        )
        .setTimestamp()
        .setFooter({ text: 'Système personnalisé (Implosions sans limite)' });

    await interaction.reply({ embeds: [resultEmbed] });
  }
};