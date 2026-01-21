import { Player, system } from "@minecraft/server";
import { getTrustedPlayers } from "../functions";

const STRENGTH_ESSENCE_CONFIG = {
    MESSAGES: {
        COMBO_ACTIVATED: " §6§lCOMBO! §r§eStrength III activated for 15 seconds!",
        RALLY_OF_POWER_ACTIVATED: " §d§lRALLY OF POWER! §r§7Weakening enemies, empowering allies!",
        RALLY_OF_POWER_READY: " §aRally of Power is ready!",
        RALLY_OF_POWER_ENEMY_AFFECTED: " §cYou've been weakened by {player}'s Rally of Power!",
        RALLY_OF_POWER_ALLY_AFFECTED: " §a{player} empowered you with Rally of Power!",
        TITANIC_SLAM_ACTIVATED: " §4§lTITANIC SLAM! §r§7The ground trembles!",
        TITANIC_SLAM_READY: " §aTitanic Slam is ready!",
        TITANIC_SLAM_HIT: " §cYou were hit by {player}'s Titanic Slam!",
        CRUSHING_BLOW_ACTIVATED: " §5§lCRUSHING BLOW! §r§7{target} has been slowed!",
        CRUSHING_BLOW_AFFLICTED: "§4 You've been slowed by Crushing Blow!",
        CRUSHING_BLOW_READY: "§a Crushing Blow is ready!"
    },
    SOUNDS: {
        COMBO_ACTIVATED: "beacon.power",
        RALLY_OF_POWER_ACTIVATED: "beacon.power",
        RALLY_OF_POWER_READY: "random.orb",
        TITANIC_SLAM_ACTIVATED: "mob.wither.break_block",
        TITANIC_SLAM_ACTIVATED_2: "break.iron",
        TITANIC_SLAM_READY: "random.orb",
        CRUSHING_BLOW_ACTIVATED: "random.anvil_land",
        CRUSHING_BLOW_READY: "random.orb"
    },
    COMBO: {
        REQUIRED_HITS: 8,
        STRENGTH_DURATION: 300,
        STRENGTH_AMPLIFIER: 2
    },
    RALLY_OF_POWER: {
        COOLDOWN: 3000,
        RADIUS: 6,
        WEAKNESS_DURATION: 300,
        WEAKNESS_AMPLIFIER: 1,
        STRENGTH_DURATION: 400,
        STRENGTH_AMPLIFIER: 1
    },
    TITANIC_SLAM: {
        COOLDOWN: 1800,
        RADIUS: 8,
        DAMAGE: 9,
        STRENGTH_DURATION: 1200,
        STRENGTH_AMPLIFIER: 1,
        SPEED_DURATION: 1200,
        SPEED_AMPLIFIER: 1
    },
    CRUSHING_BLOW: {
        COOLDOWN: 2400,
        SLOWNESS_DURATION: 400,
        SLOWNESS_AMPLIFIER: 1
    }
};

const comboHits = new Map();
const comboActive = new Map();
const rallyOfPowerCooldowns = new Map();
const titanicSlamCooldowns = new Map();
const crushingBlowCooldowns = new Map();
const abilityDamageActive = new Map();

/**
 * @param {Player} player - the player being checked.
 */
function hasStrengthEssence(player) {
    const inventory = player.getComponent("inventory");
    if (!inventory) return false;

    const container = inventory.container;
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item && item.typeId === "metro:strength_essence") {
            return true;
        }
    }
    return false;
}

/**
 * @param {Player} player - the player being checked.
 */
function getStrengthCooldownStatus(player) {
    const currentTick = system.currentTick;
    const rallyLastUse = rallyOfPowerCooldowns.get(player.id);
    const slamLastUse = titanicSlamCooldowns.get(player.id);
    const crushingLastUse = crushingBlowCooldowns.get(player.id);

    let rallyStatus;
    if (!rallyLastUse || currentTick - rallyLastUse >= STRENGTH_ESSENCE_CONFIG.RALLY_OF_POWER.COOLDOWN) {
        rallyStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((STRENGTH_ESSENCE_CONFIG.RALLY_OF_POWER.COOLDOWN - (currentTick - rallyLastUse)) / 20);
        rallyStatus = `§c ${remaining}s`;
    }

    let slamStatus;
    if (!slamLastUse || currentTick - slamLastUse >= STRENGTH_ESSENCE_CONFIG.TITANIC_SLAM.COOLDOWN) {
        slamStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((STRENGTH_ESSENCE_CONFIG.TITANIC_SLAM.COOLDOWN - (currentTick - slamLastUse)) / 20);
        slamStatus = `§c ${remaining}s`;
    }

    let crushingStatus;
    if (!crushingLastUse || currentTick - crushingLastUse >= STRENGTH_ESSENCE_CONFIG.CRUSHING_BLOW.COOLDOWN) {
        crushingStatus = "§a Ready!";
    } else {
        const remaining = Math.ceil((STRENGTH_ESSENCE_CONFIG.CRUSHING_BLOW.COOLDOWN - (currentTick - crushingLastUse)) / 20);
        crushingStatus = `§c ${remaining}s`;
    }

    return `${rallyStatus} ${slamStatus} ${crushingStatus}`;
}

/**
 * Strength Essence Passive 2: Successfully landing an eight (8) hit combo
 * on a player grants the user Strength III for fifteen (15) seconds. This
 * effect cannot stack and refreshes only after the combo is completed again.
 * @param {Player} attacker - the player with the strength essence.
 */
function applyComboOnHit(attacker) {
    const playerId = attacker.id;

    if (comboActive.get(playerId)) {
        return;
    }

    let hitCount = comboHits.get(playerId) || 0;
    hitCount++;

    if (hitCount >= STRENGTH_ESSENCE_CONFIG.COMBO.REQUIRED_HITS) {
        attacker.addEffect("strength", STRENGTH_ESSENCE_CONFIG.COMBO.STRENGTH_DURATION, {
            amplifier: STRENGTH_ESSENCE_CONFIG.COMBO.STRENGTH_AMPLIFIER,
            showParticles: true
        });

        comboHits.set(playerId, 0);
        comboActive.set(playerId, true);

        attacker.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.COMBO_ACTIVATED);
        attacker.playSound(STRENGTH_ESSENCE_CONFIG.SOUNDS.COMBO_ACTIVATED);
        attacker.onScreenDisplay.setActionBar(`§6 Strength Combo: ${hitCount}/${STRENGTH_ESSENCE_CONFIG.COMBO.REQUIRED_HITS}`);

        system.runTimeout(() => {
            comboActive.delete(playerId);
        }, STRENGTH_ESSENCE_CONFIG.COMBO.STRENGTH_DURATION);
    } else {
        comboHits.set(playerId, hitCount);
        attacker.onScreenDisplay.setActionBar(`§6 Strength Combo: ${hitCount}/${STRENGTH_ESSENCE_CONFIG.COMBO.REQUIRED_HITS}`);
    }
}

function resetCombo(player) {
    const playerId = player.id;
    const hitCount = comboHits.get(playerId) || 0;

    if (hitCount > 0) {
        comboHits.set(playerId, 0);
        player.onScreenDisplay.setActionBar(`§6 Strength Combo: 0/${STRENGTH_ESSENCE_CONFIG.COMBO.REQUIRED_HITS}`);
    }
}

/**
 * Strength Essence  Ability 1 (Rally of Power): All players within a six (6) block 
 * radius are affected. Enemy players are inflicted with Weakness II for fifteen (15)
 * seconds, while allied players receive Strength II for twenty (20) seconds. This
 * ability is triggered by using the Strength Essence item (right click) and has a
 * cooldown of two (2) minutes and thirty (30) seconds.
 * @param {Player} player - the player casting the ability.
 */
function rallyOfPower(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = rallyOfPowerCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < STRENGTH_ESSENCE_CONFIG.RALLY_OF_POWER.COOLDOWN) {
            return false;
        }

        rallyOfPowerCooldowns.set(player.id, currentTick);

        const playerPos = player.location;
        const radius = STRENGTH_ESSENCE_CONFIG.RALLY_OF_POWER.RADIUS;

        player.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.RALLY_OF_POWER_ACTIVATED);
        player.dimension.playSound(STRENGTH_ESSENCE_CONFIG.SOUNDS.RALLY_OF_POWER_ACTIVATED, player.location);

        const nearbyPlayers = player.dimension.getPlayers({
            location: playerPos,
            maxDistance: radius
        });

        const trusted = getTrustedPlayers(player);

        system.run(() => {
            nearbyPlayers.forEach(p => {
                if (p.id === player.id) {
                    return;
                }

                if (trusted.has(p.id)) {
                    p.addEffect("strength", STRENGTH_ESSENCE_CONFIG.RALLY_OF_POWER.STRENGTH_DURATION, {
                        amplifier: STRENGTH_ESSENCE_CONFIG.RALLY_OF_POWER.STRENGTH_AMPLIFIER,
                        showParticles: true
                    });
                    p.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.RALLY_OF_POWER_ALLY_AFFECTED.replace("{player}", player.name));

                    for (let i = 0; i < 40; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const distance = Math.random() * 0.5;
                        const height = Math.random() * 2;
                        p.dimension.spawnParticle("minecraft:villager_happy", {
                            x: p.location.x + distance * Math.cos(angle),
                            y: p.location.y + height,
                            z: p.location.z + distance * Math.sin(angle)
                        });
                    }
                } else {
                    p.addEffect("weakness", STRENGTH_ESSENCE_CONFIG.RALLY_OF_POWER.WEAKNESS_DURATION, {
                        amplifier: STRENGTH_ESSENCE_CONFIG.RALLY_OF_POWER.WEAKNESS_AMPLIFIER,
                        showParticles: true
                    });
                    p.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.RALLY_OF_POWER_ENEMY_AFFECTED.replace("{player}", player.name));

                    for (let i = 0; i < 40; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const distance = Math.random() * 0.5;
                        const height = Math.random() * 2;
                        p.dimension.spawnParticle("minecraft:redstone_ore_dust_particle", {
                            x: p.location.x + distance * Math.cos(angle),
                            y: p.location.y + height,
                            z: p.location.z + distance * Math.sin(angle)
                        });
                    }
                }
            });
        });

        system.runTimeout(() => {
            if (player.isValid) {
                player.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.RALLY_OF_POWER_READY);
                player.playSound(STRENGTH_ESSENCE_CONFIG.SOUNDS.RALLY_OF_POWER_READY);
            }
        }, STRENGTH_ESSENCE_CONFIG.RALLY_OF_POWER.COOLDOWN);

        return true;
    });
}

/**
 * Strength Essence Ability 2 (Titanic Slam): The user gains Strength II and 
 * Speed II for one (1) minute and immediately smashes the ground, dealing four
 * (4) hearts of damage to enemies within a three (3) block radius. This ability
 * is triggered by using the Strength Essence item (right click) while sneaking
 * and has a cooldown of one (1) minute and thirty (30) seconds.
 * @param {Player} player - the player casting the ability.
 */
function titanicSlam(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = titanicSlamCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < STRENGTH_ESSENCE_CONFIG.TITANIC_SLAM.COOLDOWN) {
            return false;
        }

        titanicSlamCooldowns.set(player.id, currentTick);

        player.addEffect("strength", STRENGTH_ESSENCE_CONFIG.TITANIC_SLAM.STRENGTH_DURATION, {
            amplifier: STRENGTH_ESSENCE_CONFIG.TITANIC_SLAM.STRENGTH_AMPLIFIER,
            showParticles: true
        });

        player.addEffect("speed", STRENGTH_ESSENCE_CONFIG.TITANIC_SLAM.SPEED_DURATION, {
            amplifier: STRENGTH_ESSENCE_CONFIG.TITANIC_SLAM.SPEED_AMPLIFIER,
            showParticles: true
        });

        player.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.TITANIC_SLAM_ACTIVATED);
        player.dimension.playSound(STRENGTH_ESSENCE_CONFIG.SOUNDS.TITANIC_SLAM_ACTIVATED, player.location);
        player.dimension.playSound(STRENGTH_ESSENCE_CONFIG.SOUNDS.TITANIC_SLAM_ACTIVATED_2, player.location);

        const playerPos = player.location;
        const radius = STRENGTH_ESSENCE_CONFIG.TITANIC_SLAM.RADIUS;

        const centerX = Math.floor(playerPos.x);
        const centerY = Math.floor(playerPos.y - 1);
        const centerZ = Math.floor(playerPos.z);

        player.dimension.spawnParticle("minecraft:lava_particle", {
            x: centerX,
            y: centerY + 1,
            z: centerZ
        });

        player.runCommand(`camerashake add @a[r=10] 0.5 0.30 positional`);

        const nearbyPlayers = player.dimension.getPlayers({
            location: playerPos,
            maxDistance: radius
        });

        const trusted = getTrustedPlayers(player);

        abilityDamageActive.set(player.id, true);

        system.run(() => {
            nearbyPlayers.forEach(p => {
                if (p.id !== player.id && !trusted.has(p.id)) {
                    p.applyDamage(STRENGTH_ESSENCE_CONFIG.TITANIC_SLAM.DAMAGE, {
                        cause: "entityAttack",
                        damagingEntity: player
                    });
                    p.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.TITANIC_SLAM_HIT.replace("{player}", player.name));
                }
            });

            system.runTimeout(() => {
                abilityDamageActive.delete(player.id);
            }, 2);
        });

        for (let x = centerX - radius; x <= centerX + radius; x++) {
            for (let z = centerZ - radius; z <= centerZ + radius; z++) {
                const distanceFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(z - centerZ, 2));

                if (distanceFromCenter <= radius) {
                    const particleChance = distanceFromCenter <= 1.5 ? 1.0 :
                        distanceFromCenter <= 2.5 ? 0.6 : 0.3;

                    if (Math.random() < particleChance) {
                        player.dimension.spawnParticle("minecraft:cauldron_explosion_emitter", {
                            x: x + 0.5,
                            y: centerY + 1,
                            z: z + 0.5
                        });
                    }
                }
            }
        }

        system.runTimeout(() => {
            if (player.isValid) {
                player.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.TITANIC_SLAM_READY);
                player.playSound(STRENGTH_ESSENCE_CONFIG.SOUNDS.TITANIC_SLAM_READY);
            }
        }, STRENGTH_ESSENCE_CONFIG.TITANIC_SLAM.COOLDOWN);

        return true;
    });
}

/**
 * Check if a player's damage should trigger crushing blow
 * @param {Player} player - the player being checked.
 */
function canTriggerCrushingBlow(player) {
    return !abilityDamageActive.get(player.id);
}

/**
 * Strength Essence Ability 3 (Crushing Blow ): Upon striking a player, the target
 *  is marked, inflicted with Slowness II for twenty (20) seconds, and makes your 
 * screen red for a short duration. This ability is triggered by hitting a player 
 * while holding the Strength Essence item and has a cooldown of two (2) minutes.
 * @param {Player} attacker - the player casting the ability.
 * @param {Player} target - the target player.
 */
function crushingBlow(attacker, target) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = crushingBlowCooldowns.get(attacker.id);

        if (lastUse && currentTick - lastUse < STRENGTH_ESSENCE_CONFIG.CRUSHING_BLOW.COOLDOWN) {
            return false;
        }

        crushingBlowCooldowns.set(attacker.id, currentTick);

        target.addEffect("slowness", STRENGTH_ESSENCE_CONFIG.CRUSHING_BLOW.SLOWNESS_DURATION, {
            amplifier: STRENGTH_ESSENCE_CONFIG.CRUSHING_BLOW.SLOWNESS_AMPLIFIER,
            showParticles: true
        });

        target.addEffect("nausea", 100, {
            amplifier: 0,
            showParticles: false
        });

        target.camera.fade({
            fadeColor: { red: 1.0, green: 0.0, blue: 0.0 },
            fadeTime: { fadeInTime: 0.5, holdTime: 0.5, fadeOutTime: 0.5 }
        });

        attacker.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.CRUSHING_BLOW_ACTIVATED.replace("{target}", target.name));

        target.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.CRUSHING_BLOW_AFFLICTED);
        target.dimension.playSound(STRENGTH_ESSENCE_CONFIG.SOUNDS.CRUSHING_BLOW_ACTIVATED, target.location);

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
            if (attacker.isValid) {
                attacker.sendMessage(STRENGTH_ESSENCE_CONFIG.MESSAGES.CRUSHING_BLOW_READY);
                attacker.playSound(STRENGTH_ESSENCE_CONFIG.SOUNDS.CRUSHING_BLOW_READY);
            }
        }, STRENGTH_ESSENCE_CONFIG.CRUSHING_BLOW.COOLDOWN);

        return true;
    });
}

export { applyComboOnHit, canTriggerCrushingBlow, crushingBlow, getStrengthCooldownStatus, hasStrengthEssence, rallyOfPower, resetCombo, titanicSlam };

