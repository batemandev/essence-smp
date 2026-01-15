import { Player, system } from "@minecraft/server";
import { getTrustedPlayers } from "../functions";

const EARTH_ESSENCE_CONFIG = {
    MESSAGES: {
        STONE_CLAMP_ACTIVATED: " §6§lSTONE CLAMP! §r§7Crushing enemies between stone walls!",
        STONE_CLAMP_READY: " §aStone Clamp is ready!",
        STONE_CLAMP_HIT: " §cYou were crushed by {player}'s Stone Clamp!",
        TREMBLE_ACTIVATED: " §c§lTREMBLE! §r§7The earth quakes beneath your foes!",
        TREMBLE_READY: " §aTremble is ready!",
        TREMBLE_HIT: " §cYou're caught in {player}'s Tremble!",
        ROCK_SOLID_ACTIVATED: " §8§lROCK SOLID! §r§7{target} has been encased in stone!",
        ROCK_SOLID_AFFLICTED: " §4You've been encased in solid rock!",
        ROCK_SOLID_READY: " §aRock Solid is ready!"
    },
    SOUNDS: {
        STONE_CLAMP_ACTIVATED: "random.explode",
        STONE_CLAMP_READY: "random.orb",
        TREMBLE_ACTIVATED: "mob.ravager.roar",
        TREMBLE_READY: "random.orb",
        ROCK_SOLID_ACTIVATED: "random.anvil_land",
        ROCK_SOLID_READY: "random.orb"
    },
    STONE_CLAMP: {
        COOLDOWN: 3000,
        RADIUS: 4,
        DAMAGE: 10,
        CLOSE_SPEED: 15,
        WALL_STAY_DURATION: 100
    },
    TREMBLE: {
        COOLDOWN: 1800,
        RADIUS: 5,
        DURATION: 40,
        DAMAGE_PER_TICK: 3,
        TICK_INTERVAL: 1
    },
    ROCK_SOLID: {
        COOLDOWN: 3600,
        DAMAGE: 5,
        STUN_DURATION: 60
    }
};

const stoneClampCooldowns = new Map();
const trembleCooldowns = new Map();
const rockSolidCooldowns = new Map();
const rockSolidActive = new Map();
const trembleIntervals = new Map();
const stoneClampIntervals = new Map();
const abilityDamageActive = new Map();

/**
 * @param {Player} player - the player being checked.
 */
function hasEarthEssence(player) {
    const inventory = player.getComponent("inventory");
    if (!inventory) return false;

    const container = inventory.container;
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item && item.typeId === "metro:earth_essence") {
            return true;
        }
    }
    return false;
}

/**
 * @param {Player} player - the player being checked.
 */
function getEarthCooldownStatus(player) {
    const currentTick = system.currentTick;
    const clampLastUse = stoneClampCooldowns.get(player.id);
    const trembleLastUse = trembleCooldowns.get(player.id);
    const rockLastUse = rockSolidCooldowns.get(player.id);

    let clampStatus;
    if (!clampLastUse || currentTick - clampLastUse >= EARTH_ESSENCE_CONFIG.STONE_CLAMP.COOLDOWN) {
        clampStatus = " §aReady!";
    } else {
        const remaining = Math.ceil((EARTH_ESSENCE_CONFIG.STONE_CLAMP.COOLDOWN - (currentTick - clampLastUse)) / 20);
        clampStatus = ` §c${remaining}s`;
    }

    let trembleStatus;
    if (!trembleLastUse || currentTick - trembleLastUse >= EARTH_ESSENCE_CONFIG.TREMBLE.COOLDOWN) {
        trembleStatus = " §aReady!";
    } else {
        const remaining = Math.ceil((EARTH_ESSENCE_CONFIG.TREMBLE.COOLDOWN - (currentTick - trembleLastUse)) / 20);
        trembleStatus = ` §c${remaining}s`;
    }

    let rockStatus;
    if (!rockLastUse || currentTick - rockLastUse >= EARTH_ESSENCE_CONFIG.ROCK_SOLID.COOLDOWN) {
        rockStatus = " §aReady!";
    } else {
        const remaining = Math.ceil((EARTH_ESSENCE_CONFIG.ROCK_SOLID.COOLDOWN - (currentTick - rockLastUse)) / 20);
        rockStatus = ` §c${remaining}s`;
    }

    return `${clampStatus} ${trembleStatus} ${rockStatus}`;
}

/**
 * Check if a player's damage should trigger rock solid
 * @param {Player} player - the player being checked.
 */
function canTriggerRockSolid(player) {
    return !abilityDamageActive.get(player.id);
}

/**
 * Earth Essence Ability 1 (Stone Clamp): The user summons two stone walls that close,
 * crushing enemies within a 3 block radius and dealing 5 hearts of damage.
 * Cooldown: 2 minutes 30 seconds.
 * @param {Player} player - the player casting the ability.
 */
function stoneClamp(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = stoneClampCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < EARTH_ESSENCE_CONFIG.STONE_CLAMP.COOLDOWN) {
            const remaining = Math.ceil((EARTH_ESSENCE_CONFIG.STONE_CLAMP.COOLDOWN - (currentTick - lastUse)) / 20);
            return false;
        }

        stoneClampCooldowns.set(player.id, currentTick);

        const playerPos = player.location;
        const radius = EARTH_ESSENCE_CONFIG.STONE_CLAMP.RADIUS;

        player.sendMessage(EARTH_ESSENCE_CONFIG.MESSAGES.STONE_CLAMP_ACTIVATED);
        player.playSound(EARTH_ESSENCE_CONFIG.SOUNDS.STONE_CLAMP_ACTIVATED);

        player.dimension.spawnParticle("minecraft:huge_explosion_emitter", playerPos);
        player.runCommand(`camerashake add @a[r=10] 0.4 0.25 positional`);

        const centerX = Math.floor(playerPos.x);
        const centerY = Math.floor(playerPos.y);
        const centerZ = Math.floor(playerPos.z);

        const wallHeight = 4;
        const allWallPositions = [];
        const minRadius = 2;

        for (let currentRadius = radius; currentRadius >= minRadius; currentRadius--) {
            system.runTimeout(() => {
                const wallPositions = [];

                if (currentRadius > 0) {
                    for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
                        const x = Math.floor(centerX + currentRadius * Math.cos(angle));
                        const z = Math.floor(centerZ + currentRadius * Math.sin(angle));

                        for (let y = centerY; y < centerY + wallHeight; y++) {
                            const pos = { x, y, z };
                            const block = player.dimension.getBlock(pos);
                            if (block && block.typeId === "minecraft:air") {
                                block.setType("minecraft:stone");
                                wallPositions.push({ ...pos });
                                allWallPositions.push({ ...pos });
                            }
                        }
                    }

                    if (allWallPositions.length > wallPositions.length) {
                        const oldPositions = allWallPositions.slice(0, -wallPositions.length);
                        oldPositions.forEach(pos => {
                            const block = player.dimension.getBlock(pos);
                            if (block && block.typeId === "minecraft:stone") {
                                block.setType("minecraft:air");
                            }
                        });
                    }

                    player.runCommand(`camerashake add @a[r=${radius + 5}] 0.2 0.1 positional`);
                }

                if (currentRadius === minRadius) {
                    const nearbyPlayers = player.dimension.getPlayers({
                        location: playerPos,
                        maxDistance: radius
                    });

                    const trusted = getTrustedPlayers(player);

                    abilityDamageActive.set(player.id, true);

                    nearbyPlayers.forEach(p => {
                        if (p.id !== player.id && !trusted.has(p.id)) {
                            p.applyDamage(EARTH_ESSENCE_CONFIG.STONE_CLAMP.DAMAGE, {
                                cause: "entityAttack",
                                damagingEntity: player
                            });
                            p.sendMessage(EARTH_ESSENCE_CONFIG.MESSAGES.STONE_CLAMP_HIT.replace("{player}", player.name));
                        }
                    });

                    system.runTimeout(() => {
                        abilityDamageActive.delete(player.id);
                    }, 2);

                    system.runTimeout(() => {
                        allWallPositions.forEach(pos => {
                            player.dimension.getBlock(pos)?.setType("minecraft:air");
                        });
                        stoneClampIntervals.delete(player.id);
                    }, EARTH_ESSENCE_CONFIG.STONE_CLAMP.WALL_STAY_DURATION);
                }
            }, (radius - currentRadius) * EARTH_ESSENCE_CONFIG.STONE_CLAMP.CLOSE_SPEED);
        }

        system.runTimeout(() => {
            if (player.isValid) {
                player.sendMessage(EARTH_ESSENCE_CONFIG.MESSAGES.STONE_CLAMP_READY);
                player.playSound(EARTH_ESSENCE_CONFIG.SOUNDS.STONE_CLAMP_READY);
            }
        }, EARTH_ESSENCE_CONFIG.STONE_CLAMP.COOLDOWN);

        return true;
    });
}

/**
 * Earth Essence Ability 2 (Tremble): The ground shakes within a 4 block radius,
 * causing screen shake and dealing 1.5 hearts of damage per tick for 2 seconds.
 * Cooldown: 1 minute 30 seconds.
 * @param {Player} player - the player casting the ability.
 */
function tremble(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = trembleCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < EARTH_ESSENCE_CONFIG.TREMBLE.COOLDOWN) {
            return false;
        }

        trembleCooldowns.set(player.id, currentTick);

        const playerPos = player.location;
        const radius = EARTH_ESSENCE_CONFIG.TREMBLE.RADIUS;

        player.sendMessage(EARTH_ESSENCE_CONFIG.MESSAGES.TREMBLE_ACTIVATED);
        player.playSound(EARTH_ESSENCE_CONFIG.SOUNDS.TREMBLE_ACTIVATED);

        const trusted = getTrustedPlayers(player);
        let tickCount = 0;

        abilityDamageActive.set(player.id, true);

        const trembleInterval = system.runInterval(() => {
            if (tickCount >= EARTH_ESSENCE_CONFIG.TREMBLE.DURATION) {
                system.clearRun(trembleInterval);
                trembleIntervals.delete(player.id);
                abilityDamageActive.delete(player.id);
                return;
            }

            const nearbyPlayers = player.dimension.getPlayers({
                location: playerPos,
                maxDistance: radius
            });

            nearbyPlayers.forEach(p => {
                if (p.id !== player.id && !trusted.has(p.id)) {
                    p.applyDamage(EARTH_ESSENCE_CONFIG.TREMBLE.DAMAGE_PER_TICK, {
                        cause: "entityAttack",
                        damagingEntity: player
                    });

                    if (tickCount === 0) {
                        p.sendMessage(EARTH_ESSENCE_CONFIG.MESSAGES.TREMBLE_HIT.replace("{player}", player.name));
                    }
                }
            });

            player.runCommand(`camerashake add @a[r=${radius}] 0.3 0.1 positional`);

            const centerX = Math.floor(playerPos.x);
            const centerY = Math.floor(playerPos.y);
            const centerZ = Math.floor(playerPos.z);

            for (let i = 0; i < 5; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * radius;
                const x = centerX + distance * Math.cos(angle);
                const z = centerZ + distance * Math.sin(angle);

                player.dimension.spawnParticle("minecraft:lava_particle", {
                    x: x,
                    y: centerY,
                    z: z
                });
            }

            tickCount++;
        }, EARTH_ESSENCE_CONFIG.TREMBLE.TICK_INTERVAL);

        trembleIntervals.set(player.id, trembleInterval);

        system.runTimeout(() => {
            if (player.isValid) {
                player.sendMessage(EARTH_ESSENCE_CONFIG.MESSAGES.TREMBLE_READY);
                player.playSound(EARTH_ESSENCE_CONFIG.SOUNDS.TREMBLE_READY);
            }
        }, EARTH_ESSENCE_CONFIG.TREMBLE.COOLDOWN);

        return true;
    });
}

/**
 * Earth Essence Ability 3 (Rock Solid): Upon striking a player, the target is
 * encased in solid rock, dealing 2.5 hearts of damage and stunning them for 3 seconds.
 * Cooldown: 3 minutes.
 * @param {Player} attacker - the player casting the ability.
 * @param {Player} target - the player target.
 */
function rockSolid(attacker, target) {
    const currentTick = system.currentTick;
    const lastUse = rockSolidCooldowns.get(attacker.id);

    if (lastUse && currentTick - lastUse < EARTH_ESSENCE_CONFIG.ROCK_SOLID.COOLDOWN) {
        return false;
    }

    rockSolidCooldowns.set(attacker.id, currentTick);

    target.applyDamage(EARTH_ESSENCE_CONFIG.ROCK_SOLID.DAMAGE, {
        cause: "entityAttack",
        damagingEntity: attacker
    });

    target.addEffect("slowness", EARTH_ESSENCE_CONFIG.ROCK_SOLID.STUN_DURATION, {
        amplifier: 255,
        showParticles: true
    });

    target.addEffect("mining_fatigue", EARTH_ESSENCE_CONFIG.ROCK_SOLID.STUN_DURATION, {
        amplifier: 255,
        showParticles: true
    });

    rockSolidActive.set(target.id, currentTick);

    attacker.sendMessage(EARTH_ESSENCE_CONFIG.MESSAGES.ROCK_SOLID_ACTIVATED.replace("{target}", target.name));
    attacker.playSound(EARTH_ESSENCE_CONFIG.SOUNDS.ROCK_SOLID_ACTIVATED);

    target.sendMessage(EARTH_ESSENCE_CONFIG.MESSAGES.ROCK_SOLID_AFFLICTED);
    target.playSound(EARTH_ESSENCE_CONFIG.SOUNDS.ROCK_SOLID_ACTIVATED);

    const stonePositions = [];

    for (let i = 0; i < 15; i++) {
        system.runTimeout(() => {
            if (target.isValid) {
                target.clearVelocity();
            }
        }, i);
    }

    const targetPos = target.location;
    const centerX = Math.floor(targetPos.x);
    const centerY = Math.floor(targetPos.y);
    const centerZ = Math.floor(targetPos.z);

    for (let y = centerY; y <= centerY + 2; y++) {
        system.runTimeout(() => {
            if (!target.isValid) return;

            for (let x = centerX - 1; x <= centerX + 1; x++) {
                for (let z = centerZ - 1; z <= centerZ + 1; z++) {
                    if (x === centerX && y === centerY && z === centerZ) continue;
                    if (x === centerX && y === centerY + 1 && z === centerZ) continue;

                    const pos = { x, y, z };
                    const block = target.dimension.getBlock(pos);
                    if (block && block.typeId === "minecraft:air") {
                        block.setType("minecraft:stone");
                        stonePositions.push({ ...pos });
                    }
                }
            }
        }, (y - centerY) * 3);
    }

    for (let i = 0; i < 60; i++) {
        system.runTimeout(() => {
            if (target.isValid) {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * 0.8;
                const height = Math.random() * 2;
                target.dimension.spawnParticle("minecraft:lava_particle", {
                    x: target.location.x + distance * Math.cos(angle),
                    y: target.location.y + height,
                    z: target.location.z + distance * Math.sin(angle)
                });
            }
        }, i);
    }

    system.runTimeout(() => {
        rockSolidActive.delete(target.id);
        
        stonePositions.forEach(pos => {
            const block = target.dimension.getBlock(pos);
            if (block && block.typeId === "minecraft:stone") {
                block.setType("minecraft:air");
            }
        });
    }, EARTH_ESSENCE_CONFIG.ROCK_SOLID.STUN_DURATION);

    system.runTimeout(() => {
        if (attacker.isValid) {
            attacker.sendMessage(EARTH_ESSENCE_CONFIG.MESSAGES.ROCK_SOLID_READY);
            attacker.playSound(EARTH_ESSENCE_CONFIG.SOUNDS.ROCK_SOLID_READY);
        }
    }, EARTH_ESSENCE_CONFIG.ROCK_SOLID.COOLDOWN);

    return true;
}

/**
 * @param {Player} player - the player.
 */
function cleanupEarthEssenceAbilities(player) {
    rockSolidActive.delete(player.id);
    abilityDamageActive.delete(player.id);

    const trembleInterval = trembleIntervals.get(player.id);
    if (trembleInterval) {
        system.clearRun(trembleInterval);
        trembleIntervals.delete(player.id);
    }

    const clampInterval = stoneClampIntervals.get(player.id);
    if (clampInterval) {
        system.clearRun(clampInterval);
        stoneClampIntervals.delete(player.id);
    }
}

export { canTriggerRockSolid, cleanupEarthEssenceAbilities, getEarthCooldownStatus, hasEarthEssence, rockSolid, stoneClamp, tremble };
