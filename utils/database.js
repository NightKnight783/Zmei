const { Database } = require('sqlite3')
const path = require('path')

// Connexion unique partagée par tout le bot, plutôt qu'une connexion
// ouverte/fermée à chaque commande (coûteux et source de conflits d'accès).
const db = new Database(path.join(__dirname, '..', 'Database.sqlite'))

// Une requête lancée sans fonction de retour qui échoue (ex. deux messages d'un nouveau membre à la même milliseconde) émet « error » sur
// la base : sans écouteur, Node arrête tout le bot. On consigne l'erreur et on continue.
db.on('error', (erreur) => console.error('[SQLite]', erreur))

module.exports = {
  db
}
