const { Database } = require('sqlite3')

try {
  const db = new Database('Database.sqlite')

  db.run(
    `CREATE TABLE IF NOT EXISTS data (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL UNIQUE,
      userName TEXT NOT NULL DEFAULT 'default',
      xp INTEGER NOT NULL DEFAULT 0,
      xpCooldown INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      money INTEGER NOT NULL DEFAULT 0,
      sanctions TEXT NOT NULL DEFAULT '[]'
    )`
  )

  db.close()

  //Alter Exemple
  // db.run(`
  //  ALTER TABLE xp
  //  ADD cooldownDaily INTEGER NOT NULL DEFAULT 0
  // `)

  // Delete Exemple
  // db.rub(`SELECT * FROM memrbs_xp ORDER_BY level, xp DESC LIMIT 10`)
  // db.run(`DELETE FROM members_xp WHERE userId = ?`, [value.userId])

  console.log("Les tables de données ont été initialisés dans le cas ou elles ne l'étaient pas!")
} catch (e) {
  console.log('Une erreur est survenue:\n`' + e + '`')
}
