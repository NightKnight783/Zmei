/**
 * Tests des commandes et des événements du bot (hors liaison avec le site, voir antre-evenements.test.js) : modération, niveaux,
 * dés, embed, aide, menu des rôles, logs, salons vocaux dynamiques.
 * Aucun accès réseau : un faux serveur Discord (membres, bannissements, salons) et une base SQLite en mémoire.
 */
process.env.ANTRE_URL = process.env.ANTRE_URL || 'https://antre.test';
process.env.ANTRE_API_KEY = process.env.ANTRE_API_KEY || 'cle-de-test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it, before, beforeEach } = require('node:test');
const sqlite3 = require('sqlite3');
const { PermissionsBitField, PermissionFlagsBits: P, Collection, ChannelType } = require('discord.js');

// La base du bot est partagée par tous les modules : on la remplace par une base en mémoire avant de les charger
const db = new sqlite3.Database(':memory:');
const cheminBase = require.resolve('../utils/database.js');
require.cache[cheminBase] = { id: cheminBase, filename: cheminBase, loaded: true, exports: { db } };

const sql = (requete, parametres = []) => new Promise((resolve, reject) => db.run(requete, parametres, (e) => (e ? reject(e) : resolve())));
const lignes = (requete, parametres = []) => new Promise((resolve, reject) => db.all(requete, parametres, (e, r) => (e ? reject(e) : resolve(r))));
const attendre = async (condition, message = 'condition non atteinte') => {
	for (let i = 0; i < 100; i++) {
		if (await condition()) return;
		await new Promise((r) => setTimeout(r, 10));
	}
	assert.fail(message);
};

const { getGuildConfig } = require('../utils/constants.js');
const { addSanction, getSanctions } = require('../utils/sanctions.js');

const SERVEUR = '1510323842638286890';
const SALON_LOGS = '1513952930389295205';
const config = getGuildConfig(SERVEUR);
const AVEC_CONFIG = fs.existsSync(path.join(__dirname, '..', 'config.json')); // config.json (le jeton) n'est jamais versionné

// --- Faux Discord ------------------------------------------------------------------------------------------------------------

function utilisateur(id, nom = `membre-${id}`, { mpFerme = false } = {}) {
	const mp = [];
	return {
		id, username: nom, displayName: nom, globalName: nom, tag: `${nom}#0`, bot: false, mp,
		displayAvatarURL: () => 'https://cdn.test/avatar.png',
		send: async (message) => {
			if (mpFerme) throw new Error('Cannot send messages to this user');
			mp.push(message);
			return { delete: async () => { mp.splice(mp.indexOf(message), 1); } };
		},
	};
}

/** Un serveur avec son salon de logs, ses membres, ses bannissements. `erreurs` : une erreur à lever lors de l'action. */
function monde({ sansSalonLogs = false } = {}) {
	const logs = [];
	const salons = new Map();
	if (!sansSalonLogs) salons.set(SALON_LOGS, { id: SALON_LOGS, send: async (m) => { logs.push(m); } });
	const membres = new Map();
	const bannis = new Map();
	const appels = { bans: [], debans: [], kicks: [], timeouts: [], mutesVocaux: [] };
	const erreurs = {};
	const guild = {
		id: SERVEUR,
		name: 'Serveur de test',
		members: {
			cache: membres,
			fetch: async (id) => {
				const m = membres.get(id);
				if (!m) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
				return m;
			},
		},
		channels: { cache: salons },
		bans: {
			create: async (id, options) => {
				if (erreurs.ban) throw erreurs.ban;
				bannis.set(id, options);
				appels.bans.push([id, options.reason]);
			},
			fetch: async (id) => {
				if (!bannis.has(id)) throw Object.assign(new Error('Unknown Ban'), { code: 10026 });
				return bannis.get(id);
			},
			remove: async (id, raison) => {
				bannis.delete(id);
				appels.debans.push([id, raison]);
			},
		},
		roles: { cache: new Map() },
	};
	const ajouter = (user, { permissions = [], roles = [], vocal = null } = {}) => {
		const membre = {
			id: user.id, user, displayName: user.displayName,
			permissions: new PermissionsBitField(permissions),
			roles: {
				cache: new Map(roles.map((r) => [r, { id: r, name: `role-${r}` }])),
				add: async (role) => { membre.roles.cache.set(role.id, role); },
				remove: async (role) => { membre.roles.cache.delete(role.id); },
			},
			timeoutMs: null,
			send: user.send,
			timeout: async (ms, raison) => {
				if (erreurs.timeout) throw erreurs.timeout;
				membre.timeoutMs = ms;
				appels.timeouts.push([user.id, ms, raison]);
			},
			isCommunicationDisabled: () => membre.timeoutMs !== null,
			kick: async (raison) => {
				if (erreurs.kick) throw erreurs.kick;
				appels.kicks.push([user.id, raison]);
				membres.delete(user.id);
			},
			voice: {
				channel: vocal,
				serverMute: false,
				selfMute: false,
				// Comme dans discord.js : `mute` vaut vrai si le serveur OU la personne elle-même a coupé le micro
				get mute() { return this.serverMute || this.selfMute; },
				setMute: async (valeur, raison) => {
					if (erreurs.vocal) throw erreurs.vocal;
					membre.voice.serverMute = valeur;
					appels.mutesVocaux.push([user.id, valeur, raison]);
				},
			},
		};
		membres.set(user.id, membre);
		return membre;
	};
	return { guild, logs, salons, membres, bannis, appels, erreurs, ajouter };
}

/** Une interaction de commande ; `reponses` garde tout ce que le bot a répondu. */
function interaction(m, auteur, options = {}, extra = {}) {
	const reponses = [];
	const normaliser = (a) => (typeof a === 'string' ? { content: a } : a);
	const i = {
		guild: m.guild, guildId: SERVEUR, user: auteur, member: m.membres.get(auteur.id), reponses,
		memberPermissions: m.membres.get(auteur.id)?.permissions ?? new PermissionsBitField(),
		client: extra.client ?? { commands: new Collection() },
		channel: extra.channel,
		options: {
			getUser: (n) => options[n] ?? null,
			getString: (n) => options[n] ?? null,
			getInteger: (n) => options[n] ?? null,
			getBoolean: (n) => options[n] ?? null,
			getAttachment: (n) => options[n] ?? null,
			getSubcommand: () => options.__sous,
		},
		deferred: false,
		replied: false,
		reply: async (a) => { i.replied = true; reponses.push(normaliser(a)); return {}; },
		deferReply: async (o) => { i.deferred = true; i.optionsDefer = o; },
		editReply: async (a) => { reponses.push(normaliser(a)); return {}; },
		followUp: async (a) => { reponses.push(normaliser(a)); return {}; },
		fetchReply: async () => ({ createMessageComponentCollector: () => ({ on() {} }) }),
	};
	return i;
}

/** Tout ce qu'un message contient, à plat (texte, titres, descriptions, champs, pied de page). */
function aplatir(reponse) {
	if (!reponse) return '';
	const morceaux = [reponse.content ?? ''];
	for (const e of reponse.embeds ?? []) {
		const d = e.data ?? e;
		morceaux.push(d.title ?? '', d.description ?? '', d.footer?.text ?? '', ...(d.fields ?? []).flatMap((f) => [f.name, f.value]));
	}
	return morceaux.join('\n');
}
const derniere = (i) => i.reponses[i.reponses.length - 1];
const tout = (i) => i.reponses.map(aplatir).join('\n');
const ephemere = (r) => r.ephemeral === true || r.flags !== undefined;

const MODO = [P.BanMembers, P.KickMembers, P.MuteMembers, P.ModerateMembers, P.ManageMessages];
const commande = (nom) => require(`../commands/${nom}.js`);

before(async () => {
	await sql(`CREATE TABLE IF NOT EXISTS data (
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL UNIQUE, userName TEXT NOT NULL DEFAULT 'default',
		xp INTEGER NOT NULL DEFAULT 0, xpCooldown INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1,
		money INTEGER NOT NULL DEFAULT 0, sanctions TEXT NOT NULL DEFAULT '[]')`);
});
beforeEach(() => sql('DELETE FROM data'));

// --- Modération --------------------------------------------------------------------------------------------------------------

describe('modération : refus, protection du staff, effets, traces', () => {
	const cas = [
		{ nom: 'warn', permission: P.ModerateMembers, option: 'membre', type: 'Warn' },
		{ nom: 'kick', permission: P.KickMembers, option: 'membre', type: 'Kick' },
		{ nom: 'ban', permission: P.BanMembers, option: 'membre', type: 'Ban' },
		{ nom: 'mute', permission: P.MuteMembers, option: 'membre', type: 'Mute' },
	];

	for (const c of cas) {
		describe(`/${c.nom}`, () => {
			it('refuse sans la permission, en privé, sans rien faire ni enregistrer', async () => {
				const m = monde();
				const auteur = utilisateur('1', 'simple-membre');
				const cible = utilisateur('2', 'cible');
				m.ajouter(auteur);
				m.ajouter(cible);
				const i = interaction(m, auteur, { [c.option]: cible });
				await commande(c.nom).execute(i);
				assert.match(aplatir(derniere(i)), /pas la permission/);
				assert.ok(ephemere(derniere(i)), 'le refus est privé');
				assert.equal(m.appels.bans.length + m.appels.kicks.length + m.appels.timeouts.length, 0);
				assert.deepEqual(await getSanctions('2'), []);
				assert.equal(m.logs.length, 0);
			});

			it('protège les membres du staff (bureau, administrateurs, CA)', async () => {
				for (const role of [config.roleBureau, config.roleAdmin, config.roleMembreCA]) {
					const m = monde();
					const auteur = utilisateur('1', 'modo');
					const cible = utilisateur('2', 'staff');
					m.ajouter(auteur, { permissions: MODO });
					m.ajouter(cible, { roles: [role] });
					const i = interaction(m, auteur, { [c.option]: cible });
					await commande(c.nom).execute(i);
					assert.match(aplatir(derniere(i)), /membre du staff/, `rôle ${role}`);
					assert.equal(m.appels.bans.length + m.appels.kicks.length + m.appels.timeouts.length, 0);
					assert.deepEqual(await getSanctions('2'), []);
				}
			});

			it('agit, prévient la personne en message privé, enregistre la sanction et écrit dans les logs', async () => {
				const m = monde();
				const auteur = utilisateur('1', 'modo');
				const cible = utilisateur('2', 'cible');
				m.ajouter(auteur, { permissions: MODO });
				m.ajouter(cible);
				const i = interaction(m, auteur, { [c.option]: cible, raison: 'Insultes' });
				await commande(c.nom).execute(i);
				if (c.nom === 'ban') assert.deepEqual(m.appels.bans, [['2', 'Insultes']]);
				if (c.nom === 'kick') assert.deepEqual(m.appels.kicks, [['2', 'Insultes']]);
				if (c.nom === 'mute') assert.deepEqual(m.appels.timeouts, [['2', 60_000, 'Insultes']], 'une minute par défaut');
				assert.equal(cible.mp.length, 1, 'message privé envoyé');
				assert.match(aplatir(cible.mp[0]), /Insultes/);
				const sanctions = await getSanctions('2');
				assert.equal(sanctions.length, 1);
				assert.equal(sanctions[0].type, c.type);
				assert.equal(sanctions[0].moderator, '1');
				assert.equal(sanctions[0].reason, 'Insultes');
				assert.ok(Math.abs(sanctions[0].date - Date.now()) < 5000);
				assert.match(aplatir(derniere(i)), /Insultes/);
				assert.equal(m.logs.length, 1, 'une trace dans le salon de logs');
				assert.match(aplatir(m.logs[0]), /modo/);
			});

			it('sans raison : « Aucune raison donnée » ; messages privés fermés : la sanction est tout de même appliquée', async () => {
				const m = monde();
				const auteur = utilisateur('1', 'modo');
				const cible = utilisateur('2', 'cible', { mpFerme: true });
				m.ajouter(auteur, { permissions: MODO });
				m.ajouter(cible);
				await commande(c.nom).execute(interaction(m, auteur, { [c.option]: cible }));
				assert.equal((await getSanctions('2'))[0].reason, 'Aucune raison donnée');
				assert.equal(m.logs.length, 1);
			});

			it("ne plante pas sans salon de logs", async () => {
				const m = monde({ sansSalonLogs: true });
				const auteur = utilisateur('1', 'modo');
				const cible = utilisateur('2', 'cible');
				m.ajouter(auteur, { permissions: MODO });
				m.ajouter(cible);
				const i = interaction(m, auteur, { [c.option]: cible });
				await commande(c.nom).execute(i);
				assert.equal((await getSanctions('2')).length, 1);
			});

			if (c.nom !== 'warn') {
				it('si Discord refuse (rôle de la cible au-dessus du bot, propriétaire…) : message clair, rien d\'enregistré, le message privé annonçant la sanction est retiré', async () => {
					const m = monde();
					const auteur = utilisateur('1', 'modo');
					const cible = utilisateur('2', 'cible');
					m.ajouter(auteur, { permissions: MODO });
					m.ajouter(cible);
					m.erreurs[{ kick: 'kick', ban: 'ban', mute: 'timeout' }[c.nom]] = new Error('Missing Permissions');
					const i = interaction(m, auteur, { [c.option]: cible, raison: 'test' });
					const log = console.error;
					console.error = () => {};
					try { await commande(c.nom).execute(i); } finally { console.error = log; }
					assert.match(aplatir(derniere(i)), /Je n'ai pas pu/);
					assert.ok(ephemere(derniere(i)));
					assert.deepEqual(await getSanctions('2'), []);
					assert.equal(cible.mp.length, 0, 'le message privé a été retiré');
					assert.equal(m.logs.length, 0);
				});
			}

			it("répond clairement (sans planter) quand la cible n'est pas ou plus sur le serveur", async () => {
				const m = monde();
				const auteur = utilisateur('1', 'modo');
				const absent = utilisateur('9', 'parti');
				m.ajouter(auteur, { permissions: MODO });
				const i = interaction(m, auteur, { [c.option]: absent, raison: 'test' });
				await commande(c.nom).execute(i);
				assert.ok(i.reponses.length >= 1, 'le bot répond quand même');
				if (c.nom === 'ban') assert.deepEqual(m.appels.bans, [['9', 'test']], 'on peut bannir par identifiant quelqu\'un qui est parti');
				else if (c.nom === 'warn') assert.equal((await getSanctions('9')).length, 1, 'un avertissement se garde même si la personne est partie');
				else assert.match(aplatir(derniere(i)), /n'est (plus )?sur le serveur/);
			});
		});
	}

	describe('/ban et /unban', () => {
		it('ban puis unban ; unban d\'une personne non bannie refusé', async () => {
			const m = monde();
			const modo = utilisateur('1', 'modo');
			const cible = utilisateur('2', 'cible');
			m.ajouter(modo, { permissions: MODO });
			m.ajouter(cible);
			await commande('ban').execute(interaction(m, modo, { membre: cible, raison: 'Spam' }));
			assert.ok(m.bannis.has('2'));

			const refus = interaction(m, utilisateur('1', 'modo'), { utilisateur: utilisateur('5', 'jamais-banni') });
			await commande('unban').execute(refus);
			assert.match(aplatir(derniere(refus)), /n'est pas banni/);

			const i = interaction(m, modo, { utilisateur: cible, raison: 'Pardon' });
			await commande('unban').execute(i);
			assert.ok(!m.bannis.has('2'));
			assert.deepEqual(m.appels.debans, [['2', 'Pardon']]);
			assert.deepEqual((await getSanctions('2')).map((s) => s.type), ['Ban', 'Unban']);
			assert.equal(m.logs.length, 2);
		});

		it('unban : refusé sans la permission', async () => {
			const m = monde();
			const simple = utilisateur('1', 'simple');
			m.ajouter(simple);
			m.bannis.set('2', {});
			const i = interaction(m, simple, { utilisateur: utilisateur('2') });
			await commande('unban').execute(i);
			assert.match(aplatir(derniere(i)), /pas la permission/);
			assert.ok(m.bannis.has('2'));
		});
	});

	describe('/mute et /unmute', () => {
		const prep = () => {
			const m = monde();
			const modo = utilisateur('1', 'modo');
			const cible = utilisateur('2', 'cible');
			m.ajouter(modo, { permissions: MODO });
			m.ajouter(cible);
			return { m, modo, cible };
		};

		it('durées : minutes, heures, jours, avec pluriel dans la trace', async () => {
			for (const [duree, temps, ms, texte] of [[5, 'minute', 300_000, '5 minutes'], [2, 'heure', 7_200_000, '2 heures'], [3, 'jour', 259_200_000, '3 jours'], [1, 'heure', 3_600_000, '1 heure']]) {
				const { m, modo, cible } = prep();
				await commande('mute').execute(interaction(m, modo, { membre: cible, duree, unite: temps }));
				assert.equal(m.appels.timeouts[0][1], ms, texte);
				assert.equal((await getSanctions('2')).at(-1).time, texte);
				await sql('DELETE FROM data');
			}
		});

		it('durée invalide (0, négative) ou au-delà de 28 jours : refusée sans rien faire', async () => {
			for (const [duree, temps] of [[0, 'minute'], [-3, 'heure'], [29, 'jour'], [700, 'heure'], [41000, 'minute']]) {
				const { m, modo, cible } = prep();
				const i = interaction(m, modo, { membre: cible, duree, unite: temps });
				await commande('mute').execute(i);
				assert.equal(m.appels.timeouts.length, 0, `${duree} ${temps}`);
				assert.deepEqual(await getSanctions('2'), []);
				assert.ok(ephemere(derniere(i)));
			}
			// 28 jours pile : accepté
			const { m, modo, cible } = prep();
			await commande('mute').execute(interaction(m, modo, { membre: cible, duree: 28, unite: 'jour' }));
			assert.equal(m.appels.timeouts.length, 1);
		});

		it('unmute : retire le timeout, enregistre, prévient ; refuse si la personne n\'est pas mute, ou plus là, ou sans permission', async () => {
			const { m, modo, cible } = prep();
			const pasMute = interaction(m, modo, { membre: cible });
			await commande('unmute').execute(pasMute);
			assert.match(aplatir(derniere(pasMute)), /n'est pas mute/);

			await commande('mute').execute(interaction(m, modo, { membre: cible, duree: 10 }));
			const i = interaction(m, modo, { membre: cible, raison: 'Calmé' });
			await commande('unmute').execute(i);
			assert.equal(m.membres.get('2').timeoutMs, null);
			assert.deepEqual((await getSanctions('2')).map((s) => s.type), ['Mute', 'Unmute']);
			assert.equal(cible.mp.length, 2, 'prévenu du mute puis du démute');

			const parti = interaction(m, modo, { membre: utilisateur('9', 'parti') });
			await commande('unmute').execute(parti);
			assert.match(aplatir(derniere(parti)), /n'est plus sur le serveur/);

			const simple = utilisateur('3', 'simple');
			m.ajouter(simple);
			const refus = interaction(m, simple, { membre: cible });
			await commande('unmute').execute(refus);
			assert.match(aplatir(derniere(refus)), /pas la permission/);
		});
	});

	describe('/voicemute et /voiceunmute', () => {
		const prep = ({ vocal = { id: 'v1' }, mute = false, autoMute = false } = {}) => {
			const m = monde();
			const modo = utilisateur('1', 'modo');
			const cible = utilisateur('2', 'cible');
			m.ajouter(modo, { permissions: MODO });
			const membre = m.ajouter(cible, { vocal });
			membre.voice.serverMute = mute;
			membre.voice.selfMute = autoMute;
			return { m, modo, cible, membre };
		};

		it('coupe le micro, prévient, enregistre « VoiceMute », écrit dans les logs', async () => {
			const { m, modo, cible, membre } = prep();
			const i = interaction(m, modo, { membre: cible, raison: 'Bruit' });
			await commande('voicemute').execute(i);
			assert.equal(membre.voice.mute, true);
			assert.deepEqual(m.appels.mutesVocaux, [['2', true, 'Bruit']]);
			assert.equal((await getSanctions('2'))[0].type, 'VoiceMute');
			assert.equal(cible.mp.length, 1);
			assert.equal(m.logs.length, 1);
		});

		it('un membre qui a coupé lui-même son micro est tout de même mis en sourdine par le serveur (il ne pourra plus le rouvrir) ; /voiceunmute ne fait rien s\'il n\'est coupé que par lui-même', async () => {
			const { m, modo, cible, membre } = prep({ autoMute: true });
			const i = interaction(m, modo, { membre: cible });
			await commande('voiceunmute').execute(i);
			assert.match(aplatir(derniere(i)), /n'est pas coupé par le serveur/);
			assert.equal(m.appels.mutesVocaux.length, 0);

			const j = interaction(m, modo, { membre: cible });
			await commande('voicemute').execute(j);
			assert.equal(membre.voice.serverMute, true);
			assert.deepEqual(m.appels.mutesVocaux.map((a) => [a[0], a[1]]), [['2', true]]);
		});

		it('refuse : membre hors vocal, micro déjà coupé, staff, sans permission', async () => {
			let { m, modo, cible } = prep({ vocal: null });
			let i = interaction(m, modo, { membre: cible });
			await commande('voicemute').execute(i);
			assert.match(aplatir(derniere(i)), /aucun salon vocal/);

			({ m, modo, cible } = prep({ mute: true }));
			i = interaction(m, modo, { membre: cible });
			await commande('voicemute').execute(i);
			assert.match(aplatir(derniere(i)), /déjà son micro coupé/);

			({ m, modo, cible } = prep());
			m.membres.get('2').roles.cache.set(config.roleBureau, { id: config.roleBureau });
			i = interaction(m, modo, { membre: cible });
			await commande('voicemute').execute(i);
			assert.match(aplatir(derniere(i)), /membre du staff/);

			({ m, cible } = prep());
			const simple = utilisateur('3', 'simple');
			m.ajouter(simple);
			i = interaction(m, simple, { membre: cible });
			await commande('voicemute').execute(i);
			assert.match(aplatir(derniere(i)), /pas la permission/);
			assert.equal(m.appels.mutesVocaux.length, 0);
		});

		it('annonce proprement un échec de Discord (permissions du bot, hiérarchie des rôles)', async () => {
			const { m, modo, cible } = prep();
			m.erreurs.vocal = new Error('Missing Permissions');
			const i = interaction(m, modo, { membre: cible });
			const log = console.error;
			console.error = () => {};
			try { await commande('voicemute').execute(i); } finally { console.error = log; }
			assert.match(aplatir(derniere(i)), /pas pu couper le micro/);
			assert.deepEqual(await getSanctions('2'), [], 'rien n\'est enregistré si ça a échoué');
		});

		it('voiceunmute : rétablit la parole ; refuse si hors vocal, micro actif, sans permission', async () => {
			let { m, modo, cible, membre } = prep({ mute: true });
			let i = interaction(m, modo, { membre: cible });
			await commande('voiceunmute').execute(i);
			assert.equal(membre.voice.mute, false);
			assert.equal((await getSanctions('2'))[0].type, 'VoiceUnmute');
			assert.equal(m.logs.length, 1);

			i = interaction(m, modo, { membre: cible });
			await commande('voiceunmute').execute(i);
			assert.match(aplatir(derniere(i)), /n'est pas coupé par le serveur/);

			({ m, modo, cible } = prep({ vocal: null }));
			i = interaction(m, modo, { membre: cible });
			await commande('voiceunmute').execute(i);
			assert.match(aplatir(derniere(i)), /aucun salon vocal/);

			({ m, cible } = prep({ mute: true }));
			const simple = utilisateur('3', 'simple');
			m.ajouter(simple);
			i = interaction(m, simple, { membre: cible });
			await commande('voiceunmute').execute(i);
			assert.match(aplatir(derniere(i)), /pas la permission/);
		});
	});

	describe('/inspect et /sanction-remove', () => {
		it('aucune sanction : message vert', async () => {
			const m = monde();
			const modo = utilisateur('1', 'modo');
			m.ajouter(modo, { permissions: MODO });
			const i = interaction(m, modo, { membre: utilisateur('2', 'cible') });
			await commande('inspect').execute(i);
			assert.match(aplatir(derniere(i)), /aucune sanction/);
		});

		it('liste les sanctions (la plus récente d\'abord) en gardant le numéro d\'origine, 10 par page', async () => {
			const m = monde();
			const modo = utilisateur('1', 'modo');
			m.ajouter(modo, { permissions: MODO });
			for (let n = 1; n <= 12; n++) await addSanction('2', 'cible', { type: 'Warn', date: 1_700_000_000_000 + n * 1000, moderator: '1', reason: `motif ${n}` });
			let boutons;
			const i = interaction(m, modo, { membre: utilisateur('2', 'cible') });
			i.fetchReply = async () => ({ createMessageComponentCollector: () => ({ on: (nom, f) => { if (nom === 'collect') boutons = f; } }) });
			await commande('inspect').execute(i);
			const page1 = derniere(i);
			const champs = page1.embeds[0].data.fields;
			assert.equal(champs.length, 10);
			assert.match(champs[0].name, /^#12 /, 'la plus récente est la numéro 12');
			assert.match(champs[9].name, /^#3 /);
			assert.match(page1.embeds[0].data.title, /12 sanction/);
			assert.equal(page1.components.length, 1, 'boutons de pagination');

			// Page suivante : par l'auteur seulement
			const autre = { user: { id: '99' }, customId: 'sanctions_next', replies: [], reply: async function (a) { this.replies.push(a); }, update: async () => assert.fail('un autre membre ne change pas la page') };
			await boutons(autre);
			assert.match(autre.replies[0].content, /Seul l'auteur/);
			let page2;
			await boutons({ user: { id: '1' }, customId: 'sanctions_next', update: async (a) => { page2 = a; } });
			assert.equal(page2.embeds[0].data.fields.length, 2);
			assert.match(page2.embeds[0].data.fields[0].name, /^#2 /);
			assert.match(page2.embeds[0].data.fields[1].name, /^#1 /);
		});

		it('sanction-remove : supprime la bonne sanction, écrit dans les logs ; numéro inconnu refusé', async () => {
			const m = monde();
			const modo = utilisateur('1', 'modo');
			m.ajouter(modo, { permissions: MODO });
			await addSanction('2', 'cible', { type: 'Warn', date: 1, moderator: '1', reason: 'un' });
			await addSanction('2', 'cible', { type: 'Kick', date: 2, moderator: '1', reason: 'deux' });
			await addSanction('2', 'cible', { type: 'Ban', date: 3, moderator: '1', reason: 'trois' });
			const cible = utilisateur('2', 'cible');

			const inconnu = interaction(m, modo, { membre: cible, numero: 7 });
			await commande('sanction-remove').execute(inconnu);
			assert.match(aplatir(derniere(inconnu)), /Aucune sanction #7/);

			const i = interaction(m, modo, { membre: cible, numero: 2 });
			await commande('sanction-remove').execute(i);
			assert.match(aplatir(derniere(i)), /#2 \(Kick\)/);
			assert.deepEqual((await getSanctions('2')).map((s) => s.reason), ['un', 'trois']);
			assert.equal(m.logs.length, 1);

			const inconnuSansLigne = interaction(m, modo, { membre: utilisateur('8', 'jamais-sanctionne'), numero: 1 });
			await commande('sanction-remove').execute(inconnuSansLigne);
			assert.match(aplatir(derniere(inconnuSansLigne)), /Aucune sanction #1/);
		});
	});
});

// --- /clear ------------------------------------------------------------------------------------------------------------------

describe('/clear', () => {
	const messages = (n, { epingles = [] } = {}) => new Collection(Array.from({ length: n }, (_, k) => [`m${k}`, { id: `m${k}`, pinned: epingles.includes(k) }]));
	const prep = ({ permissions = [P.ManageMessages], plafond = Infinity } = {}) => {
		const m = monde();
		const modo = utilisateur('1', 'modo');
		m.ajouter(modo, { permissions });
		const appels = { fetch: [], bulk: [] };
		const channel = {
			messages: { fetch: async (o) => { appels.fetch.push(o); return messages(Math.min(o.limit, 30), { epingles: [2] }); } },
			bulkDelete: async (liste, filtre) => {
				appels.bulk.push([liste.size, filtre]);
				return new Collection([...liste].slice(0, plafond));
			},
		};
		return { m, modo, channel, appels };
	};

	it('supprime 10 messages par défaut, sans les épinglés', async () => {
		const { m, modo, channel, appels } = prep();
		const i = interaction(m, modo, {}, { channel });
		await commande('clear').execute(i);
		assert.equal(appels.fetch[0].limit, 10);
		assert.deepEqual(appels.bulk[0], [9, true], 'un message épinglé écarté ; filtre des plus de 14 jours actif');
		assert.match(aplatir(derniere(i)), /Suppression avec succès de 9/);
		assert.ok(ephemere(derniere(i)));
	});

	it('avec « épinglés » : les supprime aussi', async () => {
		const { m, modo, channel, appels } = prep();
		await commande('clear').execute(interaction(m, modo, { nombre: 5, inclure_epingles: true }, { channel }));
		assert.deepEqual(appels.bulk[0], [5, true]);
	});

	it('signale les messages trop anciens que Discord refuse de supprimer', async () => {
		const { m, modo, channel } = prep({ plafond: 4 });
		const i = interaction(m, modo, { nombre: 8 }, { channel });
		await commande('clear').execute(i);
		assert.match(aplatir(derniere(i)), /de plus de 14 jours/);
	});

	it('refusé sans la permission ; une erreur de Discord est annoncée sans planter', async () => {
		let { m, modo, channel, appels } = prep({ permissions: [] });
		let i = interaction(m, modo, {}, { channel });
		await commande('clear').execute(i);
		assert.match(aplatir(derniere(i)), /pas la permission/);
		assert.equal(appels.fetch.length, 0);

		({ m, modo, channel } = prep());
		channel.bulkDelete = async () => { throw new Error('Missing Access'); };
		i = interaction(m, modo, {}, { channel });
		const console_error = console.error;
		console.error = () => {};
		try { await commande('clear').execute(i); } finally { console.error = console_error; }
		assert.match(aplatir(derniere(i)), /erreur est survenue/);
	});

	it('le nombre est borné à 1..100 (Discord ne lit pas plus de 100 messages d\'un coup)', () => {
		const option = commande('clear').data.toJSON().options.find((o) => o.name === 'nombre');
		assert.equal(option.min_value, 1);
		assert.equal(option.max_value, 100);
	});
});

// --- /embed ------------------------------------------------------------------------------------------------------------------

describe('/embed', () => {
	const lancer = async (options) => {
		const m = monde();
		const modo = utilisateur('1', 'modo');
		m.ajouter(modo, { permissions: [P.ManageMessages] });
		const envoyes = [];
		const i = interaction(m, modo, options, { channel: { send: async (a) => { envoyes.push(a); } } });
		await commande('embed').execute(i);
		return { i, envoyes };
	};

	it('refuse un embed sans titre, description ni image', async () => {
		const { i, envoyes } = await lancer({ pied_de_page: 'pied' });
		assert.match(aplatir(derniere(i)), /au moins un titre/);
		assert.equal(envoyes.length, 0);
	});

	it('envoie dans le salon, transforme \\n en retour à la ligne, accepte couleurs nommées ou hexadécimales', async () => {
		let { envoyes, i } = await lancer({ titre: 'Titre', description: 'ligne 1\\nligne 2', couleur: '#ff0000', pied_de_page: 'pied', image: 'https://exemple.org/a.png', miniature: 'https://exemple.org/b.png' });
		const d = envoyes[0].embeds[0].data;
		assert.equal(d.title, 'Titre');
		assert.equal(d.description, 'ligne 1\nligne 2');
		assert.equal(d.color, 0xff0000);
		assert.equal(d.footer.text, 'pied');
		assert.equal(d.image.url, 'https://exemple.org/a.png');
		assert.ok(ephemere(derniere(i)), 'la confirmation est privée');

		({ envoyes } = await lancer({ titre: 'T', couleur: 'Red' }));
		assert.equal(envoyes[0].embeds[0].data.color, 0xed4245);
		({ envoyes } = await lancer({ titre: 'T', couleur: 'pas-une-couleur' }));
		assert.equal(envoyes[0].embeds[0].data.color, 0x3498db, 'couleur inconnue : bleu par défaut');
	});

	it('refuse une image ou une miniature qui n\'est pas une adresse http(s)', async () => {
		for (const options of [{ titre: 'T', image: 'ftp://x/a.png' }, { titre: 'T', miniature: 'javascript:alert(1)' }]) {
			const { i, envoyes } = await lancer(options);
			assert.match(aplatir(derniere(i)), /invalide/);
			assert.equal(envoyes.length, 0);
		}
	});

	it('les limites de Discord sont annoncées dès la saisie (titre 256, description 4096, pied de page 2048)', () => {
		const options = Object.fromEntries(commande('embed').data.toJSON().options.map((o) => [o.name, o]));
		assert.equal(options.titre.max_length, 256);
		assert.equal(options.description.max_length, 4096);
		assert.equal(options.pied_de_page.max_length, 2048);
	});
});

// --- /roll -------------------------------------------------------------------------------------------------------------------

describe('/roll', () => {
	const lancer = async (formule) => {
		const m = monde();
		const joueur = utilisateur('1', 'joueur');
		m.ajouter(joueur);
		const i = interaction(m, joueur, { formule });
		await commande('roll').execute(i);
		const r = derniere(i);
		const champs = r.embeds?.[0]?.data.fields ?? [];
		const total = champs.find((c) => c.name === 'Total');
		return { r, i, detail: champs.find((c) => c.name.startsWith('Détails'))?.value, total: total ? Number(total.value.replace(/\*/g, '')) : undefined };
	};

	it('dés ordinaires, modificateurs, signes', async () => {
		assert.equal((await lancer('3d1')).total, 3);
		assert.equal((await lancer('2d1+5')).total, 7);
		assert.equal((await lancer('2d1-5')).total, -3);
		assert.equal((await lancer(' 1d1 + 2 - 1 ')).total, 2, 'espaces ignorés');
		assert.equal((await lancer('D1')).total, 1, 'sans nombre de dés, majuscules acceptées');
		assert.equal((await lancer('7')).total, 7, 'un simple nombre');
		for (let n = 0; n < 200; n++) {
			const { total } = await lancer('2d20');
			assert.ok(total >= 2 && total <= 40);
		}
	});

	it('garde le meilleur (kh) ou le pire (kl) : les autres dés sont barrés', async () => {
		for (let n = 0; n < 50; n++) {
			const haut = await lancer('4d6kh3');
			assert.equal((haut.detail.match(/~~/g) ?? []).length, 2, 'un dé écarté (deux marques ~~)');
			assert.ok(haut.total >= 3 && haut.total <= 18);
			const bas = await lancer('2d20kl1');
			assert.ok(bas.total >= 1 && bas.total <= 20);
			assert.equal((bas.detail.match(/~~/g) ?? []).length, 2);
		}
	});

	it('explosion (!) et implosion (i) : ne plantent pas, restent cohérentes', async () => {
		for (let n = 0; n < 100; n++) {
			assert.ok((await lancer('3d4!')).total >= 3);
			const implose = await lancer('2d6i');
			assert.ok(Number.isFinite(implose.total));
			assert.ok(Number.isFinite((await lancer('2d10!i')).total));
			assert.ok(Number.isFinite((await lancer('4d6ikh3')).total));
		}
		assert.equal((await lancer('2d1!')).total, 2, 'un dé à une face n\'explose pas à l\'infini');
		assert.equal((await lancer('2d1i')).total, 2);
	});

	it('refuse proprement les formules invalides', async () => {
		for (const formule of ['', 'abc', '0d6', '1d0', '101d6', '1d6+', '+', '2d', 'd', '1d6x', '1d6+3abc', '1d6!!', '1d6ii', '1d6/roll', '1.5d6', '1d6kh', '--5']) {
			const { r, total } = await lancer(formule);
			assert.equal(total, undefined, `« ${formule} » ne doit pas donner de résultat`);
			assert.ok(r.content?.startsWith('❌'), `« ${formule} » : message d'erreur attendu, reçu ${JSON.stringify(r.content)}`);
			assert.ok(ephemere(r), 'l\'erreur est privée');
		}
	});

	it('un nombre de faces démesuré est refusé (sinon le générateur aléatoire plante)', async () => {
		for (const formule of ['1d99999999999999999999', '1d281474976710656', '1d1000000000000']) {
			const { r, total } = await lancer(formule);
			assert.equal(total, undefined, formule);
			assert.ok(r.content?.startsWith('❌'), formule);
		}
	});

	it('une longue formule tient dans un champ de message Discord (1024 caractères au plus)', async () => {
		const { r, detail, total } = await lancer('100d20+100d20+100d20+100d20');
		assert.ok(r.embeds, 'une réponse est bien envoyée');
		assert.ok(detail.length <= 1024, `détail de ${detail.length} caractères`);
		assert.ok(Number.isFinite(total));
	});
});

// --- /level, /leaderboard, /ping ---------------------------------------------------------------------------------------------

describe('/level et /leaderboard', () => {
	it('/level : un nouveau membre est niveau 1 et reçoit une ligne en base', async () => {
		const m = monde();
		const joueur = utilisateur('1', 'joueur');
		m.ajouter(joueur);
		const i = interaction(m, joueur);
		await commande('level').execute(i);
		await attendre(() => i.reponses.length > 0, 'pas de réponse');
		assert.match(aplatir(derniere(i)), /niveau 1/);
		assert.match(aplatir(derniere(i)), /500 xp/);
		await attendre(async () => (await lignes('SELECT * FROM data WHERE userId = ?', ['1'])).length === 1, 'ligne non créée');
	});

	it('/level : affiche le niveau, l\'xp et l\'xp qui manque (500 + (niveau - 1) × 100)', async () => {
		await sql("INSERT INTO data (userId, userName, xp, level) VALUES ('1', 'joueur', 130, 4)");
		const m = monde();
		const joueur = utilisateur('1', 'joueur');
		m.ajouter(joueur);
		const i = interaction(m, joueur);
		await commande('level').execute(i);
		await attendre(() => i.reponses.length > 0);
		assert.match(aplatir(derniere(i)), /niveau 4/);
		assert.match(aplatir(derniere(i)), /130 xp/);
		assert.match(aplatir(derniere(i)), /manquez 670 xp/);
	});

	it('/level : un membre sans « nom global » Discord reçoit tout de même sa ligne (la colonne du nom est obligatoire)', async () => {
		const m = monde();
		const joueur = { ...utilisateur('7', 'joueur'), globalName: null };
		m.ajouter(joueur);
		const i = interaction(m, joueur);
		await commande('level').execute(i);
		await attendre(() => i.reponses.length > 0);
		await attendre(async () => (await lignes('SELECT * FROM data WHERE userId = ?', ['7'])).length === 1, 'ligne non créée pour un membre sans nom global');
	});

	it('/leaderboard : classement par niveau puis xp, dix premiers, médailles', async () => {
		for (let n = 1; n <= 12; n++) await sql('INSERT INTO data (userId, userName, xp, level) VALUES (?, ?, ?, ?)', [`${n}`, `joueur${n}`, n * 10, n % 3 + 1]);
		const m = monde();
		const joueur = utilisateur('1', 'joueur1');
		m.ajouter(joueur);
		const i = interaction(m, joueur);
		await commande('leaderboard').execute(i);
		await attendre(() => i.reponses.length > 0);
		const champs = derniere(i).embeds[0].data.fields;
		assert.equal(champs.length, 10);
		assert.match(champs[0].name, /first_place/);
		assert.match(champs[3].name, /^#4/);
		const niveaux = champs.map((c) => Number(/Level: (\d+)/.exec(c.value)[1]));
		assert.deepEqual(niveaux, [...niveaux].sort((a, b) => b - a), 'niveaux décroissants');
	});

	it('/leaderboard : base vide', async () => {
		const m = monde();
		const joueur = utilisateur('1');
		m.ajouter(joueur);
		const i = interaction(m, joueur);
		await commande('leaderboard').execute(i);
		await attendre(() => i.reponses.length > 0);
		assert.match(aplatir(derniere(i)), /0 membres/);
	});

	it('/ping répond « Pong! » avec le délai', async () => {
		const m = monde();
		const joueur = utilisateur('1');
		m.ajouter(joueur);
		const i = interaction(m, joueur);
		await commande('ping').execute(i);
		assert.equal(i.reponses[0].content, 'Pinging...');
		assert.match(i.reponses[1].content, /^Pong! \d+ms\.$/);
	});
});

// --- /help -------------------------------------------------------------------------------------------------------------------

describe('/help : seules les commandes accessibles sont listées', () => {
	const toutes = () => {
		const commandes = new Collection();
		for (const f of fs.readdirSync(path.join(__dirname, '..', 'commands')).filter((x) => x.endsWith('.js'))) {
			const c = require(`../commands/${f}`);
			commandes.set(c.data.name, c);
		}
		return commandes;
	};
	const aide = async (permissions) => {
		const m = monde();
		const membre = utilisateur('1', 'membre');
		m.ajouter(membre, { permissions });
		const i = interaction(m, membre, {}, { client: { commands: toutes() } });
		await commande('help').execute(i);
		return aplatir(i.reponses[0]);
	};

	it('un membre ordinaire ne voit ni la modération, ni /embed, ni /setup-roles, ni la création d\'événement', async () => {
		const texte = await aide([]);
		for (const visible of ['/ping', '/level', '/leaderboard', '/roll', '/antre', '/help', '/event list', '/event info']) assert.ok(texte.includes(visible), `${visible} devrait être listée`);
		for (const cachee of ['/ban', '/unban', '/kick', '/mute', '/unmute', '/voicemute', '/voiceunmute', '/warn', '/clear', '/inspect', '/sanction-remove', '/embed', '/setup-roles', '/event create', '/forum']) {
			assert.ok(!texte.includes(cachee), `${cachee} ne devrait pas être listée`);
		}
		assert.ok(!texte.includes('Modération'), 'la catégorie vide n\'apparaît pas');
	});

	it('un modérateur voit la modération (selon ses permissions Discord) mais pas /setup-roles ni la création d\'événement', async () => {
		const texte = await aide([P.BanMembers, P.KickMembers, P.MuteMembers, P.ModerateMembers, P.ManageMessages]);
		for (const visible of ['/ban', '/unban', '/kick', '/mute', '/unmute', '/voicemute', '/voiceunmute', '/warn', '/clear', '/inspect', '/sanction-remove', '/embed']) assert.ok(texte.includes(visible), `${visible} devrait être listée`);
		assert.ok(!texte.includes('/setup-roles'));
		assert.ok(!texte.includes('/event create'));
	});

	it('chaque commande n\'est listée que pour la permission qu\'elle exige', async () => {
		assert.ok((await aide([P.BanMembers])).includes('/ban'));
		assert.ok(!(await aide([P.BanMembers])).includes('/kick'));
		assert.ok((await aide([P.ManageRoles])).includes('/setup-roles'));
		assert.ok(!(await aide([P.ManageRoles])).includes('/ban'));
	});

	it('qui peut gérer les événements sur Discord voit le détail de /event (création comprise)', async () => {
		const texte = await aide([P.ManageEvents]);
		assert.ok(!texte.includes('/event list'), 'la ligne complète remplace la version réduite');
		assert.match(texte, /\/event` — Gérer les événements/);
	});

	it('un administrateur voit tout', async () => {
		const texte = await aide([P.Administrator]);
		for (const nom of toutes().keys()) assert.ok(texte.includes(`/${nom}`), `/${nom}`);
	});

	it('le bas de page explique le filtre', async () => {
		assert.match(await aide([]), /auxquelles vous avez accès/);
	});
});

// --- Menu des rôles ----------------------------------------------------------------------------------------------------------

describe('/setup-roles et le menu des pôles', () => {
	it('/setup-roles envoie le menu dans le salon (texte lisible, quatre pôles) et confirme en privé', async () => {
		const m = monde();
		const gestionnaire = utilisateur('1', 'gestionnaire');
		m.ajouter(gestionnaire, { permissions: [P.ManageRoles] });
		const envoyes = [];
		const i = interaction(m, gestionnaire, {}, { channel: { send: async (a) => { envoyes.push(a); } } });
		await commande('setup-roles').execute(i);
		const menu = envoyes[0].components[0].components[0].toJSON();
		assert.equal(menu.custom_id, 'pole_role_select');
		assert.deepEqual(menu.options.map((o) => o.value), ['roleJeuVideo', 'roleWargame', 'roleEchecs', 'roleMJ']);
		assert.equal(menu.min_values, 0);
		assert.equal(menu.max_values, 4);
		const description = envoyes[0].embeds[0].data.description;
		assert.ok(!description.includes('\\n'), `la description contient un « \\n » littéral : ${JSON.stringify(description)}`);
		assert.ok(ephemere(derniere(i)));
	});

	describe('choix des rôles', () => {
		const gestionnaire = require('../events/interactionCreate.js');
		const selection = (membre, valeurs, rolesDuServeur) => {
			const reponses = [];
			return {
				reponses,
				isChatInputCommand: () => false, isAutocomplete: () => false, isButton: () => false, isModalSubmit: () => false, isStringSelectMenu: () => true,
				customId: 'pole_role_select', values: valeurs, member: membre,
				guild: { id: SERVEUR, roles: { cache: new Map(rolesDuServeur.map((id) => [id, { id, name: `pôle-${id}` }])) } },
				deferReply: async () => {}, editReply: async (a) => { reponses.push(a); },
			};
		};
		const tousLesRoles = [config.roleJeuVideo, config.roleWargame, config.roleEchecs, config.roleMJ];

		it('ajoute les rôles choisis, retire ceux qu\'on décoche, laisse les autres rôles', async () => {
			const m = monde();
			const membre = m.ajouter(utilisateur('1', 'joueur'), { roles: [config.roleWargame, 'autre-role'] });
			const i = selection(membre, ['roleJeuVideo', 'roleMJ'], tousLesRoles);
			await gestionnaire.execute(i);
			assert.ok(membre.roles.cache.has(config.roleJeuVideo) && membre.roles.cache.has(config.roleMJ));
			assert.ok(!membre.roles.cache.has(config.roleWargame), 'décoché : retiré');
			assert.ok(membre.roles.cache.has('autre-role'), 'les rôles étrangers au menu ne sont pas touchés');
			assert.match(i.reponses[0].content, /Ajoutés/);
			assert.match(i.reponses[0].content, /Retirés/);
		});

		it('aucun changement : le dit', async () => {
			const m = monde();
			const membre = m.ajouter(utilisateur('1', 'joueur'), { roles: [config.roleEchecs] });
			const i = selection(membre, ['roleEchecs'], tousLesRoles);
			await gestionnaire.execute(i);
			assert.match(i.reponses[0].content, /Aucun changement/);
		});

		it('tout décocher retire les quatre pôles', async () => {
			const m = monde();
			const membre = m.ajouter(utilisateur('1', 'joueur'), { roles: tousLesRoles });
			await gestionnaire.execute(selection(membre, [], tousLesRoles));
			for (const r of tousLesRoles) assert.ok(!membre.roles.cache.has(r));
		});

		it('un rôle qui n\'existe pas sur le serveur est ignoré sans planter', async () => {
			const m = monde();
			const membre = m.ajouter(utilisateur('1', 'joueur'));
			const i = selection(membre, ['roleJeuVideo', 'roleMJ'], [config.roleMJ]);
			await gestionnaire.execute(i);
			assert.ok(membre.roles.cache.has(config.roleMJ));
			assert.ok(!membre.roles.cache.has(config.roleJeuVideo));
		});
	});
});

// --- Erreurs : jamais de commande qui reste sans réponse ----------------------------------------------------------------------

describe('une commande qui échoue répond quand même', () => {
	const gestionnaire = require('../events/interactionCreate.js');
	const faux = (commandeDefaillante, extra = {}) => {
		const reponses = [];
		return {
			reponses, commandName: 'test', deferred: false, replied: false,
			isChatInputCommand: () => true,
			client: { commands: new Collection([['test', { execute: commandeDefaillante }]]) },
			reply: async (a) => { reponses.push(a); }, followUp: async (a) => { reponses.push(a); },
			...extra,
		};
	};
	const silence = async (f) => {
		const log = console.error;
		console.error = () => {};
		try { await f(); } finally { console.error = log; }
	};

	it('exécution qui lève une erreur (ex. « Missing Permissions » de Discord) : message privé au lieu du silence', async () => {
		const i = faux(async () => { throw new Error('Missing Permissions'); });
		await silence(() => gestionnaire.execute(i));
		assert.equal(i.reponses.length, 1);
		assert.match(i.reponses[0].content, /erreur/);
		assert.ok(ephemere(i.reponses[0]));
	});

	it('si la réponse était déjà donnée ou différée, l\'erreur passe par un message de suivi', async () => {
		const i = faux(async () => { throw new Error('boum'); }, { replied: true });
		await silence(() => gestionnaire.execute(i));
		assert.equal(i.reponses.length, 1);
	});

	it('une commande inconnue est ignorée sans erreur', async () => {
		const i = faux(async () => {}, { commandName: 'inconnue' });
		await silence(() => gestionnaire.execute(i));
		assert.equal(i.reponses.length, 0);
	});
});

// --- Gain d'XP ---------------------------------------------------------------------------------------------------------------

describe('gain d\'XP à chaque message', { skip: !AVEC_CONFIG && 'config.json absent' }, () => {
	const evenement = () => require('../events/messageCreate.js');
	const clientId = () => require('../config.json').clientId;
	const message = (auteur, extra = {}) => {
		const envoyes = [];
		const salon = { id: 'c1', send: async (a) => { envoyes.push(a); } };
		return {
			envoyes, reactions: [],
			author: auteur, content: 'bonjour', attachments: new Collection(),
			guild: { channels: { cache: new Map([[salon.id, salon]]) } }, channelId: salon.id,
			react: async function (e) { this.reactions.push(e); },
			...extra,
		};
	};
	const ligne = async (id) => (await lignes('SELECT * FROM data WHERE userId = ?', [id]))[0];

	it('le premier message crée la ligne du membre', async () => {
		await evenement().execute(message(utilisateur('1', 'joueur')));
		await attendre(async () => !!(await ligne('1')));
		assert.equal((await ligne('1')).xp, 0);
	});

	it('les messages suivants rapportent 20 à 50 xp, au plus un gain toutes les 15 secondes', async () => {
		await sql("INSERT INTO data (userId, userName, xp, xpCooldown) VALUES ('1', 'joueur', 0, 0)");
		const joueur = utilisateur('1', 'joueur');
		await evenement().execute(message(joueur));
		await attendre(async () => (await ligne('1')).xp > 0);
		const xp = (await ligne('1')).xp;
		assert.ok(xp >= 20 && xp <= 50, `gain de ${xp}`);
		await evenement().execute(message(joueur));
		await evenement().execute(message(joueur));
		await new Promise((r) => setTimeout(r, 150));
		assert.equal((await ligne('1')).xp, xp, 'pas de nouveau gain pendant le délai');
		await sql('UPDATE data SET xpCooldown = ? WHERE userId = ?', [Date.now() - 16_000, '1']);
		await evenement().execute(message(joueur));
		await attendre(async () => (await ligne('1')).xp > xp);
	});

	it('passage de niveau : annonce dans le salon, l\'xp de trop est conservé', async () => {
		await sql("INSERT INTO data (userId, userName, xp, level, xpCooldown) VALUES ('1', 'joueur', 499, 1, 0)");
		const m = message(utilisateur('1', 'joueur'));
		await evenement().execute(m);
		await attendre(async () => (await ligne('1')).level === 2);
		const apres = await ligne('1');
		assert.ok(apres.xp >= 19 && apres.xp <= 49, `xp restant ${apres.xp}`);
		await attendre(() => m.envoyes.length === 1);
		assert.match(aplatir(m.envoyes[0]), /niveau 2/);
	});

	it('le niveau est plafonné à 100', async () => {
		await sql("INSERT INTO data (userId, userName, xp, level, xpCooldown) VALUES ('1', 'joueur', 99999, 100, 0)");
		await evenement().execute(message(utilisateur('1', 'joueur')));
		await attendre(async () => (await ligne('1')).xp > 99999);
		assert.equal((await ligne('1')).level, 100);
	});

	it('les messages de bots sont ignorés ; une mention du bot reçoit la patte 🐾', async () => {
		await evenement().execute(message({ ...utilisateur('5', 'robot'), bot: true }));
		await new Promise((r) => setTimeout(r, 100));
		assert.equal(await ligne('5'), undefined);
		const m = message(utilisateur('1', 'joueur'), { content: `salut <@${clientId()}> !` });
		await evenement().execute(m);
		assert.deepEqual(m.reactions, ['🐾']);
		await attendre(async () => !!(await ligne('1')), 'ligne du membre créée');
	});

	it('deux messages simultanés d\'un nouveau membre ne créent qu\'une ligne et ne font pas planter le bot', async () => {
		const joueur = utilisateur('1', 'joueur');
		await Promise.all([evenement().execute(message(joueur)), evenement().execute(message(joueur)), evenement().execute(message(joueur))]);
		await new Promise((r) => setTimeout(r, 200));
		assert.equal((await lignes('SELECT * FROM data WHERE userId = ?', ['1'])).length, 1);
	});

	it('un message privé (sans serveur) ne fait pas planter le gain d\'xp', async () => {
		await sql("INSERT INTO data (userId, userName, xp, level, xpCooldown) VALUES ('1', 'joueur', 499, 1, 0)");
		const m = message(utilisateur('1', 'joueur'), { guild: null });
		await assert.doesNotReject(async () => evenement().execute(m));
		await new Promise((r) => setTimeout(r, 100));
		assert.equal((await ligne('1')).level, 1, 'pas de niveau gagné hors d\'un serveur');
	});
});

// --- Logs : messages supprimés, modifiés, vocal ---------------------------------------------------------------------------------

describe('logs des messages', () => {
	const suppression = require('../events/messageDelete.js');
	const edition = require('../events/messageUpdate.js');
	const { cacheAttachments } = require('../utils/attachmentCache.js');

	const messageDans = (m, auteur, extra = {}) => ({
		id: 'msg1', partial: false, author: auteur, content: 'Bonjour tout le monde', guild: m.guild, channel: '#général',
		attachments: new Collection(), ...extra,
	});

	it('message supprimé : le contenu, l\'auteur et le salon sont écrits dans les logs', async () => {
		const m = monde();
		await suppression.execute(messageDans(m, utilisateur('1', 'joueur')));
		assert.equal(m.logs.length, 1);
		const e = m.logs[0].embeds[0].data;
		assert.match(e.title, /Message Supprimé/);
		assert.equal(e.fields[0].value, 'Bonjour tout le monde');
		assert.match(e.description, /#général/);
		assert.equal(e.author.name, 'joueur#0');
	});

	it('message supprimé : ignore les bots et les messages inconnus (partiels), et ne plante pas sans salon de logs', async () => {
		const m = monde();
		await suppression.execute(messageDans(m, { ...utilisateur('1', 'robot'), bot: true }));
		await suppression.execute(messageDans(m, utilisateur('1'), { partial: true }));
		assert.equal(m.logs.length, 0);
		const sans = monde({ sansSalonLogs: true });
		await assert.doesNotReject(() => suppression.execute(messageDans(sans, utilisateur('1'))));
	});

	it('message supprimé sans texte (image seule) : « Vide ou média »', async () => {
		const m = monde();
		await suppression.execute(messageDans(m, utilisateur('1'), { content: '' }));
		assert.equal(m.logs[0].embeds[0].data.fields[0].value, '*Vide ou média*');
	});

	it('message très long (plus de 1024 caractères) : il est tout de même consigné, tronqué', async () => {
		const m = monde();
		await suppression.execute(messageDans(m, utilisateur('1'), { content: 'x'.repeat(1900) }));
		assert.equal(m.logs.length, 1, 'le log doit être écrit');
		assert.ok(m.logs[0].embeds[0].data.fields[0].value.length <= 1024);
	});

	it('pièces jointes : retrouvées dans le cache si le message est récent, sinon signalées perdues', async () => {
		const m = monde();
		const auteur = utilisateur('1', 'joueur');
		const original = global.fetch;
		global.fetch = async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('contenu').buffer });
		try {
			const pieces = new Collection([['a1', { name: 'photo.png', url: 'https://cdn.test/photo.png', size: 100, contentType: 'image/png' }]]);
			await cacheAttachments('msg1', pieces);
			await suppression.execute(messageDans(m, auteur, { attachments: pieces }));
			assert.equal(m.logs[0].files.length, 1);
			assert.equal(m.logs[0].files[0].name, 'photo.png');
			assert.equal(m.logs[0].embeds[0].data.image.url, 'attachment://photo.png');

			await suppression.execute(messageDans(m, auteur, { id: 'inconnu', attachments: pieces }));
			assert.match(aplatir(m.logs[1]), /Pièces jointes perdues/);
			assert.equal(m.logs[1].files, undefined);
		} finally {
			global.fetch = original;
		}
	});

	it('message modifié : ancien et nouveau contenu ; ignore les bots, les messages partiels et les modifications sans changement du texte', async () => {
		const m = monde();
		const auteur = utilisateur('1', 'joueur');
		await edition.execute(messageDans(m, auteur, { content: 'avant' }), { content: 'après' });
		assert.equal(m.logs.length, 1);
		const champs = m.logs[0].embeds[0].data.fields;
		assert.equal(champs[0].value, 'avant');
		assert.equal(champs[1].value, 'après');
		await edition.execute(messageDans(m, auteur, { content: 'même' }), { content: 'même' });
		await edition.execute(messageDans(m, { ...auteur, bot: true }, { content: 'a' }), { content: 'b' });
		await edition.execute(messageDans(m, auteur, { partial: true }), { content: 'b' });
		assert.equal(m.logs.length, 1);
	});

	it('message modifié très long : consigné, tronqué', async () => {
		const m = monde();
		await edition.execute(messageDans(m, utilisateur('1'), { content: 'a'.repeat(1500) }), { content: 'b'.repeat(1500) });
		assert.equal(m.logs.length, 1);
		for (const champ of m.logs[0].embeds[0].data.fields) assert.ok(champ.value.length <= 1024);
	});
});

describe('salons vocaux : logs et salons dynamiques', () => {
	const evenement = require('../events/voiceStateUpdate.js');
	const CREATION = config.createVoiceChannelId;
	const CATEGORIE = config.tempVoiceCategoryId;

	const contexte = () => {
		const m = monde();
		const user = utilisateur('1', 'joueur');
		const membre = m.ajouter(user);
		const crees = [];
		const supprimes = [];
		m.guild.channels.create = async (donnees) => {
			const salon = { id: `nouveau${crees.length}`, ...donnees, members: new Map(), parentId: donnees.parent, delete: async () => { supprimes.push(salon.id); } };
			crees.push(salon);
			return salon;
		};
		const deplaces = [];
		membre.voice.setChannel = async (salon) => { deplaces.push(salon.id); };
		const client = { channels: { cache: m.salons } };
		const etat = (salon) => ({ channelId: salon?.id ?? null, channel: salon ?? null, member: membre, guild: m.guild, client });
		return { m, membre, crees, supprimes, deplaces, etat };
	};
	const salon = (id, nom, { membres = 1, parentId = 'autre' } = {}) => ({ id, name: nom, parentId, members: { size: membres }, toString: () => `#${nom}`, delete: async () => {} });

	it('connexion, déconnexion et changement de salon sont consignés ; couper son micro ne l\'est pas', async () => {
		const { m, etat } = contexte();
		const a = salon('a', 'Général');
		const b = salon('b', 'blabla');
		await evenement.execute(etat(null), etat(a));
		await evenement.execute(etat(a), etat(b));
		await evenement.execute(etat(b), etat(null));
		await evenement.execute(etat(a), etat(a)); // mute, sourdine, partage d'écran…
		assert.deepEqual(m.logs.map((l) => l.embeds[0].data.title), ['🟢 Connexion Vocale', '🔀 Changement de Salon', '🔴 Déconnexion Vocale']);
		assert.match(m.logs[0].embeds[0].data.description, /Général/);
		assert.match(m.logs[1].embeds[0].data.description, /Général.*blabla/);
	});

	it('quitter un salon temporaire : le log donne son nom (le salon est supprimé juste après, sa mention deviendrait « #inconnu » ou « null »)', async () => {
		const { m, supprimes, etat } = contexte();
		const temporaire = { ...salon('t1', 'Salon de joueur', { membres: 0, parentId: CATEGORIE }), delete: async () => { supprimes.push('t1'); } };
		await evenement.execute(etat(temporaire), etat(null));
		assert.equal(m.logs.length, 1);
		const texte = m.logs[0].embeds[0].data.description;
		assert.match(texte, /\*\*Salon de joueur\*\*/);
		assert.ok(!texte.includes('null') && !texte.includes('inconnu'));
		assert.deepEqual(supprimes, ['t1'], 'et le salon vide est bien supprimé');
	});

	it('rejoindre « Crée ton salon » : « Connexion » est consignée d\'abord, avec le salon de création, même si le déplacement change l\'état entre-temps ; puis « Changement de salon » vers le nouveau', async () => {
		const { m, membre, etat, crees } = contexte();
		const creation = salon(CREATION, 'Crée ton salon!');
		const apres = etat(creation);
		// Comme dans discord.js : l'état « après » est mis à jour sur place par le déplacement
		membre.voice.setChannel = async (nouveau) => { apres.channelId = nouveau.id; apres.channel = nouveau; };
		await evenement.execute(etat(null), apres);
		assert.equal(crees.length, 1);
		assert.equal(m.logs.length, 1, 'un seul log : le déplacement, lui, donne un second événement');
		assert.equal(m.logs[0].embeds[0].data.title, '🟢 Connexion Vocale');
		assert.match(m.logs[0].embeds[0].data.description, /Crée ton salon!/);
		assert.ok(!m.logs[0].embeds[0].data.description.includes('Salon de joueur'));

		// Le second événement (déplacé dans le salon créé), dont le nom reste lisible
		const cree = { ...salon('nouveau0', 'Salon de joueur', { membres: 1, parentId: CATEGORIE }) };
		await evenement.execute(etat(creation), etat(cree));
		assert.equal(m.logs[1].embeds[0].data.title, '🔀 Changement de Salon');
		assert.match(m.logs[1].embeds[0].data.description, /Crée ton salon!.*\*\*Salon de joueur\*\*/);
	});

	it('les bots sont ignorés', async () => {
		const { m, etat, membre } = contexte();
		membre.user.bot = true;
		await evenement.execute(etat(null), etat(salon('a', 'Général')));
		assert.equal(m.logs.length, 0);
	});

	it('rejoindre « Crée ton salon » crée un salon au nom du membre, dans la catégorie temporaire, avec ses droits, et l\'y déplace', async () => {
		const { crees, deplaces, etat } = contexte();
		await evenement.execute(etat(null), etat(salon(CREATION, 'Crée ton salon!')));
		assert.equal(crees.length, 1);
		assert.equal(crees[0].name, 'Salon de joueur');
		assert.equal(crees[0].type, ChannelType.GuildVoice);
		assert.equal(crees[0].parent, CATEGORIE);
		const droits = crees[0].permissionOverwrites[0];
		assert.equal(droits.id, '1');
		for (const p of [P.ManageChannels, P.MoveMembers, P.MuteMembers, P.DeafenMembers]) assert.ok(droits.allow.includes(p));
		assert.deepEqual(deplaces, ['nouveau0']);
	});

	it('un salon temporaire vide est supprimé quand le dernier part ; pas s\'il reste du monde, ni les autres salons, ni le salon de création', async () => {
		const { supprimes, etat } = contexte();
		const vide = { ...salon('t1', 'Salon de joueur', { membres: 0, parentId: CATEGORIE }), delete: async () => { supprimes.push('t1'); } };
		await evenement.execute(etat(vide), etat(null));
		assert.deepEqual(supprimes, ['t1']);
		const occupe = { ...salon('t2', 'Salon de x', { membres: 2, parentId: CATEGORIE }), delete: async () => { supprimes.push('t2'); } };
		await evenement.execute(etat(occupe), etat(null));
		const ailleurs = { ...salon('t3', 'Général', { membres: 0, parentId: 'autre-categorie' }), delete: async () => { supprimes.push('t3'); } };
		await evenement.execute(etat(ailleurs), etat(null));
		const creation = { ...salon(CREATION, 'Crée ton salon!', { membres: 0, parentId: CATEGORIE }), delete: async () => { supprimes.push('creation'); } };
		await evenement.execute(etat(creation), etat(null));
		assert.deepEqual(supprimes, ['t1']);
	});

	it('une erreur de Discord à la création du salon ne casse pas l\'événement', async () => {
		const { m, etat } = contexte();
		m.guild.channels.create = async () => { throw new Error('Missing Permissions'); };
		const log = console.error;
		console.error = () => {};
		try { await assert.doesNotReject(() => evenement.execute(etat(null), etat(salon(CREATION, 'Crée ton salon!')))); } finally { console.error = log; }
	});
});

// --- /antre : événements, campagnes, notifications ---------------------------------------------------------------------------

describe('/antre : options aux noms explicites', () => {
	const antre = require('../utils/antre.js');
	const lancer = async (options, reponsesDuSite) => {
		const m = monde();
		const membre = utilisateur('1', 'membre');
		m.ajouter(membre);
		const appels = [];
		const { get, post } = antre;
		antre.get = async (chemin, o) => { appels.push(['GET', chemin, o]); const r = reponsesDuSite[chemin]; if (!r) throw new Error(`route inattendue ${chemin}`); return typeof r === 'function' ? r() : r; };
		antre.post = async (chemin, corps, o) => { appels.push(['POST', chemin, o]); return {}; };
		try {
			const i = interaction(m, membre, options);
			await commande('antre').execute(i);
			return { i, appels };
		} finally {
			antre.get = get;
			antre.post = post;
		}
	};
	const campagne = (id, extra = {}) => ({ id, titre: `Campagne ${id}`, jeu: 'L\'Appel de Cthulhu', type: 'ouverte', statut: 'en_cours', nbJoueurs: 3, monStatut: null, ...extra });

	it('les noms des options disent ce qu\'elles font (pas de « mes », « temps », « footer »…)', () => {
		const noms = (nom) => {
			const donnees = commande(nom).data.toJSON();
			const options = (o) => (o.options ?? []).flatMap((x) => (x.type === 1 ? [`${x.name}:`, ...x.options?.map((y) => `${x.name}.${y.name}`) ?? []] : [x.name]));
			return options(donnees).filter((n) => !n.endsWith(':'));
		};
		assert.deepEqual(noms('antre'), ['evenements.visible_par_tous', 'campagnes.inscrites', 'notifications.marquer_lues']);
		assert.deepEqual(noms('event'), ['create.nom', 'create.date', 'create.heure_debut', 'create.heure_fin', 'create.type', 'create.description', 'create.lieu', 'create.image', 'info.evenement']);
		assert.deepEqual(noms('mute'), ['membre', 'raison', 'duree', 'unite']);
		assert.deepEqual(noms('clear'), ['nombre', 'inclure_epingles']);
		assert.deepEqual(noms('embed'), ['titre', 'description', 'couleur', 'image', 'miniature', 'pied_de_page']);
	});

	it('/antre campagnes : toutes les campagnes en cours', async () => {
		const { i, appels } = await lancer({ __sous: 'campagnes' }, { '/campagnes?statut=en_cours': { campagnes: [campagne(1), campagne(2)] } });
		assert.deepEqual(appels.map((a) => a[1]), ['/campagnes?statut=en_cours']);
		assert.match(aplatir(derniere(i)), /Campagnes en cours/);
		assert.match(aplatir(derniere(i)), /Campagne 2/);
	});

	it('/antre campagnes inscrites:true : seulement celles où l\'on est inscrit(e), au nom de la personne, avec son rôle ; les terminées sont écartées', async () => {
		const { i, appels } = await lancer(
			{ __sous: 'campagnes', inscrites: true },
			{ '/campagnes/miennes': { campagnes: [campagne(1, { monStatut: 'mj' }), campagne(2, { monStatut: 'actif' }), campagne(3, { statut: 'terminee', monStatut: 'ancien' })] } }
		);
		assert.deepEqual(appels, [['GET', '/campagnes/miennes', { discordId: '1' }]]);
		const texte = aplatir(derniere(i));
		assert.match(texte, /Mes campagnes/);
		assert.match(texte, /vous êtes le MJ/);
		assert.match(texte, /vous jouez/);
		assert.ok(!texte.includes('Campagne 3'), 'les campagnes terminées ne sont pas listées');
	});

	it('/antre campagnes inscrites:true sans aucune campagne : message clair', async () => {
		const { i } = await lancer({ __sous: 'campagnes', inscrites: true }, { '/campagnes/miennes': { campagnes: [] } });
		assert.match(aplatir(derniere(i)), /inscrit\(e\) à aucune campagne/);
	});

	it('/antre notifications marquer_lues:true : les marque comme lues après les avoir affichées ; sans l\'option, non', async () => {
		const reponse = { notifications: [{ titre: 'Demande acceptée', corps: 'Bienvenue', lien: '/campagnes/1', lue: false }], nonLues: 1 };
		const avec = await lancer({ __sous: 'notifications', marquer_lues: true }, { '/notifications?limite=10': reponse });
		assert.ok(avec.appels.some((a) => a[0] === 'POST' && a[1] === '/notifications/lues'));
		assert.match(aplatir(derniere(avec.i)), /maintenant marquées comme lues/);
		const sans = await lancer({ __sous: 'notifications' }, { '/notifications?limite=10': reponse });
		assert.ok(!sans.appels.some((a) => a[0] === 'POST'));
	});

	it('/antre evenements visible_par_tous:true : la réponse est publique ; par défaut, privée', async () => {
		const reponses = { '/bot/evenements': { evenements: [{ id: 1, titre: 'Nocturne', debut: '2099-01-01T20:00', fin: '2099-01-02T02:00', categorie: 'jdr', tables: [], nbInteresses: 0, termine: false }] } };
		const publique = await lancer({ __sous: 'evenements', visible_par_tous: true }, reponses);
		assert.deepEqual(publique.i.optionsDefer, {}, 'visible par tout le salon');
		require('../utils/antre-affichage.js').oublierEvenements();
		const privee = await lancer({ __sous: 'evenements' }, reponses);
		assert.ok(privee.i.optionsDefer.flags, 'visible de la personne seule');
	});
});
