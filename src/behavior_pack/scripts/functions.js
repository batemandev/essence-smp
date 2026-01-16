import { Player } from "@minecraft/server";

/**
 * Adds a player to the trusted players list
 * @param {Player} player - The player whose trust list is being modified
 * @param {string} trustedId - The ID of the player to add to the trusted list
 * @returns {void}
 */
function addTrustedPlayer(player, trustedId) {
    const trusted = getTrustedPlayers(player);
    trusted.add(trustedId);
    const trustedArray = Array.from(trusted);
    player.setDynamicProperty("trustedPlayers", JSON.stringify(trustedArray));
}

/**
 * Removes a player from the trusted players list
 * @param {Player} player - The player whose trust list is being modified
 * @param {string} trustedId - The ID of the player to remove from the trusted list
 * @returns {void}
 */
function removeTrustedPlayer(player, trustedId) {
    const trusted = getTrustedPlayers(player);
    trusted.delete(trustedId);
    const trustedArray = Array.from(trusted);
    player.setDynamicProperty("trustedPlayers", JSON.stringify(trustedArray));
}

/**
 * Get the set of trusted player IDs for a given player
 * @param {Player} player - The player being checked
 * @returns {Set<string>} Set of trusted player IDs
 */
function getTrustedPlayers(player) {
    const trustedJson = player.getDynamicProperty("trustedPlayers");
    if (trustedJson) {
        try {
            const trustedArray = JSON.parse(trustedJson);
            return new Set(trustedArray);
        } catch (e) {
            return new Set();
        }
    }
    return new Set();
}

export { addTrustedPlayer, getTrustedPlayers, removeTrustedPlayer };
