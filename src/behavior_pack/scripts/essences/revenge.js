import { system } from "@minecraft/server";
import { getTrustedPlayers } from "../functions";

const REVENGE_ESSENCE_CONFIG = {
    HOW_FAR_OTHER_PLAYERS_CAN_SEE_ABILITY_MESSAGES: 10,

    MESSAGES: {
        WHEN_PLAYER_USES_ENRAGED_ABILITY: "§a You used §cEnraged Ability§a!§7 You and your trusted players within the red circle will receive Strength II effect.",
        WHEN_ANOTHER_PLAYER_USES_ENRAGED_ABILITY: "§e {player} §7used §cEnraged Ability§7!",
        WHEN_TRUSTED_PLAYER_USES_ENRAGED_ABILITY: "§e {player} §7used §cEnraged Ability§7! §aEnter the 6 block radius circle to receive §cStrength II",
        WHEN_ENRAGED_ABILITY_IS_ON_COOLDOWN: "§c Enraged Ability: §7{remaining}s cooldown remaining",

        WHEN_PLAYER_USES_ALMIGHTY_SPEECH_ABILITY: " §aYou used §dAlmighty Speech Ability§a!§7 Your opponent has been imprisoned and cannot escape for 20 seconds.",
        WHEN_ANOTHER_PLAYER_USES_ALMIGHTY_SPEECH_ABILITY: " §e{player} §7used §dAlmighty Speech Ability§7!",
        WHEN_ALMIGHTY_SPEECH_ABILITY_IS_USED_ON_PLAYER: " §cYou've been imprisoned and cannot escape for 20 seconds!",
        WHEN_ALMIGHTY_SPEECH_ABILITY_IS_ON_COOLDOWN: " §cAlmighty Speech Ability: §7{remaining}s cooldown remaining",

        WHEN_PLAYER_USES_DIVINE_JUDGMENT_ABILITY: "§a You used §6Divine Judgment§a!§7 Nearby players have been afflicted with §cWeakness I§7 and §cSlowness I §7for §c60 seconds!",
        WHEN_ANOTHER_PLAYER_USES_DIVINE_JUDGMENT_ABILITY: "§e {player} §7used §6Divine Judgment§7!",
        WHEN_DIVINE_JUDGMENT_AFFECTS_PLAYER: "§e {player} §7used §6Divine Judgment§7! §cYou've been afflicted with §7Weakness I §cand §7Slowness I §cfor 60 seconds!",
        WHEN_TRUSTED_PLAYER_USES_DIVINE_JUDGMENT: "§e {player} §7used §6Divine Judgment§7! §aTrusted players are immune to its effects.",
        WHEN_DIVINE_JUDGMENT_ABILITY_IS_ON_COOLDOWN: "§c Divine Judgment: §7{remaining}s cooldown remaining",

        WHEN_PLAYER_HEALTH_DROPS_BELOW_SIX: "§a You received Strength IV for three (3) seconds as your health points dropped below 6."
    }
};

const activeJudgments = new Map();
const cooldowns = new Map();
const COOLDOWN_TIME = 2400;
const leftClickCooldowns = new Map();
const LEFT_CLICK_COOLDOWN = 3600;
const prisonedPlayers = new Map();
const prisonIntervals = new Map();
const sneakCooldowns = new Map();
const SNEAK_COOLDOWN = 4200;
const enragedIntervals = new Map();
const judgmentIntervals = new Map();
const lowHealthCooldowns = new Map();

const LOW_HEALTH_COOLDOWN = 300;
const LOW_HEALTH_THRESHOLD = 6;

/**
 * 
 * @param {*} player - the player being checked. 
 * @returns 
 */
function getRevengeCooldownStatus(player) {
    const currentTick = system.currentTick;
    const rightClickLastUse = cooldowns.get(player.id);
    const leftClickLastUse = leftClickCooldowns.get(player.id);
    const sneakLastUse = sneakCooldowns.get(player.id);

    let rightClickStatus;
    if (!rightClickLastUse || currentTick - rightClickLastUse >= COOLDOWN_TIME) {
        rightClickStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((COOLDOWN_TIME - (currentTick - rightClickLastUse)) / 20);
        rightClickStatus = `§c ${remaining}s`;
    }

    let leftClickStatus;
    if (!leftClickLastUse || currentTick - leftClickLastUse >= LEFT_CLICK_COOLDOWN) {
        leftClickStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((LEFT_CLICK_COOLDOWN - (currentTick - leftClickLastUse)) / 20);
        leftClickStatus = `§c ${remaining}s`;
    }

    let sneakStatus;
    if (!sneakLastUse || currentTick - sneakLastUse >= SNEAK_COOLDOWN) {
        sneakStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((SNEAK_COOLDOWN - (currentTick - sneakLastUse)) / 20);
        sneakStatus = `§c ${remaining}s`;
    }

    return `${rightClickStatus} ${leftClickStatus} ${sneakStatus}`;
}

/**
 * Revenge Essence Ability 1 (Enranged): Hitting a player grants the user 
 * Strength II for twenty (20) seconds and traps the target in red circle 
 * particles of six (6) radius wherein they can't get out and is teleported 
 * back to the center each time they try to escape. This ability is triggered 
 * by punching a player while holding the Revenge Essence item and it has three 
 * (3) minutes cooldown.
 * @param {*} player - the player casting the ability. 
 */
function enraged(player) {
    const currentTick = system.currentTick;
    const lastUse = cooldowns.get(player.id);

    if (lastUse && currentTick - lastUse < COOLDOWN_TIME) {
        const remaining = Math.ceil((COOLDOWN_TIME - (currentTick - lastUse)) / 20);
        player.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_ENRAGED_ABILITY_IS_ON_COOLDOWN.replace("{remaining}", remaining));
        return;
    }

    cooldowns.set(player.id, currentTick);
    const playerPos = player.location;
    const radius = 6;

    const playersToNotify = player.dimension.getPlayers({
        location: playerPos,
        maxDistance: REVENGE_ESSENCE_CONFIG.HOW_FAR_OTHER_PLAYERS_CAN_SEE_ABILITY_MESSAGES
    });

    const trusted = getTrustedPlayers(player);

    playersToNotify.forEach(p => {
        if (p.id === player.id) {
            return;
        }

        if (trusted.has(p.id)) {
            p.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_TRUSTED_PLAYER_USES_ENRAGED_ABILITY.replace("{player}", player.name));
        } else {
            p.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_ANOTHER_PLAYER_USES_ENRAGED_ABILITY.replace("{player}", player.name));
        }
    });

    player.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_PLAYER_USES_ENRAGED_ABILITY);

    const effectInterval = system.runInterval(() => {
        const currentPos = player.location;
        const nearbyPlayers = player.dimension.getPlayers({
            location: currentPos,
            maxDistance: radius
        });

        nearbyPlayers.forEach(p => {
            if (p.id === player.id || trusted.has(p.id)) {
                p.addEffect("strength", 30, {
                    amplifier: 1,
                    showParticles: true
                });
            }
        });
    }, 5);

    let angle = 0;
    const particleInterval = system.runInterval(() => {
        const currentPos = player.location;
        for (let i = 0; i < 32; i++) {
            const particleAngle = angle + (i * Math.PI * 2 / 32);
            const x = currentPos.x + radius * Math.cos(particleAngle);
            const z = currentPos.z + radius * Math.sin(particleAngle);
            player.dimension.spawnParticle("minecraft:redstone_ore_dust_particle", {
                x: x,
                y: currentPos.y + 1,
                z: z
            });
        }
        angle += 0.15;
    }, 1);

    system.runTimeout(() => {
        system.clearRun(particleInterval);
        system.clearRun(effectInterval);
        enragedIntervals.delete(player.id);
    }, 600);

    enragedIntervals.set(player.id, { particleInterval, effectInterval });
}

/**
 * Revenge Essence Ability 2 (Almighty Speech): Every trusted players around
 * the user's six (6) block radius gets Strength II for thirty (30) seconds
 * and the effect is granted as long as the players are within the red particles
 * that are spiraling around the player. This abiliity is triggered by using
 * the item (right click) and has two (2) minutes cooldown.
 * @param {*} attacker - the player casting the ability. 
 * @param {*} victim - the target player
 */
function almightySpeech(attacker, victim) {
    const currentTick = system.currentTick;
    const lastUse = leftClickCooldowns.get(attacker.id);

    if (lastUse && currentTick - lastUse < LEFT_CLICK_COOLDOWN) {
        const remaining = Math.ceil((LEFT_CLICK_COOLDOWN - (currentTick - lastUse)) / 20);
        attacker.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_ALMIGHTY_SPEECH_ABILITY_IS_ON_COOLDOWN.replace("{remaining}", remaining));
        return;
    }

    leftClickCooldowns.set(attacker.id, currentTick);

    const attackerPos = attacker.location;
    const playersToNotify = attacker.dimension.getPlayers({
        location: attackerPos,
        maxDistance: REVENGE_ESSENCE_CONFIG.HOW_FAR_OTHER_PLAYERS_CAN_SEE_ABILITY_MESSAGES
    });

    playersToNotify.forEach(p => {
        if (p.id !== attacker.id) {
            p.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_ANOTHER_PLAYER_USES_ALMIGHTY_SPEECH_ABILITY.replace("{player}", attacker.name));
        }
    });

    attacker.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_PLAYER_USES_ALMIGHTY_SPEECH_ABILITY);

    victim.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_ALMIGHTY_SPEECH_ABILITY_IS_USED_ON_PLAYER);

    system.run(() => {
        attacker.addEffect("strength", 400, {
            amplifier: 1,
            showParticles: true
        });
    });

    const prisonCenter = { ...victim.location };
    const prisonRadius = 4.5;
    const prisonHeight = 3;

    prisonedPlayers.set(victim.id, {
        center: prisonCenter,
        radius: prisonRadius,
        startTick: currentTick
    });

    let particleAngle = 0;
    const prisonInterval = system.runInterval(() => {
        const prisonData = prisonedPlayers.get(victim.id);
        if (!prisonData) {
            system.clearRun(prisonInterval);
            return;
        }

        const center = prisonData.center;

        for (let y = 0; y <= prisonHeight; y += 0.5) {
            for (let i = 0; i < 24; i++) {
                const angle = particleAngle + (i * Math.PI * 2 / 24);
                const x = center.x + prisonRadius * Math.cos(angle);
                const z = center.z + prisonRadius * Math.sin(angle);
                victim.dimension.spawnParticle("minecraft:redstone_ore_dust_particle", {
                    x: x,
                    y: center.y + y,
                    z: z
                });
            }
        }

        particleAngle += 0.1;

        try {
            const victimPos = victim.location;
            const dx = victimPos.x - center.x;
            const dz = victimPos.z - center.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance > prisonRadius - 0.5) {
                victim.teleport(center);
            }
        } catch (e) {
            prisonedPlayers.delete(victim.id);
            system.clearRun(prisonInterval);
        }
    }, 1);

    system.runTimeout(() => {
        prisonedPlayers.delete(victim.id);
        system.clearRun(prisonInterval);
        prisonIntervals.delete(victim.id);
    }, 400);

    prisonIntervals.set(victim.id, prisonInterval);
}

/**
 * Revenge Essence Ability 3 (Divine Judgment): Untrusted players in a radius of 
 * five (5) are debuffed with Weakness and Slowness I effects whereas the user is 
 * granted Strength I. For each kill, the user's Strength effect increases. 
 * This ability is triggered by using the Revenge Essence item (right click) while 
 * sneaking and has a cooldown of three (3) minutes thirty (30) seconds.
 * @param {*} player - the player casting the ability.
 */
function divineJudgment(player) {
    const currentTick = system.currentTick;
    const lastUse = sneakCooldowns.get(player.id);

    if (lastUse && currentTick - lastUse < SNEAK_COOLDOWN) {
        const remaining = Math.ceil((SNEAK_COOLDOWN - (currentTick - lastUse)) / 20);
        player.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_DIVINE_JUDGMENT_ABILITY_IS_ON_COOLDOWN.replace("{remaining}", remaining));
        return;
    }

    sneakCooldowns.set(player.id, currentTick);
    const playerPos = player.location;
    const radius = 5;

    const nearbyPlayers = player.dimension.getPlayers({
        location: playerPos,
        maxDistance: radius
    });

    const playersToNotify = player.dimension.getPlayers({
        location: playerPos,
        maxDistance: REVENGE_ESSENCE_CONFIG.HOW_FAR_OTHER_PLAYERS_CAN_SEE_ABILITY_MESSAGES
    });

    const trusted = getTrustedPlayers(player);

    playersToNotify.forEach(p => {
        if (p.id === player.id) {
            return;
        }

        if (trusted.has(p.id)) {
            p.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_TRUSTED_PLAYER_USES_DIVINE_JUDGMENT.replace("{player}", player.name));
        } else {
            p.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_ANOTHER_PLAYER_USES_DIVINE_JUDGMENT_ABILITY.replace("{player}", player.name));
        }
    });

    player.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_PLAYER_USES_DIVINE_JUDGMENT_ABILITY);

    activeJudgments.set(player.id, {
        kills: 0,
        startTick: currentTick
    });

    system.run(() => {
        nearbyPlayers.forEach(p => {
            if (p.id !== player.id && !trusted.has(p.id)) {
                p.addEffect("weakness", 1200, {
                    amplifier: 0,
                    showParticles: true
                });
                p.addEffect("slowness", 1200, {
                    amplifier: 0,
                    showParticles: true
                });
                p.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_DIVINE_JUDGMENT_AFFECTS_PLAYER.replace("{player}", player.name));
            }
        });

        player.addEffect("strength", 1200, {
            amplifier: 0,
            showParticles: true
        });
    });

    let angle = 0;
    const particleInterval = system.runInterval(() => {
        const currentPos = player.location;
        for (let i = 0; i < 28; i++) {
            const particleAngle = angle + (i * Math.PI * 2 / 28);
            const x = currentPos.x + radius * Math.cos(particleAngle);
            const z = currentPos.z + radius * Math.sin(particleAngle);
            player.dimension.spawnParticle("minecraft:soul_particle", {
                x: x,
                y: currentPos.y + 1,
                z: z
            });
        }
        angle += 0.12;
    }, 1);

    system.runTimeout(() => {
        system.clearRun(particleInterval);
        activeJudgments.delete(player.id);
        judgmentIntervals.delete(player.id);
    }, 1200);

    judgmentIntervals.set(player.id, particleInterval);
}

/**
 * 
 * @param {*} killer - the player object. 
 * @returns 
 */
function onJudgmentKill(killer) {
    const judgment = activeJudgments.get(killer.id);
    if (!judgment) return;

    judgment.kills++;
    const strengthAmplifier = Math.min(judgment.kills, 254);

    killer.addEffect("strength", 1200, {
        amplifier: strengthAmplifier,
        showParticles: true
    });
}

/**
 * 
 * @param {*} player - the player being checked. 
 */
function hasRevengeEssence(player) {
    const inventory = player.getComponent("inventory");
    if (!inventory) return false;

    const container = inventory.container;
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item && item.typeId === "metro:revenge_essence") {
            return true;
        }
    }
    return false;
}

/**
 * 
 * @param {*} player - the player being checked. 
 */
function checkLowHealth(player) {
    if (!hasRevengeEssence(player)) {
        return;
    }

    const currentTick = system.currentTick;
    const lastUse = lowHealthCooldowns.get(player.id);

    if (lastUse && currentTick - lastUse < LOW_HEALTH_COOLDOWN) {
        return;
    }

    const health = player.getComponent("health");
    if (!health) return;

    if (health.currentValue <= LOW_HEALTH_THRESHOLD) {
        player.sendMessage(REVENGE_ESSENCE_CONFIG.MESSAGES.WHEN_PLAYER_HEALTH_DROPS_BELOW_SIX);

        lowHealthCooldowns.set(player.id, currentTick);
        player.addEffect("strength", 60, {
            amplifier: 3,
            showParticles: true
        });
    }
}

/**
 * 
 * @param {*} player - the player object. 
 */
function cleanupPlayerRevengeAbilities(player) {
    const enragedData = enragedIntervals.get(player.id);
    if (enragedData) {
        system.clearRun(enragedData.particleInterval);
        system.clearRun(enragedData.effectInterval);
        enragedIntervals.delete(player.id);
    }

    const prisonInterval = prisonIntervals.get(player.id);
    if (prisonInterval) {
        system.clearRun(prisonInterval);
        prisonIntervals.delete(player.id);
        prisonedPlayers.delete(player.id);
    }

    const judgmentInterval = judgmentIntervals.get(player.id);
    if (judgmentInterval) {
        system.clearRun(judgmentInterval);
        judgmentIntervals.delete(player.id);
        activeJudgments.delete(player.id);
    }

    prisonedPlayers.forEach((data, victimId) => {
        if (victimId === player.id) {
            const interval = prisonIntervals.get(victimId);
            if (interval) {
                system.clearRun(interval);
                prisonIntervals.delete(victimId);
            }
            prisonedPlayers.delete(victimId);
        }
    });
}

export { almightySpeech, checkLowHealth, cleanupPlayerRevengeAbilities, divineJudgment, enraged, getRevengeCooldownStatus, hasRevengeEssence, onJudgmentKill };

