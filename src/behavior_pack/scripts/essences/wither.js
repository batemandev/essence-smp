import { Player, system } from "@minecraft/server";

const WITHER_ESSENCE_CONFIG = {
    MESSAGES: {
        WHEN_ATTACKER_HAS_SUCCESSFULLY_AFFLICTED_WITHER_EFFECT: "§a You afflicted {target} Wither II for twenty (20) seconds. They're hurting!",
        WHEN_TARGET_HAS_BEEN_AFFLICTED_WITH_WITHER_EFFECT: "§c You have been afflicted with Wither II for twenty (20) seconds by {attacker}",
        WITHER_SKULL_BARRAGE_FIRED: "§d§l Wither Barrage! §r§7Three skulls FIRED!",
        WITHER_SKULL_BARRAGE_READY: "§a Wither Skull Barrage is ready!",
        CORRUPTION_CLOUD_ACTIVATED: "§d§l Corruption Cloud! §r§7Darkness spreads...",
        CORRUPTION_CLOUD_READY: "§a Corruption Cloud is ready!",
        CORRUPTION_CLOUD_AFFECTED: "§5 You've been caught in a Corruption Cloud!",
        WITHER_STRIKE_ACTIVATED: "§5§l WITHER STRIKE! §r§7{target} has been struck down!",
        WITHER_STRIKE_AFFLICTED: "§4§l You've been struck by Wither Strike! §r§cYou are stunned and severely weakened!",
        WITHER_STRIKE_READY: "§a Wither Strike is ready!"
    },
    SOUNDS: {
        WHEN_ATTACKER_HAS_SUCCESSFULLY_AFFLICTED_WITHER_EFFECT: "mob.wither.hurt",
        WHEN_TARGET_HAS_BEEN_AFFLICTED_WITH_WITHER_EFFECT: "mob.wither.hurt",
        WITHER_SKULL_BARRAGE_FIRED: "mob.wither.shoot",
        WITHER_SKULL_BARRAGE_READY: "random.orb",
        CORRUPTION_CLOUD_ACTIVATED: "mob.wither.ambient",
        CORRUPTION_CLOUD_READY: "random.orb",
        WITHER_STRIKE_ACTIVATED: "mob.wither.death",
        WITHER_STRIKE_READY: "random.orb"
    },
    WITHER_SKULL_BARRAGE_ABILITY: {
        COOLDOWN: 2400,
        SKULL_COUNT: 3,
        SKULL_DELAY: 10
    },
    CORRUPTION_CLOUD_ABILITY: {
        COOLDOWN: 3600,
        RADIUS: 5
    },
    WITHER_STRIKE_ABILITY: {
        COOLDOWN: 1800,
        DURATION: 200,
        WITHER_AMPLIFIER: 3,
        MINING_FATIGUE_AMPLIFIER: 2
    }
}

const hitCounts = new Map();
const witherSkullCooldowns = new Map();
const corruptionCooldowns = new Map();
const corruptionIntervals = new Map();
const witherStrikeCooldowns = new Map();

/**
 * 
 * @param {*} player - the player being checked. 
 */
function hasWitherEssence(player) {
    const inventory = player.getComponent("inventory");
    if (!inventory) return false;

    const container = inventory.container;
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item && item.typeId === "metro:wither_essence") {
            return true;
        }
    }
    return false;
}

/**
 * @param {Player} player - the player being checked.
 */
function getWitherCooldownStatus(player) {
    const currentTick = system.currentTick;
    const barrageLastUse = witherSkullCooldowns.get(player.id);
    const corruptionLastUse = corruptionCooldowns.get(player.id);
    const strikeLastUse = witherStrikeCooldowns.get(player.id);

    let barrageStatus;
    if (!barrageLastUse || currentTick - barrageLastUse >= WITHER_ESSENCE_CONFIG.WITHER_SKULL_BARRAGE_ABILITY.COOLDOWN) {
        barrageStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((WITHER_ESSENCE_CONFIG.WITHER_SKULL_BARRAGE_ABILITY.COOLDOWN - (currentTick - barrageLastUse)) / 20);
        barrageStatus = `§c ${remaining}s`;
    }

    let corruptionStatus;
    if (!corruptionLastUse || currentTick - corruptionLastUse >= WITHER_ESSENCE_CONFIG.CORRUPTION_CLOUD_ABILITY.COOLDOWN) {
        corruptionStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((WITHER_ESSENCE_CONFIG.CORRUPTION_CLOUD_ABILITY.COOLDOWN - (currentTick - corruptionLastUse)) / 20);
        corruptionStatus = `§c ${remaining}s`;
    }

    let strikeStatus;
    if (!strikeLastUse || currentTick - strikeLastUse >= WITHER_ESSENCE_CONFIG.WITHER_STRIKE_ABILITY.COOLDOWN) {
        strikeStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((WITHER_ESSENCE_CONFIG.WITHER_STRIKE_ABILITY.COOLDOWN - (currentTick - strikeLastUse)) / 20);
        strikeStatus = `§c ${remaining}s`;
    }

    return `${barrageStatus} ${corruptionStatus} ${strikeStatus}`;
}

/**
 * Wither Essence Passive 2: For every ten (10) successful hits on players, 
 * the next struck target is afflicted with Wither II for twenty (20) seconds. 
 * This effect cannot stack and must be re-earned through additional hits.
 * @param {Player} attacker - the player attacker.
 * @param {Player} target - the player target.
 */
function applyWitherOnHit(attacker, target) {
    const playerId = attacker.id;

    let hitCount = hitCounts.get(playerId) || 0;
    hitCount++;

    if (hitCount >= 10) {
        target.addEffect("wither", 400, {
            amplifier: 1,
            showParticles: true
        });

        hitCounts.set(playerId, 0);
        attacker.sendMessage(WITHER_ESSENCE_CONFIG.MESSAGES.WHEN_ATTACKER_HAS_SUCCESSFULLY_AFFLICTED_WITHER_EFFECT.replace("{target}", target.name));
        attacker.onScreenDisplay.setActionBar(`§c ${hitCount}/10`);
        attacker.playSound(WITHER_ESSENCE_CONFIG.SOUNDS.WHEN_ATTACKER_HAS_SUCCESSFULLY_AFFLICTED_WITHER_EFFECT);
        target.sendMessage(WITHER_ESSENCE_CONFIG.MESSAGES.WHEN_TARGET_HAS_BEEN_AFFLICTED_WITH_WITHER_EFFECT.replace("{attacker}", attacker.name));
        target.playSound(WITHER_ESSENCE_CONFIG.SOUNDS.WHEN_TARGET_HAS_BEEN_AFFLICTED_WITH_WITHER_EFFECT);
    } else {
        hitCounts.set(playerId, hitCount);
        attacker.onScreenDisplay.setActionBar(`§c ${hitCount}/10`);
    }
}

/**
 * 
 * @param {Player} player - the player object.
 */
function spawnWitherSkull(player, isCharged = false) {
    const location = player.location;
    const viewDirection = player.getViewDirection();

    const spawnLocation = {
        x: location.x + viewDirection.x * 1.5,
        y: location.y + 1.6,
        z: location.z + viewDirection.z * 1.5
    };

    const skullType = isCharged ? "minecraft:wither_skull_dangerous" : "minecraft:wither_skull";

    try {
        const skull = player.dimension.spawnEntity(skullType, spawnLocation);

        const speed = isCharged ? 1.5 : 1.0;
        skull.applyImpulse({
            x: viewDirection.x * speed,
            y: viewDirection.y * speed,
            z: viewDirection.z * speed
        });

        player.playSound(WITHER_ESSENCE_CONFIG.SOUNDS.WITHER_SKULL_BARRAGE_FIRED);

    } catch (error) {
        player.sendMessage("§cFailed to spawn wither skull: " + error);
    }
}

/**
 * Wither Essence Ability 1 (Skull Barrage): The user fires three (3) 
 * Wither Skulls forward, with the final skull being charged, dealing 
 * increased damage and destruction. This ability is triggered by using 
 * the Wither Essence item (right click) and has a cooldown of two (2) minutes.
 * @param {Player} player - the player casting the ability.
 */
function fireWitherSkullBarrage(player) {
    const currentTick = system.currentTick;
    const lastUse = witherSkullCooldowns.get(player.id);

    if (lastUse && currentTick - lastUse < WITHER_ESSENCE_CONFIG.WITHER_SKULL_BARRAGE_ABILITY.COOLDOWN) {
        const remaining = Math.ceil((WITHER_ESSENCE_CONFIG.WITHER_SKULL_BARRAGE_ABILITY.COOLDOWN - (currentTick - lastUse)) / 20);
        system.run(() => { player.sendMessage(`§c Wither Barrage: ${remaining}s`); });
        return false;
    }

    witherSkullCooldowns.set(player.id, currentTick);

    player.sendMessage(WITHER_ESSENCE_CONFIG.MESSAGES.WITHER_SKULL_BARRAGE_FIRED);

    for (let i = 0; i < WITHER_ESSENCE_CONFIG.WITHER_SKULL_BARRAGE_ABILITY.SKULL_COUNT; i++) {
        system.runTimeout(() => {
            const isCharged = (i === WITHER_ESSENCE_CONFIG.WITHER_SKULL_BARRAGE_ABILITY.SKULL_COUNT - 1);
            spawnWitherSkull(player, isCharged);
        }, i * WITHER_ESSENCE_CONFIG.WITHER_SKULL_BARRAGE_ABILITY.SKULL_DELAY);
    }

    system.runTimeout(() => {
        if (player.isValid) {
            player.sendMessage(WITHER_ESSENCE_CONFIG.MESSAGES.WITHER_SKULL_BARRAGE_READY);
            player.playSound(WITHER_ESSENCE_CONFIG.SOUNDS.WITHER_SKULL_BARRAGE_READY);
        }
    }, WITHER_ESSENCE_CONFIG.WITHER_SKULL_BARRAGE_ABILITY.COOLDOWN);

    return true;
}

/**
 * Wither Essence Ability 2 (Corruption Cloud): The user summons a dark cloud 
 * around themselves, afflicting Blindness I, Darkness I, Nausea, and Wither II 
 * to all players within the area, including the user, for twenty (20) seconds. 
 * This ability is triggered by using the Wither Essence item (right click) while 
 * sneaking and has a cooldown of three (3) minutes.
 * @param {Player} player - the player casting the ability.
 */
function corruptionCloud(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = corruptionCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < WITHER_ESSENCE_CONFIG.CORRUPTION_CLOUD_ABILITY.COOLDOWN) {
            const remaining = Math.ceil((WITHER_ESSENCE_CONFIG.CORRUPTION_CLOUD_ABILITY.COOLDOWN - (currentTick - lastUse)) / 20);
            player.sendMessage(`§c Corruption Cloud: ${remaining}s`);
            return false;
        }

        corruptionCooldowns.set(player.id, currentTick);
        const cloudCenter = { ...player.location };
        const radius = WITHER_ESSENCE_CONFIG.CORRUPTION_CLOUD_ABILITY.RADIUS;

        player.sendMessage(WITHER_ESSENCE_CONFIG.MESSAGES.CORRUPTION_CLOUD_ACTIVATED);
        player.playSound(WITHER_ESSENCE_CONFIG.SOUNDS.CORRUPTION_CLOUD_ACTIVATED);

        const nearbyPlayers = player.dimension.getPlayers({
            location: cloudCenter,
            maxDistance: radius
        });

        system.run(() => {
            nearbyPlayers.forEach(p => {
                p.addEffect("blindness", 400, {
                    amplifier: 0,
                    showParticles: true
                });
                p.addEffect("darkness", 400, {
                    amplifier: 0,
                    showParticles: true
                });
                p.addEffect("nausea", 400, {
                    amplifier: 0,
                    showParticles: true
                });
                p.addEffect("wither", 400, {
                    amplifier: 1,
                    showParticles: true
                });

                if (p.id !== player.id) {
                    p.sendMessage(WITHER_ESSENCE_CONFIG.MESSAGES.CORRUPTION_CLOUD_AFFECTED);
                }
            });
        });

        let angle = 0;
        const particleInterval = system.runInterval(() => {
            for (let i = 0; i < 32; i++) {
                const particleAngle = angle + (i * Math.PI * 2 / 32);
                const x = cloudCenter.x + radius * Math.cos(particleAngle);
                const z = cloudCenter.z + radius * Math.sin(particleAngle);
                player.dimension.spawnParticle("minecraft:soul_particle", {
                    x: x,
                    y: cloudCenter.y + 1,
                    z: z
                });
            }
            angle += 0.15;
        }, 1);

        system.runTimeout(() => {
            system.clearRun(particleInterval);
            corruptionIntervals.delete(player.id);
        }, 400);

        system.runTimeout(() => {
                if (player.isValid) {
                    player.sendMessage(WITHER_ESSENCE_CONFIG.MESSAGES.CORRUPTION_CLOUD_READY);
                    player.playSound(WITHER_ESSENCE_CONFIG.SOUNDS.CORRUPTION_CLOUD_READY);
                }
        }, WITHER_ESSENCE_CONFIG.CORRUPTION_CLOUD_ABILITY.COOLDOWN);

        corruptionIntervals.set(player.id, particleInterval);
        return true;
    });
}

/**
 * Wither Essence Ability 3 (Wither Strike): Upon striking a player, the target 
 * is stunned, inflicted with Wither IV, and suffers Mining Fatigue III, severely 
 * limiting their movement and combat effectiveness. This ability is triggered by 
 * hitting a player while holding the Wither Essence item and has a cooldown of 
 * one (1) minute and thirty (30) seconds.
 * @param {Player} attacker - the player casting the ability.
 * @param {Player} target - the player target.
 */
function witherStrike(attacker, target) {
    const currentTick = system.currentTick;
    const lastUse = witherStrikeCooldowns.get(attacker.id);

    if (lastUse && currentTick - lastUse < WITHER_ESSENCE_CONFIG.WITHER_STRIKE_ABILITY.COOLDOWN) {
        const remaining = Math.ceil((WITHER_ESSENCE_CONFIG.WITHER_STRIKE_ABILITY.COOLDOWN - (currentTick - lastUse)) / 20);
        system.run(() => { attacker.sendMessage(`§c Wither Strike: ${remaining}s`); });
        return false;
    }

    witherStrikeCooldowns.set(attacker.id, currentTick);

    target.addEffect("wither", WITHER_ESSENCE_CONFIG.WITHER_STRIKE_ABILITY.DURATION, {
        amplifier: WITHER_ESSENCE_CONFIG.WITHER_STRIKE_ABILITY.WITHER_AMPLIFIER,
        showParticles: true
    });

    target.addEffect("mining_fatigue", WITHER_ESSENCE_CONFIG.WITHER_STRIKE_ABILITY.DURATION, {
        amplifier: WITHER_ESSENCE_CONFIG.WITHER_STRIKE_ABILITY.MINING_FATIGUE_AMPLIFIER,
        showParticles: true
    });

    target.addEffect("slowness", WITHER_ESSENCE_CONFIG.WITHER_STRIKE_ABILITY.DURATION, {
        amplifier: 255,
        showParticles: true
    });

    attacker.sendMessage(WITHER_ESSENCE_CONFIG.MESSAGES.WITHER_STRIKE_ACTIVATED.replace("{target}", target.name));
    attacker.playSound(WITHER_ESSENCE_CONFIG.SOUNDS.WITHER_STRIKE_ACTIVATED);

    target.sendMessage(WITHER_ESSENCE_CONFIG.MESSAGES.WITHER_STRIKE_AFFLICTED);
    target.playSound(WITHER_ESSENCE_CONFIG.SOUNDS.WITHER_STRIKE_ACTIVATED);

    for (let i = 0; i < 20; i++) {
        system.runTimeout(() => {
            if (target.isValid) {
                target.dimension.spawnParticle("minecraft:soul_particle", {
                    x: target.location.x,
                    y: target.location.y + 1,
                    z: target.location.z
                });
            }
        }, i * 2);
    }

    system.runTimeout(() => {
        if (attacker.isValid) {
            attacker.sendMessage(WITHER_ESSENCE_CONFIG.MESSAGES.WITHER_STRIKE_READY);
            attacker.playSound(WITHER_ESSENCE_CONFIG.SOUNDS.WITHER_STRIKE_READY);
        }
    }, WITHER_ESSENCE_CONFIG.WITHER_STRIKE_ABILITY.COOLDOWN);

    return true;
}

/**
 * 
 * @param {*} player - the player object. 
 */
function cleanupWitherEssenceAbilities(player) {
    const interval = corruptionIntervals.get(player.id);
    if (interval) {
        system.clearRun(interval);
        corruptionIntervals.delete(player.id);
    }
}

export { applyWitherOnHit, cleanupWitherEssenceAbilities, corruptionCloud, fireWitherSkullBarrage, getWitherCooldownStatus, hasWitherEssence, witherStrike };
