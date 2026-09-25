const { Database } = require('sqlite3')
const path = require('path')

// Connexion unique partagée par tout le bot, plutôt qu'une connexion
// ouverte/fermée à chaque commande (coûteux et source de conflits d'accès).
const db = new Database(path.join(__dirname, '..', 'Database.sqlite'))

module.exports = {
  db
}
