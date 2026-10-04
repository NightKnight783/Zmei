/**
 * Tests du reflet des événements du site sur Discord : dates (heure de Paris), synchronisation (créer, modifier, supprimer,
 * reprendre, ne pas recréer ce qui a été supprimé à la main), et les commandes /event create, list et info.
 * Aucun accès réseau : un faux serveur Discord et un faux site, la base SQLite est en mémoire.
 */
process.env.ANTRE_URL = process.env.ANTRE_URL || 'https://antre.test';
process.env.ANTRE_API_KEY = process.env.ANTRE_API_KEY || 'cle-de-test';

const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');
const sqlite3 = require('sqlite3');
const { GuildScheduledEventStatus } = require('discord.js');

const antreReel = require('../utils/antre.js');
const synchro = require('../utils/antre-evenements.js');
const affichage = require('../utils/antre-affichage.js');
const { getGuildsEvenementsAntre, evenementsAntreActifs } = require('../utils/constants.js');
const commandeEvent = require('../commands/event.js');

const SERVEUR = '1510323842638286890';
const dansUnAn = () => `${new Date().getUTCFullYear() + 1}-11-06`;
const dansUnAnJJMMAAAA = () => `06/11/${new Date().getUTCFullYear() + 1}`;

// --- Faux Discord ------------------------------------------------------------------------------------------------------

function fauxServeur(id = SERVEUR) {
	const evenements = new Map();
	let compteur = 0;
	const appels = { create: 0, edit: 0, delete: 0 };
	const objet = (donnees, extra = {}) => ({
		...donnees,
		...extra,
		status: extra.status ?? GuildScheduledEventStatus.Scheduled,
		creatorId: 'bot',
		url: `https://discord.com/events/${id}/${extra.id}`,
	});
	const guild = {
		id,
		client: { user: { id: 'bot' } },
		scheduledEvents: {
			async fetch(cle) {
				if (cle) {
					if (!evenements.has(cle)) throw Object.assign(new Error('Unknown Guild Scheduled Event'), { code: 10070 });
					return evenements.get(cle);
				}
				return evenements;
			},
			async create(donnees) {
				appels.create++;
				const e = objet(donnees, { id: `9000${++compteur}` });
				evenements.set(e.id, e);
				return e;
			},
			async edit(cle, donnees) {
				appels.edit++;
				if (!evenements.has(cle)) throw Object.assign(new Error('Unknown Guild Scheduled Event'), { code: 10070 });
				const e = { ...evenements.get(cle), ...donnees };
				evenements.set(cle, e);
				return e;
			},
			async delete(cle) {
				appels.delete++;
				if (!evenements.has(cle)) throw Object.assign(new Error('Unknown Guild Scheduled Event'), { code: 10070 });
				evenements.delete(cle);
			},
		},
	};
	// Collection : get/find/values comme celle de discord.js
	evenements.find = (f) => [...evenements.values()].find(f);
	return { guild, evenements, appels, client: { guilds: { cache: new Map([[id, guild]]) } } };
}

// --- Faux site ---------------------------------------------------------------------------------------------------------------

function fauxSite() {
	const site = {
		evenements: [],
		injoignable: false,
		requetes: [],
		creer(extra = {}) {
			const e = {
				id: site.evenements.length + 1,
				titre: 'Nocturne de rentrée',
				type: 'nocturne',
				categorie: 'jdr',
				debut: `${dansUnAn()}T20:00`,
				fin: `${dansUnAn()}T23:30`,
				lieu: 'Salle des fêtes',
				resume: 'Une nuit de jeux',
				nbTables: 0,
				nbInteresses: 0,
				nbPlaces: 0,
				termine: false,
				tables: [],
				...extra,
			};
			site.evenements.push(e);
			return e;
		},
		async get(chemin) {
			site.requetes.push(chemin);
			if (site.injoignable) throw new antreReel.ErreurAntre(0, 'injoignable', 'Le site ne répond pas.');
			if (chemin === '/bot/evenements') return { evenements: site.evenements.filter((e) => !e.termine) };
			if (chemin === '/meta') {
				return { categories: [{ cle: 'jdr', libelle: 'Jeu de rôle', types: [{ cle: 'nocturne', libelle: 'Nocturne' }, { cle: 'jdr', libelle: 'Autre événement de jeu de rôle' }] }] };
			}
			const detail = /^\/evenements\/(\d+)$/.exec(chemin);
			if (detail) {
				const e = site.evenements.find((x) => x.id === Number(detail[1]));
				if (!e) throw new antreReel.ErreurAntre(404, 'introuvable', 'Cet événement est introuvable.');
				return { evenement: e };
			}
			throw new Error(`Route inattendue : ${chemin}`);
		},
	};
	return site;
}

function creerSynchro(site, serveur, options = {}) {
	const db = new sqlite3.Database(':memory:');
	const antre = { ...antreReel, estConfigure: () => true, get: (chemin) => site.get(chemin) };
	const erreurs = [];
	const instance = synchro.creerSynchronisateur({
		antre,
		stockage: synchro.stockageSqlite(db),
		serveurs: () => [serveur.guild.id],
		libellesTypes: async () => ({ valeur: { nocturne: 'Nocturne', jdr: 'Autre événement de jeu de rôle' }, types: [] }),
		journal: { error: (m) => erreurs.push(m) },
		...options,
	});
	return { instance, erreurs, db };
}

// --- Dates : l'heure du site est celle de Paris -------------------------------------------------------------------------------

describe('dates (heure de Paris)', () => {
	it("convertit en heure d'été et d'hiver", () => {
		assert.equal(synchro.dateParis('2026-10-09T20:00').toISOString(), '2026-10-09T18:00:00.000Z', 'été : UTC+2');
		assert.equal(synchro.dateParis('2026-12-01T20:00').toISOString(), '2026-12-01T19:00:00.000Z', 'hiver : UTC+1');
		assert.equal(synchro.dateParis('2026-03-29T12:00').toISOString(), '2026-03-29T10:00:00.000Z', 'jour du passage à l\'heure d\'été');
		assert.equal(synchro.dateParis('2026-10-25T12:00').toISOString(), '2026-10-25T11:00:00.000Z', 'jour du retour à l\'heure d\'hiver');
		assert.throws(() => synchro.dateParis('demain'));
	});

	it("« maintenant à Paris » a le même format que les dates du site", () => {
		assert.match(synchro.maintenantParis(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
		assert.equal(synchro.maintenantParis(new Date('2026-07-01T10:30:00Z')), '2026-07-01T12:30');
		assert.equal(synchro.maintenantParis(new Date('2026-01-01T23:30:00Z')), '2026-01-02T00:30', 'passe minuit à Paris');
	});

	it('lit une date et une heure saisies, et refuse ce qui n\'existe pas', () => {
		assert.equal(synchro.lireDateHeure('09/10/2026', '20:00'), '2026-10-09T20:00');
		assert.equal(synchro.lireDateHeure('9/1/2027', '8h05'), '2027-01-09T08:05');
		assert.equal(synchro.lireDateHeure('31/02/2026', '20:00'), null);
		assert.equal(synchro.lireDateHeure('09/10/2026', '24:00'), null);
		assert.equal(synchro.lireDateHeure('09/10/2026', '20:61'), null);
		assert.equal(synchro.lireDateHeure('2026-10-09', '20:00'), null);
		assert.equal(synchro.ajouterMinutes('2026-10-09T23:00', 120), '2026-10-10T01:00');
	});
});

// --- Synchronisation ------------------------------------------------------------------------------------------------------------

describe('reflet des événements du site sur Discord', () => {
	let site, serveur, s;
	beforeEach(() => {
		site = fauxSite();
		serveur = fauxServeur();
		s = creerSynchro(site, serveur);
	});

	it('crée l\'événement Discord (nom, heures de Paris, lieu, lien vers la page du site) et ne le recrée pas', async () => {
		const e = site.creer();
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.create, 1);
		const discord = [...serveur.evenements.values()][0];
		assert.equal(discord.name, 'Nocturne de rentrée');
		assert.equal(discord.scheduledStartTime.toISOString(), synchro.dateParis(e.debut).toISOString());
		assert.equal(discord.scheduledEndTime.toISOString(), synchro.dateParis(e.fin).toISOString());
		assert.equal(discord.entityMetadata.location, 'Salle des fêtes');
		assert.ok(discord.description.includes(antreReel.urlSite(`/evenements/${e.id}`)), 'le lien de la page du site');
		assert.ok(discord.description.includes('Nocturne — Une nuit de jeux'), 'le type et le résumé');

		await s.instance.synchroniser(serveur.client);
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.create, 1, 'une seule création');
		assert.equal(serveur.appels.edit, 0, 'rien à mettre à jour');
	});

	it('met à jour l\'événement Discord quand le site change, et laisse l\'heure de début d\'un événement en cours', async () => {
		const e = site.creer();
		await s.instance.synchroniser(serveur.client);
		e.titre = 'Nocturne déplacée';
		e.lieu = 'Gymnase';
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.edit, 1);
		const discord = [...serveur.evenements.values()][0];
		assert.equal(discord.name, 'Nocturne déplacée');
		assert.equal(discord.entityMetadata.location, 'Gymnase');
		assert.equal(serveur.appels.create, 1, 'pas de doublon');

		// Événement en cours : Discord verrouille l'heure de début, on ne l'envoie pas
		serveur.evenements.set(discord.id, { ...discord, status: GuildScheduledEventStatus.Active });
		const edit = serveur.guild.scheduledEvents.edit;
		let envoye;
		serveur.guild.scheduledEvents.edit = async (cle, donnees) => {
			envoye = donnees;
			return edit(cle, donnees);
		};
		e.titre = 'Nocturne en cours';
		e.debut = `${dansUnAn()}T19:00`;
		await s.instance.synchroniser(serveur.client);
		assert.ok(envoye && !('scheduledStartTime' in envoye), 'pas d\'heure de début pour un événement en cours');
		assert.equal(envoye.name, 'Nocturne en cours');
	});

	it('supprime l\'événement Discord quand l\'événement est supprimé du site', async () => {
		site.creer();
		const garde = site.creer({ titre: 'Je reste' });
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.evenements.size, 2);
		site.evenements = [garde];
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.evenements.size, 1);
		assert.equal([...serveur.evenements.values()][0].name, 'Je reste');
		assert.equal(serveur.appels.delete, 1);
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.delete, 1, 'rien de plus aux passages suivants');
	});

	it('ne supprime rien quand le site est simplement injoignable, et ne lève jamais d\'erreur', async () => {
		site.creer();
		await s.instance.synchroniser(serveur.client);
		site.injoignable = true;
		await s.instance.synchroniser(serveur.client);
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.evenements.size, 1);
		assert.equal(serveur.appels.delete, 0);
		assert.equal(s.erreurs.length, 1, 'l\'erreur n\'est dite qu\'une fois');
		site.injoignable = false;
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.evenements.size, 1);
	});

	it('garde un événement qui sort des 50 premiers mais existe toujours sur le site', async () => {
		const e = site.creer();
		await s.instance.synchroniser(serveur.client);
		const liste = site.get.bind(site);
		site.get = async (chemin) => (chemin === '/bot/evenements' ? { evenements: [] } : liste(chemin));
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.evenements.size, 1, 'toujours là');
		assert.equal(serveur.appels.delete, 0);
		assert.ok(e);
	});

	it('ne recrée pas un événement supprimé à la main sur Discord, mais le supprime proprement quand il disparaît du site', async () => {
		site.creer();
		await s.instance.synchroniser(serveur.client);
		serveur.evenements.clear();
		await s.instance.synchroniser(serveur.client);
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.create, 1, 'pas recréé');
		site.evenements = [];
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.delete, 0, 'rien à supprimer côté Discord');
		site.creer({ titre: 'Un autre' });
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.create, 2, 'un nouvel événement du site est bien créé');
	});

	it('reprend un événement Discord déjà là (son texte contient l\'adresse de la page) au lieu d\'en créer un second', async () => {
		const e = site.creer();
		const existant = await serveur.guild.scheduledEvents.create({ name: 'Ancien nom', description: `Détails : ${antreReel.urlSite(`/evenements/${e.id}`)}`, entityMetadata: { location: 'Ici' }, scheduledStartTime: new Date(), scheduledEndTime: new Date() });
		serveur.appels.create = 0;
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.create, 0, 'pas de doublon');
		assert.equal(serveur.evenements.get(existant.id).name, 'Nocturne de rentrée', 'mis à jour d\'après le site');
	});

	it('ne crée rien pour un événement déjà commencé ou terminé, ni pour un serveur qui n\'a rien demandé', async () => {
		site.creer({ debut: '2000-01-01T10:00', fin: '2099-01-01T10:00', titre: 'Déjà commencé' });
		site.creer({ termine: true, titre: 'Terminé' });
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.create, 0);

		site.creer({ titre: 'Futur' });
		const autre = fauxServeur('222222222222222222');
		const sansDemande = creerSynchro(site, autre, { serveurs: () => [] });
		await sansDemande.instance.synchroniser(autre.client);
		assert.equal(autre.appels.create, 0);
	});

	it("utilise l'affiche du site comme image de l'événement Discord, la change, la retire, et se passe d'image si Discord la refuse", async () => {
		const e = site.creer({ affiche: '/uploads/affiches/affiche-a.jpg' });
		await s.instance.synchroniser(serveur.client);
		const discord = () => [...serveur.evenements.values()][0];
		assert.equal(discord().image, antreReel.urlSite('/uploads/affiches/affiche-a.jpg'));

		e.affiche = '/uploads/affiches/affiche-b.jpg';
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.edit, 1, "une nouvelle affiche met l'événement à jour");
		assert.equal(discord().image, antreReel.urlSite('/uploads/affiches/affiche-b.jpg'));

		e.affiche = null;
		await s.instance.synchroniser(serveur.client);
		assert.equal(discord().image, null, "l'affiche retirée du site retire l'image");

		// Discord ne peut pas télécharger l'image : l'événement est créé quand même, sans image
		const refus = fauxServeur('333333333333333333');
		const creer = refus.guild.scheduledEvents.create;
		refus.guild.scheduledEvents.create = async (donnees) => {
			if (donnees.image) throw new Error('Cannot fetch image');
			return creer(donnees);
		};
		const sans = creerSynchro(site, refus);
		site.creer({ titre: 'Image refusée', affiche: '/uploads/affiches/affiche-c.jpg' });
		await sans.instance.synchroniser(refus.client);
		const cree = [...refus.evenements.values()].find((x) => x.name === 'Image refusée');
		assert.ok(cree, "l'événement existe malgré l'image refusée");
		assert.equal(cree.image, null);
	});

	it('regroupe les demandes simultanées : jamais deux passes en même temps, jamais de doublon', async () => {
		site.creer();
		await Promise.all([s.instance.synchroniser(serveur.client), s.instance.synchroniser(serveur.client), s.instance.synchroniser(serveur.client)]);
		assert.equal(serveur.appels.create, 1);
		// Une demande arrivée pendant une passe donne bien une passe de plus (un événement créé entre-temps n'est pas oublié)
		const premiere = s.instance.synchroniser(serveur.client);
		site.creer({ titre: 'Arrivé pendant la passe' });
		await Promise.all([premiere, s.instance.synchroniser(serveur.client)]);
		assert.equal(serveur.evenements.size, 2);
	});

	it('retrouve l\'événement Discord d\'un événement du site', async () => {
		const e = site.creer();
		await s.instance.synchroniser(serveur.client);
		const trouve = await s.instance.evenementDiscord(serveur.guild, e.id);
		assert.equal(trouve.name, 'Nocturne de rentrée');
		assert.equal(await s.instance.evenementDiscord(serveur.guild, 999), null);
	});

	it('coupe ce qui dépasse les limites de Discord et neutralise les mentions', async () => {
		site.creer({ titre: `@everyone ${'x'.repeat(200)}`, lieu: 'L'.repeat(200), resume: 'R'.repeat(600) });
		await s.instance.synchroniser(serveur.client);
		const discord = [...serveur.evenements.values()][0];
		assert.ok(discord.name.length <= 100 && discord.entityMetadata.location.length <= 100 && discord.description.length <= 1000);
		assert.ok(!discord.name.includes('@everyone'), 'aucune mention');
	});
});

// --- Nettoyage : jamais de doublon, jamais d'événement orphelin ------------------------------------------------------------------

describe('nettoyage des événements Discord : orphelins et doublons', () => {
	let site, serveur, s;
	const MARQUE = (id) => `Détails, tables et inscription : ${antreReel.urlSite(`/evenements/${id}`)}`;
	/** Un événement Discord déjà là (créé par le bot lors d'une session précédente, par quelqu'un d'autre…). */
	const present = (id, extra = {}) => {
		serveur.evenements.set(id, { id, name: `Ancien ${id}`, creatorId: 'bot', status: GuildScheduledEventStatus.Scheduled, scheduledStartTime: new Date(Date.now() + 86_400_000), description: MARQUE(77), ...extra });
		return serveur.evenements.get(id);
	};
	beforeEach(() => {
		site = fauxSite();
		serveur = fauxServeur();
		s = creerSynchro(site, serveur);
	});

	it('supprime les événements Discord du bot dont l\'événement du site n\'existe plus (lien perdu : base du bot restaurée, site réinitialisé)', async () => {
		site.creer({ titre: 'Nouveau' }); // le site a été réinitialisé : un seul événement, d'un numéro que Discord ne connaît pas
		present('700', { description: MARQUE(77) });
		present('701', { description: MARQUE(78) });
		await s.instance.synchroniser(serveur.client);
		assert.deepEqual([...serveur.evenements.values()].map((e) => e.name), ['Nouveau'], 'seul l\'événement du site reste');
		assert.equal(serveur.appels.delete, 2);
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.delete, 2, 'rien de plus aux passages suivants');
		assert.equal(serveur.appels.create, 1);
	});

	it('supprime les doublons d\'un même événement du site : garde celui que connaît le bot', async () => {
		const e = site.creer();
		await s.instance.synchroniser(serveur.client);
		const connu = [...serveur.evenements.values()][0].id;
		present('1', { description: MARQUE(e.id) }); // plus ancien que le connu, mais pas celui du bot
		present('99999999999999999999', { description: MARQUE(e.id) });
		await s.instance.synchroniser(serveur.client);
		assert.deepEqual([...serveur.evenements.keys()], [connu]);
	});

	it('sans mémoire du lien (base restaurée) : les doublons existants sont réduits à un seul, le plus ancien, qui est repris sans recréation', async () => {
		const e = site.creer();
		present('20', { description: MARQUE(e.id), name: 'Le plus récent' });
		present('10', { description: MARQUE(e.id), name: 'Le plus ancien' });
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.appels.create, 0, 'repris, pas recréé');
		assert.equal(serveur.evenements.size, 1);
		assert.ok(serveur.evenements.has('10') || serveur.evenements.has('20'));
		await s.instance.synchroniser(serveur.client);
		await s.instance.synchroniser(serveur.client);
		assert.equal(serveur.evenements.size, 1, 'reste unique');
		assert.equal(serveur.appels.create, 0);
	});

	it('ne touche jamais à ce que le bot n\'a pas créé : événements d\'autres personnes, sans lien du site, ou lien d\'un autre site', async () => {
		site.creer();
		present('800', { creatorId: 'quelqu-un-d-autre', description: MARQUE(77) });
		present('801', { description: 'Soirée créée à la main, sans lien du site' });
		present('802', { description: 'Détails : https://autre-site.test/evenements/77' });
		present('803', { description: null });
		await s.instance.synchroniser(serveur.client);
		for (const id of ['800', '801', '802', '803']) assert.ok(serveur.evenements.has(id), `événement ${id} intact`);
		assert.equal(serveur.appels.delete, 0);
	});

	it('garde un événement du bot dont l\'événement du site existe encore (au-delà des 50 premiers) ; ne supprime rien si le site est injoignable', async () => {
		const e = site.creer();
		present('900', { description: MARQUE(e.id) });
		const liste = site.get.bind(site);
		site.get = async (chemin) => (chemin === '/bot/evenements' ? { evenements: [] } : liste(chemin));
		await s.instance.synchroniser(serveur.client);
		assert.ok(serveur.evenements.has('900'), 'toujours à venir sur le site : gardé');

		present('901', { description: MARQUE(77) }); // n'existe plus… mais le site ne répond pas
		site.get = async (chemin) => {
			if (chemin === '/bot/evenements') return { evenements: [] };
			throw new antreReel.ErreurAntre(500, 'panne', 'Le site est en panne.');
		};
		await s.instance.synchroniser(serveur.client);
		assert.ok(serveur.evenements.has('901'), 'dans le doute, on ne supprime pas');
		assert.equal(serveur.appels.delete, 0);
	});

	it('une erreur de suppression sur un événement ne bloque pas les autres', async () => {
		site.creer();
		present('1000', { description: MARQUE(77) });
		present('1001', { description: MARQUE(78) });
		const supprimer = serveur.guild.scheduledEvents.delete;
		serveur.guild.scheduledEvents.delete = async (cle) => {
			if (cle === '1000') throw new Error('Missing Permissions');
			return supprimer(cle);
		};
		await s.instance.synchroniser(serveur.client);
		assert.ok(serveur.evenements.has('1000'));
		assert.ok(!serveur.evenements.has('1001'), 'l\'autre est bien supprimé');
		assert.equal(s.erreurs.length, 1);
	});
});

describe('événements trop lointains pour Discord', () => {
	it('un événement à plus de cinq ans n\'est pas envoyé à Discord (qui le refuserait) et ne produit aucune erreur ; un événement proche l\'est', async () => {
		const site = fauxSite();
		const serveur = fauxServeur();
		const s = creerSynchro(site, serveur);
		site.creer({ titre: 'Dans six ans', debut: `${new Date().getUTCFullYear() + 6}-01-10T20:00`, fin: `${new Date().getUTCFullYear() + 6}-01-10T23:00` });
		site.creer({ titre: 'Bientôt' });
		await s.instance.synchroniser(serveur.client);
		assert.deepEqual([...serveur.evenements.values()].map((e) => e.name), ['Bientôt']);
		assert.equal(s.erreurs.length, 0, 'aucune erreur consignée');
		assert.equal(synchro.dansLHorizon(`${new Date().getUTCFullYear() + 1}-01-10T20:00`), true);
		assert.equal(synchro.dansLHorizon('2099-01-10T20:00'), false);
	});
});

// --- Serveurs concernés ------------------------------------------------------------------------------------------------------------

describe('serveurs qui reflètent les événements du site', () => {
	it('seul le serveur de test le demande pour l\'instant', () => {
		assert.deepEqual(getGuildsEvenementsAntre(), [SERVEUR]);
		assert.equal(evenementsAntreActifs(SERVEUR), true);
		assert.equal(evenementsAntreActifs('196975261630201857'), false, 'le serveur communautaire n\'est pas concerné');
		assert.equal(evenementsAntreActifs('DEFAULT'), false);
	});
});

// --- Commandes ---------------------------------------------------------------------------------------------------------------------

function fausseInteraction({ sous, options = {}, guild, client, serveurId = SERVEUR, discordId = '100000000000000001' }) {
	const reponses = [];
	return {
		reponses,
		guild,
		guildId: serveurId,
		client,
		user: { id: discordId },
		member: { permissions: { has: () => true } },
		options: {
			getSubcommand: () => sous,
			getString: (nom) => options[nom] ?? null,
			getAttachment: () => null,
			getFocused: () => ({ name: Object.keys(options)[0], value: Object.values(options)[0] }),
		},
		async deferReply() {},
		async reply(r) {
			reponses.push(r);
		},
		async editReply(r) {
			reponses.push(r);
		},
		async respond(choix) {
			reponses.push(choix);
		},
	};
}

describe('commandes /event', () => {
	let site, serveur, s, posts, vraiAntre;
	beforeEach(() => {
		site = fauxSite();
		serveur = fauxServeur();
		s = creerSynchro(site, serveur);
		synchro.utiliser(s.instance);
		affichage.oublierEvenements();
		posts = [];
		vraiAntre = { get: antreReel.get, post: antreReel.post };
		antreReel.get = (chemin) => site.get(chemin);
		antreReel.post = async (chemin, corps, options) => {
			posts.push({ chemin, corps, options });
			return { evenement: site.creer({ titre: corps.titre, type: corps.type, debut: corps.debut, fin: corps.fin, lieu: corps.lieu, resume: corps.resume }) };
		};
	});
	const restaurer = () => Object.assign(antreReel, vraiAntre);

	it('/event create : crée sur le site au nom du compte lié, puis l\'événement Discord, et en donne les deux liens', async () => {
		try {
			const demain = new Date(Date.now() + 86_400_000);
			const date = `${String(demain.getUTCDate()).padStart(2, '0')}/${String(demain.getUTCMonth() + 1).padStart(2, '0')}/${demain.getUTCFullYear()}`;
			const i = fausseInteraction({ sous: 'create', guild: serveur.guild, client: serveur.client, options: { nom: 'Soirée Discord', date, heure_debut: '20:00', heure_fin: '02:00', type: 'nocturne', description: 'Venez nombreux', lieu: 'Salle B' } });
			await commandeEvent.execute(i);
			assert.equal(posts.length, 1);
			assert.equal(posts[0].chemin, '/evenements');
			assert.equal(posts[0].options.discordId, '100000000000000001', 'au nom de la personne qui a lancé la commande');
			const { corps } = posts[0];
			assert.equal(corps.titre, 'Soirée Discord');
			assert.equal(corps.type, 'nocturne');
			assert.match(corps.debut, /^\d{4}-\d{2}-\d{2}T20:00$/);
			assert.ok(corps.fin > corps.debut && corps.fin.endsWith('T02:00'), 'une fin avant le début se passe le lendemain');
			assert.equal(corps.resume, 'Venez nombreux');
			assert.equal(corps.lieu, 'Salle B');
			assert.equal(serveur.appels.create, 1, 'l\'événement Discord est créé');
			const embed = i.reponses.at(-1).embeds[0].toJSON();
			assert.ok(embed.description.includes('/evenements/') && embed.description.includes('discord.com/events'), 'les deux liens');
		} finally {
			restaurer();
		}
	});

	it('/event create : refuse une date passée ou invalide sans appeler le site, et explique le refus d\'un compte qui n\'est pas modérateur', async () => {
		try {
			const passee = fausseInteraction({ sous: 'create', guild: serveur.guild, client: serveur.client, options: { nom: 'Trop tard', date: '01/01/2020', heure_debut: '20:00' } });
			await commandeEvent.execute(passee);
			assert.match(passee.reponses.at(-1).content, /futur/);
			const invalide = fausseInteraction({ sous: 'create', guild: serveur.guild, client: serveur.client, options: { nom: 'x', date: '31/02/2099', heure_debut: '20:00' } });
			await commandeEvent.execute(invalide);
			assert.match(invalide.reponses.at(-1).content, /invalide/);
			const tropLoin = fausseInteraction({ sous: 'create', guild: serveur.guild, client: serveur.client, options: { nom: 'Trop loin', date: '01/01/2099', heure_debut: '20:00' } });
			await commandeEvent.execute(tropLoin);
			assert.match(tropLoin.reponses.at(-1).content, /plus de cinq ans/);
			assert.equal(posts.length, 0);

			antreReel.post = async () => {
				throw new antreReel.ErreurAntre(403, 'interdit', 'Accès refusé.');
			};
			const refuse = fausseInteraction({ sous: 'create', guild: serveur.guild, client: serveur.client, options: { nom: 'Pas moi', date: dansUnAnJJMMAAAA(), heure_debut: '20:00' } });
			await commandeEvent.execute(refuse);
			assert.match(refuse.reponses.at(-1).content, /modérateurs et les administrateurs/);
			antreReel.post = async () => {
				throw new antreReel.ErreurAntre(401, 'discord_non_lie', '');
			};
			const nonLie = fausseInteraction({ sous: 'create', guild: serveur.guild, client: serveur.client, options: { nom: 'Pas lié', date: dansUnAnJJMMAAAA(), heure_debut: '20:00' } });
			await commandeEvent.execute(nonLie);
			assert.match(nonLie.reponses.at(-1).content, /\/antre lier/);
			assert.equal(serveur.appels.create, 0);
		} finally {
			restaurer();
		}
	});

	it('/event list et /event info : les événements du site, avec les tables et le nombre de joueurs', async () => {
		try {
			site.creer({ id: 7, titre: 'Nocturne', nbTables: 2, nbInteresses: 5, nbInscritsTotal: 6, avecTables: true, tables: [
				{ id: 1, jeu: 'Donjons & Dragons', titre: 'La crypte', mj: { pseudo: 'Alice' }, placesMax: 5, nbInteresses: 4, tresDemandee: false, cloturee: false, reserviste: false, campagne: null },
				{ id: 2, jeu: 'Cthulhu', titre: '', mj: { pseudo: 'Bob' }, placesMax: 3, nbInteresses: 1, tresDemandee: false, cloturee: true, reserviste: false, campagne: { id: 1, titre: 'Les montagnes' } },
			], discussionId: 12, heureRepartition: '19:30' });
			const liste = fausseInteraction({ sous: 'list', guild: serveur.guild, client: serveur.client });
			await commandeEvent.execute(liste);
			const embedListe = liste.reponses.at(-1).embeds[0].toJSON();
			assert.ok(embedListe.fields.some((f) => f.name.includes('Nocturne') && f.value.includes('2 tables') && f.value.includes('5 intéressés')));

			const info = fausseInteraction({ sous: 'info', guild: serveur.guild, client: serveur.client, options: { evenement: String(site.evenements.at(-1).id) } });
			await commandeEvent.execute(info);
			const embed = info.reponses.at(-1).embeds[0].toJSON();
			const texte = JSON.stringify(embed);
			assert.equal(embed.title, 'Nocturne');
			assert.ok(texte.includes('La crypte') && texte.includes('Alice') && texte.includes('4/5 joueurs'), 'une table, son MJ et ses joueurs');
			assert.ok(texte.includes('Cthulhu') && texte.includes('1/3 joueurs') && texte.includes('inscriptions closes') && texte.includes('Les montagnes'));
			assert.ok(texte.includes('6 personnes inscrites') && texte.includes('répartition à 19h30'));
			assert.ok(texte.includes('/forum/sujet/12'), 'la discussion du forum');

			const inconnu = fausseInteraction({ sous: 'info', guild: serveur.guild, client: serveur.client, options: { evenement: '999' } });
			await commandeEvent.execute(inconnu);
			assert.match(inconnu.reponses.at(-1).content, /n'existe plus/);
			const libre = fausseInteraction({ sous: 'info', guild: serveur.guild, client: serveur.client, options: { evenement: 'du texte libre' } });
			await commandeEvent.execute(libre);
			assert.match(libre.reponses.at(-1).content, /liste proposée/);
		} finally {
			restaurer();
		}
	});

	it('un événement de jeu de rôle sans table affiche « 0 table · 0 intéressé » ; un événement qui n\'a pas de tables (échecs…) n\'a aucune ligne de tables', async () => {
		try {
			site.creer({ titre: 'Initiation vide', categorie: 'jdr' });
			site.creer({ titre: 'Séance d\'échecs', categorie: 'echecs', type: 'echecs', lieu: 'Salle Agnodice' });
			const liste = fausseInteraction({ sous: 'list', guild: serveur.guild, client: serveur.client });
			await commandeEvent.execute(liste);
			const champs = liste.reponses.at(-1).embeds[0].toJSON().fields;
			assert.ok(champs.find((f) => f.name.includes('Initiation vide')).value.includes('0 table · 0 intéressé'));
			const echecs = champs.find((f) => f.name.includes('échecs')).value;
			assert.ok(!/table|venez simplement/i.test(echecs), `aucune mention de table pour les échecs : ${echecs}`);
			assert.ok(!echecs.includes('\n\n') && !echecs.startsWith('\n'), 'pas de ligne vide à la place');
			assert.match(echecs, /^Salle Agnodice\n\[Voir sur le site\]\(/, 'le lieu puis le lien, rien entre les deux');
		} finally {
			restaurer();
		}
	});

	it('saisie semi-automatique : événements à venir et types', async () => {
		try {
			site.creer({ titre: 'Nocturne de rentrée' });
			site.creer({ titre: 'Tournoi d\'échecs' });
			const evenements = fausseInteraction({ sous: 'info', guild: serveur.guild, client: serveur.client, options: { evenement: 'tournoi' } });
			await commandeEvent.autocomplete(evenements);
			assert.equal(evenements.reponses[0].length, 1);
			assert.ok(evenements.reponses[0][0].name.includes('Tournoi'));
		} finally {
			restaurer();
		}
	});
});
