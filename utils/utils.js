const { EmbedBuilder, Colors } = require('discord.js');
const crypto = require('crypto').webcrypto;
const { getGuildConfig } = require('../utils/constants.js');

/**
 * Génère un entier aléatoire compris entre `start` et `end` (inclus).
 * Utilise l'API crypto pour plus de robustesse.
 * 
 * @param {number} end - La valeur maximale.
 * @param {number} [start=0] - La valeur minimale (par défaut 0).
 * @returns {number} L'entier généré.
 */
const getRandomInt = (end, start = 0) => {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return (array[0] % ((end - start) + 1)) + start;
};

/**
 * Retourne un emoji de médaille pour les 3 premières places, ou le rang sous forme de texte.
 * 
 * @param {number} i - La position au classement (1-indexé).
 * @returns {string} L'emoji de médaille ou le hashtag de la position (ex: #4).
 */
const getMedal = (i) => {
  switch (i) {
    case 1:
      return ':first_place: ';
    case 2:
      return ':second_place: ';
    case 3:
      return ':third_place: ';
    default:
      return `#${i}`;
  }
};

/**
 * Construit l'objet `author` (nom + avatar) attendu par `EmbedBuilder.setAuthor`.
 * Utilise `displayAvatarURL()` plutôt qu'une URL construite à la main, qui casse
 * pour les utilisateurs sans avatar personnalisé (hash `null`).
 *
 * @param {object} user - L'objet utilisateur Discord (ex: `interaction.user`).
 * @returns {{name: string, iconURL: string}}
 */
const getEmbedAuthor = (user) => ({
  name: user.displayName ?? user.globalName ?? user.username,
  iconURL: user.displayAvatarURL()
});

/**
 * Vérifie si l'utilisateur ciblé appartient au staff du serveur.
 * Si c'est le cas, répond à l'interaction avec un message d'erreur et retourne `true`.
 *
 * @param {object} user - L'objet utilisateur Discord ciblé.
 * @param {object} interaction - L'objet interaction de la commande.
 * @returns {boolean} `true` si l'utilisateur est membre du staff, `undefined` sinon.
 */
const testStaff = (user, interaction) => {
  const author = getEmbedAuthor(interaction.user);

  const member = interaction.guild.members.cache.get(user.id);
  const consts = getGuildConfig(interaction.guild.id);

  if (member.roles.cache.has(consts.roleBureau) ||
      member.roles.cache.has(consts.roleAdmin) ||
      member.roles.cache.has(consts.roleMembreCA)) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setAuthor(author)
      .setTitle('Désolé, cet utilisateur est membre du staff, je ne peux pas faire cela!');

    interaction.reply({embeds: [embed]});

    return true;
  }
};

module.exports = {
  getRandomInt,
  getMedal,
  getEmbedAuthor,
  testStaff
};
