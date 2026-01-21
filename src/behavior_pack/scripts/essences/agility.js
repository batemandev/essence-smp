import { Player, system } from "@minecraft/server";
import { getTrustedPlayers } from "../functions";

const AGILITY_ESSENCE_CONFIG = {
    MESSAGES: {
        GROUND_IMPACT_ACTIVATED: " §d§lGROUND IMPACT! §r§7Enhanced mobility granted!",
        GROUND_IMPACT_READY: " §aGround Impact is ready!",
        GROUND_IMPACT_SHOCKWAVE: " §cYou were hit by {player}'s Ground Impact shockwave!",
        LIGHTNING_RUSH_ACTIVATED: " §e§lLIGHTNING RUSH! §r§7Lightning strikes your foes!",
        LIGHTNING_RUSH_READY: " §aLightning Rush is ready!",
        LIGHTNING_RUSH_STRUCK: " §cYou were struck by {player}'s Lightning Rush!",
        CRIPPLING_BLOW_ACTIVATED: " §5§lCRIPPLING BLOW! §r§7{target} has been crippled! §cThey are afflicted with Slowness III and cannot consume golden apples for four (4) seconds.",
        CRIPPLING_BLOW_AFFLICTED: " §4You've been crippled!§7 You cannot consume golden apples for four (4) seconds.",
        CRIPPLING_BLOW_READY: " §aCrippling Blow is ready!",
        SPEED_BONUS_INCREASED: " §aSpeed bonus increased to Speed {level}!",
        SPEED_BONUS_RESET: " §cSpeed bonus reset to Speed II!"
    },
    SOUNDS: {
        GROUND_IMPACT_ACTIVATED: "random.levelup",
        GROUND_IMPACT_READY: "random.orb",
        GROUND_IMPACT_SHOCKWAVE: "block.creaking_heart.fall",
        LIGHTNING_RUSH_ACTIVATED: "ambient.weather.thunder",
        LIGHTNING_RUSH_READY: "random.orb",
        CRIPPLING_BLOW_ACTIVATED: "random.anvil_land",
        CRIPPLING_BLOW_READY: "random.orb"
    },
    GROUND_IMPACT: {
        COOLDOWN: 3000,
        HASTE_DURATION: 500,
        HASTE_AMPLIFIER: 3,
        JUMP_DURATION: 200,
        JUMP_AMPLIFIER: 3,
        SHOCKWAVE_RADIUS: 8,
        SHOCKWAVE_DAMAGE: 12
    },
    LIGHTNING_RUSH: {
        COOLDOWN: 2400,
        SPEED_DURATION: 200,
        SPEED_AMPLIFIER: 2,
        LIGHTNING_DURATION: 700,
        LIGHTNING_INTERVAL: 20,
        LIGHTNING_RADIUS: 6,
        LIGHTNING_DAMAGE: 4
    },
    CRIPPLING_BLOW: {
        COOLDOWN: 3000,
        SLOWNESS_DURATION: 80,
        SLOWNESS_AMPLIFIER: 2,
        GOLDEN_APPLE_BLOCK_DURATION: 80
    },
    DISTANCE_TRACKING: {
        BLOCKS_PER_LEVEL: 65,
        MAX_SPEED_LEVEL: 4,
        BASE_SPEED_LEVEL: 1
    }
};

const groundImpactCooldowns = new Map();
const lightningRushCooldowns = new Map();
const cripplingBlowCooldowns = new Map();
const groundImpactActive = new Map();
const lightningRushActive = new Map();
const cripplingBlowActive = new Map();
const playerDistances = new Map();
const playerLastPositions = new Map();
const lightningIntervals = new Map();
const abilityDamageActive = new Map();

/**
 * @param {Player} player - the player being checked.
 */
function hasAgilityEssence(player) {
    const inventory = player.getComponent("inventory");
    if (!inventory) return false;

    const container = inventory.container;
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item && item.typeId === "metro:agility_essence") {
            return true;
        }
    }
    return false;
}

/**
 * @param {Player} player - the player being checked.
 */
function getAgilityCooldownStatus(player) {
    const currentTick = system.currentTick;
    const groundImpactLastUse = groundImpactCooldowns.get(player.id);
    const lightningRushLastUse = lightningRushCooldowns.get(player.id);
    const cripplingBlowLastUse = cripplingBlowCooldowns.get(player.id);

    let groundImpactStatus;
    if (!groundImpactLastUse || currentTick - groundImpactLastUse >= AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.COOLDOWN) {
        groundImpactStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.COOLDOWN - (currentTick - groundImpactLastUse)) / 20);
        groundImpactStatus = `§c ${remaining}s`;
    }

    let lightningRushStatus;
    if (!lightningRushLastUse || currentTick - lightningRushLastUse >= AGILITY_ESSENCE_CONFIG.LIGHTNING_RUSH.COOLDOWN) {
        lightningRushStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((AGILITY_ESSENCE_CONFIG.LIGHTNING_RUSH.COOLDOWN - (currentTick - lightningRushLastUse)) / 20);
        lightningRushStatus = `§c ${remaining}s`;
    }

    let cripplingBlowStatus;
    if (!cripplingBlowLastUse || currentTick - cripplingBlowLastUse >= AGILITY_ESSENCE_CONFIG.CRIPPLING_BLOW.COOLDOWN) {
        cripplingBlowStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((AGILITY_ESSENCE_CONFIG.CRIPPLING_BLOW.COOLDOWN - (currentTick - cripplingBlowLastUse)) / 20);
        cripplingBlowStatus = `§c ${remaining}s`;
    }

    return `${groundImpactStatus} ${lightningRushStatus} ${cripplingBlowStatus}`;
}

/**
 * Agility Essence Passive 2: For every 65 blocks traveled without taking damage,
 * Speed level increases by 1, starting at Speed II and capping at Speed V.
 * Taking damage resets the bonus back to Speed II.
 * @param {Player} player - the player being checked.
 */
function updateDistanceTracking(player) {
    if (!hasAgilityEssence(player)) {
        return;
    }

    const currentPos = player.location;
    const lastPos = playerLastPositions.get(player.id);

    if (!lastPos) {
        playerLastPositions.set(player.id, currentPos);
        playerDistances.set(player.id, { distance: 0, speedLevel: AGILITY_ESSENCE_CONFIG.DISTANCE_TRACKING.BASE_SPEED_LEVEL });
        return;
    }

    const dx = currentPos.x - lastPos.x;
    const dy = currentPos.y - lastPos.y;
    const dz = currentPos.z - lastPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const data = playerDistances.get(player.id) || { distance: 0, speedLevel: AGILITY_ESSENCE_CONFIG.DISTANCE_TRACKING.BASE_SPEED_LEVEL };
    data.distance += distance;

    const blocksPerLevel = AGILITY_ESSENCE_CONFIG.DISTANCE_TRACKING.BLOCKS_PER_LEVEL;
    const newSpeedLevel = Math.min(
        AGILITY_ESSENCE_CONFIG.DISTANCE_TRACKING.BASE_SPEED_LEVEL + Math.floor(data.distance / blocksPerLevel),
        AGILITY_ESSENCE_CONFIG.DISTANCE_TRACKING.MAX_SPEED_LEVEL
    );

    if (newSpeedLevel > data.speedLevel) {
        data.speedLevel = newSpeedLevel;
        player.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.SPEED_BONUS_INCREASED.replace("{level}", (newSpeedLevel + 1).toString()));
    }

    playerDistances.set(player.id, data);
    playerLastPositions.set(player.id, currentPos);
}

/**
 * @param {Player} player - the player being checked.
 */
function resetDistanceTracking(player) {
    const data = playerDistances.get(player.id);
    if (data && data.speedLevel > AGILITY_ESSENCE_CONFIG.DISTANCE_TRACKING.BASE_SPEED_LEVEL) {
        playerDistances.set(player.id, { distance: 0, speedLevel: AGILITY_ESSENCE_CONFIG.DISTANCE_TRACKING.BASE_SPEED_LEVEL });
        player.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.SPEED_BONUS_RESET);
    }
}

/**
 * @param {Player} player - the player being checked.
 */
function getCurrentSpeedLevel(player) {
    const data = playerDistances.get(player.id);
    return data ? data.speedLevel : AGILITY_ESSENCE_CONFIG.DISTANCE_TRACKING.BASE_SPEED_LEVEL;
}

/**
 * Agility Essence Ability 1 (Ground Impact): The player gains Haste IV and Jump Boost IV
 * for 25 seconds. When landing on the ground during this effect, enemies within an 8 block
 * radius take 6 hearts of damage from the shockwave. Cooldown: 2 minutes 30 seconds.
 * @param {Player} player - the player casting the ability.
 */
function groundImpact(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = groundImpactCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.COOLDOWN) {
            return false;
        }

        groundImpactCooldowns.set(player.id, currentTick);

        player.addEffect("haste", AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.HASTE_DURATION, {
            amplifier: AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.HASTE_AMPLIFIER,
            showParticles: true
        });

        player.addEffect("jump_boost", AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.JUMP_DURATION, {
            amplifier: AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.JUMP_AMPLIFIER,
            showParticles: true
        });

        player.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.GROUND_IMPACT_ACTIVATED);
        player.playSound(AGILITY_ESSENCE_CONFIG.SOUNDS.GROUND_IMPACT_ACTIVATED);

        groundImpactActive.set(player.id, { startTick: currentTick, lastY: player.location.y });

        system.runTimeout(() => {
            groundImpactActive.delete(player.id);
        }, AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.JUMP_DURATION);

        system.runTimeout(() => {
            if (player.isValid) {
                player.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.GROUND_IMPACT_READY);
                player.playSound(AGILITY_ESSENCE_CONFIG.SOUNDS.GROUND_IMPACT_READY);
            }
        }, AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.COOLDOWN);

        return true;
    });
}

/**
 * @param {Player} player - the player casting the ability.
 */
function checkGroundImpactLanding(player) {
    const data = groundImpactActive.get(player.id);
    if (!data || !hasAgilityEssence(player)) return;

    let checkCount = 0;
    const maxChecks = 60;

    const landingCheck = system.runInterval(() => {
        checkCount++;

        if (!player.isValid || !groundImpactActive.has(player.id) || checkCount >= maxChecks) {
            system.clearRun(landingCheck);
            return;
        }

        if (player.isOnGround) {
            system.clearRun(landingCheck);

            const playerPos = player.location;
            const radius = AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.SHOCKWAVE_RADIUS;

            player.dimension.spawnParticle("minecraft:falling_dust_gravel_particle", playerPos);
            player.dimension.playSound(AGILITY_ESSENCE_CONFIG.SOUNDS.GROUND_IMPACT_SHOCKWAVE, player.location);
            player.runCommand(`camerashake add @a[r=15] 0.5 0.30 positional`);

            const nearbyPlayers = player.dimension.getPlayers({
                location: playerPos,
                maxDistance: radius
            });

            const trusted = getTrustedPlayers(player);

            abilityDamageActive.set(player.id, true);

            nearbyPlayers.forEach(p => {
                if (p.id !== player.id && !trusted.has(p.id)) {
                    p.applyDamage(AGILITY_ESSENCE_CONFIG.GROUND_IMPACT.SHOCKWAVE_DAMAGE, {
                        cause: "entityAttack",
                        damagingEntity: player
                    });
                    p.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.GROUND_IMPACT_SHOCKWAVE.replace("{player}", player.name));
                }
            });

            system.runTimeout(() => {
                abilityDamageActive.delete(player.id);
            }, 2);

            const centerX = Math.floor(playerPos.x);
            const centerY = Math.floor(playerPos.y);
            const centerZ = Math.floor(playerPos.z);

            for (let x = centerX - radius; x <= centerX + radius; x++) {
                for (let z = centerZ - radius; z <= centerZ + radius; z++) {
                    const distanceFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(z - centerZ, 2));

                    if (distanceFromCenter <= radius) {
                        const particleChance = distanceFromCenter <= 3 ? 1.0 :
                            distanceFromCenter <= 5 ? 0.6 : 0.3;

                        if (Math.random() < particleChance) {
                            player.dimension.spawnParticle("minecraft:lava_particle", {
                                x: x + 0.5,
                                y: centerY,
                                z: z + 0.5
                            });
                        }
                    }
                }
            }
        }
    }, 1);
}

/**
 * Agility Essence Ability 2 (Lightning Rush): The player gains Speed III for 15 seconds.
 * While active, lightning strikes enemies near the player for 35 seconds.
 * Cooldown: 2 minutes.
 * @param {Player} player - the player casting the ability.
 */
function lightningRush(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = lightningRushCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < AGILITY_ESSENCE_CONFIG.LIGHTNING_RUSH.COOLDOWN) {
            return false;
        }

        lightningRushCooldowns.set(player.id, currentTick);

        player.addEffect("speed", AGILITY_ESSENCE_CONFIG.LIGHTNING_RUSH.SPEED_DURATION, {
            amplifier: AGILITY_ESSENCE_CONFIG.LIGHTNING_RUSH.SPEED_AMPLIFIER,
            showParticles: true
        });

        player.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.LIGHTNING_RUSH_ACTIVATED);
        player.playSound(AGILITY_ESSENCE_CONFIG.SOUNDS.LIGHTNING_RUSH_ACTIVATED);

        lightningRushActive.set(player.id, currentTick);

        const lightningInterval = system.runInterval(() => {
            if (!player.isValid || !lightningRushActive.has(player.id)) {
                system.clearRun(lightningInterval);
                lightningIntervals.delete(player.id);
                return;
            }

            const playerPos = player.location;
            const nearbyPlayers = player.dimension.getPlayers({
                location: playerPos,
                maxDistance: AGILITY_ESSENCE_CONFIG.LIGHTNING_RUSH.LIGHTNING_RADIUS
            });

            const trusted = getTrustedPlayers(player);

            nearbyPlayers.forEach(p => {
                if (p.id !== player.id && !trusted.has(p.id)) {
                    for (let i = 0; i < 5; i++) {
                        p.dimension.spawnParticle("minecraft:lab_table_misc_mystical_particle", {
                            x: p.location.x + (Math.random() - 0.5) * 0.6,
                            y: p.location.y + 2.2,
                            z: p.location.z + (Math.random() - 0.5) * 0.6
                        });
                    }

                    system.runTimeout(() => {
                        if (p.isValid) {
                            player.dimension.spawnEntity("minecraft:lightning_bolt", p.location);
                            p.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.LIGHTNING_RUSH_STRUCK.replace("{player}", player.name));
                        }
                    }, 10);
                }
            });
        }, AGILITY_ESSENCE_CONFIG.LIGHTNING_RUSH.LIGHTNING_INTERVAL);

        const trailInterval = system.runInterval(() => {
            if (!player.isValid || !lightningRushActive.has(player.id)) {
                system.clearRun(trailInterval);
                return;
            }

            const playerPos = player.location;
            const viewDirection = player.getViewDirection();

            const offsetX = -viewDirection.x * 0.5;
            const offsetZ = -viewDirection.z * 0.5;

            for (let i = 0; i < 4; i++) {
                const height = playerPos.y + (i * 0.5);
                player.dimension.spawnParticle("minecraft:blue_flame_particle", {
                    x: playerPos.x + offsetX,
                    y: height,
                    z: playerPos.z + offsetZ
                });
                player.dimension.spawnParticle("minecraft:lab_table_misc_mystical_particle", {
                    x: playerPos.x + offsetX,
                    y: height,
                    z: playerPos.z + offsetZ
                });
            }
        }, 1);

        lightningIntervals.set(player.id, lightningInterval);

        system.runTimeout(() => {
            lightningRushActive.delete(player.id);
            const interval = lightningIntervals.get(player.id);
            if (interval) {
                system.clearRun(interval);
                lightningIntervals.delete(player.id);
            }
            if (trailInterval) {
                system.clearRun(trailInterval);
            }
        }, AGILITY_ESSENCE_CONFIG.LIGHTNING_RUSH.LIGHTNING_DURATION);

        system.runTimeout(() => {
            if (player.isValid) {
                player.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.LIGHTNING_RUSH_READY);
                player.playSound(AGILITY_ESSENCE_CONFIG.SOUNDS.LIGHTNING_RUSH_READY);
            }
        }, AGILITY_ESSENCE_CONFIG.LIGHTNING_RUSH.COOLDOWN);

        return true;
    });
}

/**
 * Check if a player's damage should trigger crippling blow
 * @param {Player} player - the player being checked.
 */
function canTriggerCripplingBlow(player) {
    return !abilityDamageActive.get(player.id);
}

/**
 * Agility Essence Ability 3 (Crippling Blow): Upon striking a player, the target is
 * inflicted with Slowness III and cannot consume golden apples for 4 seconds.
 * Cooldown: 2 minutes 30 seconds.
 * @param {Player} attacker - the player casting the ability.
 * @param {Player} target - the player target.
 */
function cripplingBlow(attacker, target) {
    const currentTick = system.currentTick;
    const lastUse = cripplingBlowCooldowns.get(attacker.id);

    if (lastUse && currentTick - lastUse < AGILITY_ESSENCE_CONFIG.CRIPPLING_BLOW.COOLDOWN) {
        return false;
    }

    cripplingBlowCooldowns.set(attacker.id, currentTick);

    target.addEffect("slowness", AGILITY_ESSENCE_CONFIG.CRIPPLING_BLOW.SLOWNESS_DURATION, {
        amplifier: AGILITY_ESSENCE_CONFIG.CRIPPLING_BLOW.SLOWNESS_AMPLIFIER,
        showParticles: true
    });

    cripplingBlowActive.set(target.id, currentTick);

    attacker.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.CRIPPLING_BLOW_ACTIVATED.replace("{target}", target.name));
    attacker.playSound(AGILITY_ESSENCE_CONFIG.SOUNDS.CRIPPLING_BLOW_ACTIVATED);

    target.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.CRIPPLING_BLOW_AFFLICTED);
    target.playSound(AGILITY_ESSENCE_CONFIG.SOUNDS.CRIPPLING_BLOW_ACTIVATED);

    system.runTimeout(() => {
        if (target.isValid) {
            target.dimension.spawnParticle("minecraft:critical_hit_emitter", {
                x: target.location.x,
                y: target.location.y + 1,
                z: target.location.z
            });
        }
    }, 2);

    system.runTimeout(() => {
        cripplingBlowActive.delete(target.id);
    }, AGILITY_ESSENCE_CONFIG.CRIPPLING_BLOW.GOLDEN_APPLE_BLOCK_DURATION);

    system.runTimeout(() => {
        if (attacker.isValid) {
            attacker.sendMessage(AGILITY_ESSENCE_CONFIG.MESSAGES.CRIPPLING_BLOW_READY);
            attacker.playSound(AGILITY_ESSENCE_CONFIG.SOUNDS.CRIPPLING_BLOW_READY);
        }
    }, AGILITY_ESSENCE_CONFIG.CRIPPLING_BLOW.COOLDOWN);

    return true;
}

/**
 * @param {Player} player - the player being checked.
 */
function canConsumeGoldenAppleAgility(player) {
    const currentTick = system.currentTick;
    const cripplingTime = cripplingBlowActive.get(player.id);

    if (cripplingTime && currentTick - cripplingTime < AGILITY_ESSENCE_CONFIG.CRIPPLING_BLOW.GOLDEN_APPLE_BLOCK_DURATION) {
        return false;
    }

    return true;
}

/**
 * @param {Player} player - the player being cleaned up.
 */
function cleanupAgilityEssenceAbilities(player) {
    groundImpactActive.delete(player.id);
    lightningRushActive.delete(player.id);
    cripplingBlowActive.delete(player.id);
    playerDistances.delete(player.id);
    playerLastPositions.delete(player.id);
    abilityDamageActive.delete(player.id);

    const interval = lightningIntervals.get(player.id);
    if (interval) {
        system.clearRun(interval);
        lightningIntervals.delete(player.id);
    }
}

export { canConsumeGoldenAppleAgility, canTriggerCripplingBlow, checkGroundImpactLanding, cleanupAgilityEssenceAbilities, cripplingBlow, getAgilityCooldownStatus, getCurrentSpeedLevel, groundImpact, hasAgilityEssence, lightningRush, resetDistanceTracking, updateDistanceTracking };