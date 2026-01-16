import { Player, system } from "@minecraft/server";
import { getTrustedPlayers } from "../functions";

const HEALER_ESSENCE_CONFIG = {
    MESSAGES: {
        CIRCLE_OF_VITALITY_ACTIVATED: " §d§lCircle of Vitality! §r§7All trusted players within the healing circle are granted Regeneration III for fifteen (15) seconds.",
        CIRCLE_OF_VITALITY_READY: " §aCircle of Vitality is ready!",
        CIRCLE_OF_VITALITY_RECEIVED: " §a{player}'s Circle of Vitality has granted you fifteen (15) seconds of Regeneration III",
        PURGE_WARD_ACTIVATED: " §5§lPurge Ward! §r§7Enemies cannot consume Golden Apples for four (4) seconds.",
        PURGE_WARD_READY: " §aPurge Ward is ready!",
        PURGE_WARD_AFFECTED: " §cYou've been afflicted with Purge Ward and cannot consume Golden Apples for four (4) seconds!",
        TOUCH_OF_GRACE_ALLY: " §a {player}'s Touch of Grace blessed you with Regeneration III and Resistance II for ten (10) seconds!",
        TOUCH_OF_GRACE_ENEMY: " §c{player}'s Touch of Grace afflicted you with Weakness and Slowness!",
        TOUCH_OF_GRACE_ACTIVATED: " §d§lTOUCH OF GRACE! §r§7{target} has been afflicted with Weakness and Slowness!",
        TOUCH_OF_GRACE_READY: " §aTouch of Grace is ready!"
    },
    SOUNDS: {
        CIRCLE_OF_VITALITY_ACTIVATED: "beacon.power",
        CIRCLE_OF_VITALITY_READY: "random.orb",
        PURGE_WARD_ACTIVATED: "mob.elder_guardian.curse",
        PURGE_WARD_READY: "random.orb",
        TOUCH_OF_GRACE_ACTIVATED: "beacon.power",
        TOUCH_OF_GRACE_READY: "random.orb"
    },
    CIRCLE_OF_VITALITY: {
        COOLDOWN: 3000,
        RADIUS: 5,
        REGENERATION_DURATION: 300,
        REGENERATION_AMPLIFIER: 2
    },
    PURGE_WARD: {
        COOLDOWN: 3600,
        RADIUS: 3,
        DURATION: 80
    },
    TOUCH_OF_GRACE: {
        COOLDOWN: 4200,
        ALLY_REGENERATION_DURATION: 200,
        ALLY_REGENERATION_AMPLIFIER: 2,
        ALLY_RESISTANCE_DURATION: 200,
        ALLY_RESISTANCE_AMPLIFIER: 1,
        ENEMY_WEAKNESS_DURATION: 200,
        ENEMY_WEAKNESS_AMPLIFIER: 0,
        ENEMY_SLOWNESS_DURATION: 200,
        ENEMY_SLOWNESS_AMPLIFIER: 0
    }
};

const circleOfVitalityCooldowns = new Map();
const purgeWardCooldowns = new Map();
const touchOfGraceCooldowns = new Map();
const purgeWardActive = new Map();
const circleIntervals = new Map();

/**
 * 
 * @param {Player} player - the player being checked. 
 * @returns boolean;
 */
function hasHealerEssence(player) {
    const inventory = player.getComponent("inventory");
    if (!inventory) return false;

    const container = inventory.container;
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item && item.typeId === "metro:healer_essence") {
            return true;
        }
    }
    return false;
}

/**
 * 
 * @param {Player} player - the player being checked. 
 * @returns 
 */
function getHealerCooldownStatus(player) {
    const currentTick = system.currentTick;
    const circleLastUse = circleOfVitalityCooldowns.get(player.id);
    const purgeLastUse = purgeWardCooldowns.get(player.id);
    const touchLastUse = touchOfGraceCooldowns.get(player.id);

    let circleStatus;
    if (!circleLastUse || currentTick - circleLastUse >= HEALER_ESSENCE_CONFIG.CIRCLE_OF_VITALITY.COOLDOWN) {
        circleStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((HEALER_ESSENCE_CONFIG.CIRCLE_OF_VITALITY.COOLDOWN - (currentTick - circleLastUse)) / 20);
        circleStatus = `§c ${remaining}s`;
    }

    let purgeStatus;
    if (!purgeLastUse || currentTick - purgeLastUse >= HEALER_ESSENCE_CONFIG.PURGE_WARD.COOLDOWN) {
        purgeStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((HEALER_ESSENCE_CONFIG.PURGE_WARD.COOLDOWN - (currentTick - purgeLastUse)) / 20);
        purgeStatus = `§c ${remaining}s`;
    }

    let touchStatus;
    if (!touchLastUse || currentTick - touchLastUse >= HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.COOLDOWN) {
        touchStatus = " §aReady!";
    } else {
        const remaining = Math.ceil((HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.COOLDOWN - (currentTick - touchLastUse)) / 20);
        touchStatus = ` §c${remaining}s`;
    }

    return `${circleStatus} ${purgeStatus} ${touchStatus}`;
}

/**
 * Healer Essence Ability 1 (Circle of Vitality): All trusted allies within 
 * a five (5) block radius are surrounded by a visible healing circle and 
 * are granted Regeneration III for fifteen (15) seconds. This ability is 
 * triggered by using the Healer Essence item (right click) and has a cooldown
 * of two (2) minutes and thirty (30) seconds.
 * @param {Player} player - the player casting the ability. 
 */
function circleOfVitality(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = circleOfVitalityCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < HEALER_ESSENCE_CONFIG.CIRCLE_OF_VITALITY.COOLDOWN) {
            return false;
        }

        circleOfVitalityCooldowns.set(player.id, currentTick);

        const playerPos = player.location;
        const radius = HEALER_ESSENCE_CONFIG.CIRCLE_OF_VITALITY.RADIUS;
        const fixedPos = { x: playerPos.x, y: playerPos.y, z: playerPos.z };

        player.sendMessage(HEALER_ESSENCE_CONFIG.MESSAGES.CIRCLE_OF_VITALITY_ACTIVATED);
        player.dimension.playSound(HEALER_ESSENCE_CONFIG.SOUNDS.CIRCLE_OF_VITALITY_ACTIVATED, player.location);

        const trusted = getTrustedPlayers(player);
        const notifiedPlayers = new Set();

        const healInterval = system.runInterval(() => {
            const nearbyPlayers = player.dimension.getPlayers({
                location: fixedPos,
                maxDistance: radius
            });

            nearbyPlayers.forEach(p => {
                if (p.id === player.id || trusted.has(p.id)) {
                    p.addEffect("regeneration", 40, {
                        amplifier: HEALER_ESSENCE_CONFIG.CIRCLE_OF_VITALITY.REGENERATION_AMPLIFIER,
                        showParticles: true
                    });

                    if (p.id !== player.id && !notifiedPlayers.has(p.id)) {
                        p.sendMessage(HEALER_ESSENCE_CONFIG.MESSAGES.CIRCLE_OF_VITALITY_RECEIVED.replace("{player}", player.name));
                        notifiedPlayers.add(p.id);
                    }
                }
            });
        }, 20);

        let angle = 0;
        const particleInterval = system.runInterval(() => {
            for (let i = 0; i < 32; i++) {
                const particleAngle = angle + (i * Math.PI * 2 / 32);
                const x = fixedPos.x + radius * Math.cos(particleAngle);
                const z = fixedPos.z + radius * Math.sin(particleAngle);
                player.dimension.spawnParticle("minecraft:villager_happy", {
                    x: x,
                    y: fixedPos.y + 1,
                    z: z
                });
            }
            angle += 0.15;
        }, 1);

        system.runTimeout(() => {
            system.clearRun(particleInterval);
            system.clearRun(healInterval);
            circleIntervals.delete(player.id);
        }, HEALER_ESSENCE_CONFIG.CIRCLE_OF_VITALITY.REGENERATION_DURATION);

        system.runTimeout(() => {
            if (player.isValid) {
                player.sendMessage(HEALER_ESSENCE_CONFIG.MESSAGES.CIRCLE_OF_VITALITY_READY);
                player.dimension.playSound(HEALER_ESSENCE_CONFIG.SOUNDS.CIRCLE_OF_VITALITY_READY, player.location);
            }
        }, HEALER_ESSENCE_CONFIG.CIRCLE_OF_VITALITY.COOLDOWN);

        circleIntervals.set(player.id, { particle: particleInterval, heal: healInterval });
        return true;
    });
}

/**
 * Healer Essence Ability 2 (Purge Ward): Any untrusted players within a
 * three (3) block radius are prevented from consuming Golden Apples for
 * four (4) seconds. This ability is triggered by using the Healer Essence
 * item (right click) while sneaking and has a cooldown of three (3) minutes.
 * @param {Player} player - the player casting the ability. 
 */
function purgeWard(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = purgeWardCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < HEALER_ESSENCE_CONFIG.PURGE_WARD.COOLDOWN) {
            const remaining = Math.ceil((HEALER_ESSENCE_CONFIG.PURGE_WARD.COOLDOWN - (currentTick - lastUse)) / 20);
            player.sendMessage(`§c Purge Ward: ${remaining}s`);
            return false;
        }

        purgeWardCooldowns.set(player.id, currentTick);

        const playerPos = player.location;
        const radius = HEALER_ESSENCE_CONFIG.PURGE_WARD.RADIUS;

        player.sendMessage(HEALER_ESSENCE_CONFIG.MESSAGES.PURGE_WARD_ACTIVATED);
        player.dimension.playSound(HEALER_ESSENCE_CONFIG.SOUNDS.PURGE_WARD_ACTIVATED, player.location);

        const nearbyPlayers = player.dimension.getPlayers({
            location: playerPos,
            maxDistance: radius
        });

        const trusted = getTrustedPlayers(player);

        system.run(() => {
            nearbyPlayers.forEach(p => {
                if (p.id !== player.id && !trusted.has(p.id)) {
                    purgeWardActive.set(p.id, currentTick);
                    p.sendMessage(HEALER_ESSENCE_CONFIG.MESSAGES.PURGE_WARD_AFFECTED);
                }
            });
        });

        system.runTimeout(() => {
            nearbyPlayers.forEach(p => {
                if (p.id !== player.id && !trusted.has(p.id)) {
                    purgeWardActive.delete(p.id);
                }
            });
        }, HEALER_ESSENCE_CONFIG.PURGE_WARD.DURATION);

        system.runTimeout(() => {
            if (player.isValid) {
                player.sendMessage(HEALER_ESSENCE_CONFIG.MESSAGES.PURGE_WARD_READY);
                player.dimension.playSound(HEALER_ESSENCE_CONFIG.SOUNDS.PURGE_WARD_READY, player.location);
            }
        }, HEALER_ESSENCE_CONFIG.PURGE_WARD.COOLDOWN);

        return true;
    });
}

/**
 * Healer Essence Ability 3 (Touch of Grace): Trusted players are granted
 * Regeneration III and Resistance II for ten (10) seconds. Untrusted players
 * are inflicted with Weakness I and Slowness I. This ability is triggered by
 * hitting a player while holding the Healer Essence item and has a cooldown
 * of three (3) minutes and thirty (30) seconds.
 * @param {Player} attacker - the player casting the ability. 
 * @param {Player} target - the target player.
 * @returns 
 */
function touchOfGrace(attacker, target) {
    const currentTick = system.currentTick;
    const lastUse = touchOfGraceCooldowns.get(attacker.id);

    if (lastUse && currentTick - lastUse < HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.COOLDOWN) {
        const remaining = Math.ceil((HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.COOLDOWN - (currentTick - lastUse)) / 20);
        system.run(() => { attacker.sendMessage(`§c Touch of Grace: ${remaining}s`); });
        return false;
    }

    touchOfGraceCooldowns.set(attacker.id, currentTick);

    const trusted = getTrustedPlayers(attacker);

    if (trusted.has(target.id)) {
        target.addEffect("regeneration", HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.ALLY_REGENERATION_DURATION, {
            amplifier: HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.ALLY_REGENERATION_AMPLIFIER,
            showParticles: true
        });

        target.addEffect("resistance", HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.ALLY_RESISTANCE_DURATION, {
            amplifier: HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.ALLY_RESISTANCE_AMPLIFIER,
            showParticles: true
        });

        target.sendMessage(HEALER_ESSENCE_CONFIG.MESSAGES.TOUCH_OF_GRACE_ALLY.replace("{player}", attacker.name));

        for (let i = 0; i < 30; i++) {
            system.runTimeout(() => {
                if (target.isValid) {
                    target.dimension.spawnParticle("minecraft:villager_happy", {
                        x: target.location.x,
                        y: target.location.y + 1,
                        z: target.location.z
                    });
                }
            }, i * 2);
        }
    } else {
        target.addEffect("weakness", HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.ENEMY_WEAKNESS_DURATION, {
            amplifier: HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.ENEMY_WEAKNESS_AMPLIFIER,
            showParticles: true
        });

        target.addEffect("slowness", HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.ENEMY_SLOWNESS_DURATION, {
            amplifier: HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.ENEMY_SLOWNESS_AMPLIFIER,
            showParticles: true
        });

        target.sendMessage(HEALER_ESSENCE_CONFIG.MESSAGES.TOUCH_OF_GRACE_ENEMY.replace("{player}", attacker.name));

        for (let i = 0; i < 30; i++) {
            system.runTimeout(() => {
                if (target.isValid) {
                    target.dimension.spawnParticle("minecraft:redstone_ore_dust_particle", {
                        x: target.location.x,
                        y: target.location.y + 1,
                        z: target.location.z
                    });
                }
            }, i * 2);
        }
    }

    attacker.sendMessage(HEALER_ESSENCE_CONFIG.MESSAGES.TOUCH_OF_GRACE_ACTIVATED.replace("{target}", target.name));
    attacker.dimension.playSound(HEALER_ESSENCE_CONFIG.SOUNDS.TOUCH_OF_GRACE_ACTIVATED, attacker.location);

    system.runTimeout(() => {
        if (attacker.isValid) {
            attacker.sendMessage(HEALER_ESSENCE_CONFIG.MESSAGES.TOUCH_OF_GRACE_READY);
            attacker.playSound(HEALER_ESSENCE_CONFIG.SOUNDS.TOUCH_OF_GRACE_READY);
        }
    }, HEALER_ESSENCE_CONFIG.TOUCH_OF_GRACE.COOLDOWN);

    return true;
}

/**
 * 
 * @param {Player} player - the player being checked. 
 * @returns 
 */
function canConsumeGoldenApple(player) {
    const currentTick = system.currentTick;
    const purgeTime = purgeWardActive.get(player.id);

    if (purgeTime && currentTick - purgeTime < HEALER_ESSENCE_CONFIG.PURGE_WARD.DURATION) {
        return false;
    }

    return true;
}

/**
 * 
 * @param {Player} player - the player object. 
 */
function onGoldenAppleConsume(player) {
    if (hasHealerEssence(player)) {
        system.run(() => {
            player.addEffect("absorption", 2400, {
                amplifier: 0,
                showParticles: true
            });
        });
    }
}

/**
 * 
 * @param {Player} player - the player object. 
 */
function cleanupHealerEssenceAbilities(player) {
    const intervals = circleIntervals.get(player.id);
    if (intervals) {
        system.clearRun(intervals.particle);
        system.clearRun(intervals.heal);
        circleIntervals.delete(player.id);
    }

    purgeWardActive.delete(player.id);
}

export { canConsumeGoldenApple, circleOfVitality, cleanupHealerEssenceAbilities, getHealerCooldownStatus, hasHealerEssence, onGoldenAppleConsume, purgeWard, touchOfGrace };

