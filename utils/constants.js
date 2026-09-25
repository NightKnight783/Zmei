/**
 * Dictionnaire contenant les configurations pour chaque serveur.
 * La clé "DEFAULT" est utilisée si le serveur n'a pas de configuration spécifique.
 */
const guildsConfig = {
    "DEFAULT": {
        logChannel: "1513952930389295205",
        roleBureau: "466128906953687052",
        roleAdmin: "196979185976213504",
        roleMembreCA: "196979132939108352",
        roleMembreHonneur: "1232785134453788824",
        roleMJ: "1170097284638318694",
        roleJeuVideo: "684484042548314187",
        roleWargame: "648985188906303518",
        roleEchecs: "1505915680292343839",
        createVoiceChannelId: "1546240226370920590",
        tempVoiceCategoryId: "1546240169814925404"
    },
    // Serveur de Test (remplacez l'ID par l'ID réel de votre serveur de test)
    "1510323842638286890": {
        logChannel: "1513952930389295205",
        roleBureau: "466128906953687052",
        roleAdmin: "196979185976213504",
        roleMembreCA: "196979132939108352",
        roleMembreHonneur: "1232785134453788824",
        roleMJ: "1546257207761313893",
        roleJeuVideo: "1546257229420957706",
        roleWargame: "1546257104111800380",
        roleEchecs: "1546257131169120347",
        createVoiceChannelId: "1546240226370920590",
        tempVoiceCategoryId: "1546240169814925404"
    },
    // Serveur Communautaire (à remplir avec les vrais identifiants)
    "196975261630201857": {
        logChannel: "1170109733621989386",
        roleBureau: "466128906953687052",
        roleAdmin: "196979185976213504",
        roleMembreCA: "196979132939108352",
        roleMembreHonneur: "1232785134453788824",
        roleMJ: "1170097284638318694",
        roleJeuVideo: "684484042548314187",
        roleWargame: "648985188906303518",
        roleEchecs: "1505915680292343839",
        createVoiceChannelId: "COMMUNITY_CREATE_VOICE_ID",
        tempVoiceCategoryId: "COMMUNITY_TEMP_CATEGORY_ID"
    }
};

/**
 * Récupère la configuration spécifique à un serveur donné.
 * Si la configuration du serveur n'existe pas, retourne la configuration par défaut.
 *
 * @param {string} guildId - L'identifiant (ID) du serveur Discord.
 * @returns {object} La configuration correspondante pour le serveur.
 */
const getGuildConfig = (guildId) => {
    return guildsConfig[guildId] || guildsConfig["DEFAULT"];
};

module.exports = {
    getGuildConfig
};