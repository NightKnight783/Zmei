const crypto = require('crypto').webcrypto

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

module.exports = {
  getRandomInt,
  getMedal
}
