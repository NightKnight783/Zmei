const { db } = require('./database')

/**
 * Récupère la ligne d'un utilisateur dans la table `data`.
 *
 * @param {string} userId
 * @returns {Promise<object|undefined>}
 */
const getUserRow = (userId) => new Promise((resolve, reject) => {
  db.get('SELECT * FROM data WHERE userId = ?', [userId], (error, row) => {
    if (error) return reject(error)
    resolve(row)
  })
})

/**
 * Ajoute une sanction à l'historique d'un utilisateur (crée la ligne si besoin).
 * Le numéro de la sanction (utilisé par `/inspect` et `/sanction-remove`) correspond
 * à sa position dans le tableau, dans l'ordre où les sanctions ont été créées.
 *
 * @param {string} userId
 * @param {string} userName
 * @param {object} sanction
 * @returns {Promise<number>} Le numéro de la sanction ajoutée.
 */
const addSanction = async (userId, userName, sanction) => {
  const row = await getUserRow(userId)
  const sanctions = row ? JSON.parse(row.sanctions) : []
  sanctions.push(sanction)

  await new Promise((resolve, reject) => {
    if (!row) {
      db.run(
        'INSERT INTO data (userId, userName, sanctions) VALUES (?, ?, ?)',
        [userId, userName, JSON.stringify(sanctions)],
        (error) => (error ? reject(error) : resolve())
      )
    } else {
      db.run(
        'UPDATE data SET sanctions = ?, userName = ? WHERE userId = ?',
        [JSON.stringify(sanctions), userName, userId],
        (error) => (error ? reject(error) : resolve())
      )
    }
  })

  return sanctions.length
}

/**
 * Récupère l'historique brut des sanctions d'un utilisateur (tableau vide si inconnu).
 *
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
const getSanctions = async (userId) => {
  const row = await getUserRow(userId)
  return row ? JSON.parse(row.sanctions) : []
}

/**
 * Supprime une sanction via son numéro (1-indexé, dans l'ordre de création).
 *
 * @param {string} userId
 * @param {number} numero
 * @returns {Promise<object|null>} La sanction supprimée, ou `null` si le numéro est invalide.
 */
const removeSanction = async (userId, numero) => {
  const row = await getUserRow(userId)
  if (!row) return null

  const sanctions = JSON.parse(row.sanctions)
  const index = numero - 1
  if (index < 0 || index >= sanctions.length) return null

  const [removed] = sanctions.splice(index, 1)

  await new Promise((resolve, reject) => {
    db.run(
      'UPDATE data SET sanctions = ? WHERE userId = ?',
      [JSON.stringify(sanctions), userId],
      (error) => (error ? reject(error) : resolve())
    )
  })

  return removed
}

module.exports = {
  getUserRow,
  addSanction,
  getSanctions,
  removeSanction
}
