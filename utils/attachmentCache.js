// Discord révoque l'accès aux pièces jointes d'un message dès que celui-ci est
// supprimé : les récupérer *après* la suppression (dans l'event MessageDelete)
// est donc peu fiable. On les télécharge à la place dès la création du message
// et on les garde en mémoire un moment, au cas où il faille les ressortir pour
// le log de suppression.

const MAX_ENTRIES = 200
const MAX_FILE_SIZE = 8 * 1024 * 1024 // 8 Mo, limite d'upload par défaut de Discord
const TTL = 30 * 60 * 1000 // 30 minutes

const cache = new Map()

const cleanup = () => {
  const now = Date.now()
  for (const [id, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(id)
  }
}

/**
 * Télécharge et met en cache les pièces jointes d'un message.
 * Ne fait rien pour les fichiers trop volumineux (ils resteront simplement
 * signalés comme irrécupérables si le message est supprimé).
 *
 * @param {string} messageId
 * @param {import('discord.js').Collection} attachments
 */
const cacheAttachments = async (messageId, attachments) => {
  if (!attachments || attachments.size === 0) return

  cleanup()
  if (cache.size >= MAX_ENTRIES) {
    cache.delete(cache.keys().next().value)
  }

  const files = []

  for (const attachment of attachments.values()) {
    if (attachment.size > MAX_FILE_SIZE) continue

    try {
      const response = await fetch(attachment.url)
      if (!response.ok) continue

      const buffer = Buffer.from(await response.arrayBuffer())
      files.push({ name: attachment.name, buffer, contentType: attachment.contentType })
    } catch (error) {
      console.error('[AttachmentCache] Impossible de mettre en cache une pièce jointe:', error)
    }
  }

  if (files.length > 0) {
    cache.set(messageId, { expiresAt: Date.now() + TTL, files })
  }
}

/**
 * Récupère (et retire du cache) les pièces jointes mises en cache pour un message.
 *
 * @param {string} messageId
 * @returns {{name: string, buffer: Buffer, contentType: string|null}[]|null}
 */
const getCachedAttachments = (messageId) => {
  const entry = cache.get(messageId)
  if (!entry) return null

  cache.delete(messageId)
  return entry.files
}

module.exports = {
  cacheAttachments,
  getCachedAttachments
}
