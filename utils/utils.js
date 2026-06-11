const { PermissionFlagsBits, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const crypto = require('crypto').webcrypto
const consts = require('../utils/constants.js')

const getRandomInt = (end, start = 0) => {
  const array = new Uint32Array(1)

  crypto.getRandomValues(array)

  return (array[0] % ((end - start) + 1)) + start
}

const getMedal = (i) => {
  switch (i) {
    case 1:
      return ':first_place: '
    case 2:
      return ':second_place: '
    case 3:
      return ':third_place: '
    default:
      return `#${i}`
  }
}

const testStaff = (user, interaction) => {
  const author = {
    name: interaction.user.displayName,
    iconURL: 'https://cdn.discordapp.com/avatars/' + interaction.user.id + '/' + interaction.user.avatar
  }

  const member = interaction.guild.members.cache.get(user.id)
  /*if (user.id === '325281667998810124') {
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setAuthor(author)
      .setTitle('Désolé, je ne peux pas faire cela à mon créateur!')

    interaction.reply({embeds: [embed]})

    return true
  }*/
  if (member.roles.cache.has(consts.roleBureau) ||
      member.roles.cache.has(consts.roleAdmin) ||
      member.roles.cache.has(consts.roleMembreCA)) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setAuthor(author)
      .setTitle('Désolé, cet utilisateur est membre du staff, je ne peux pas faire cela!')

    interaction.reply({embeds: [embed]})

    return true
  }
}

module.exports = {
  getRandomInt,
  getMedal,
  testStaff
}
