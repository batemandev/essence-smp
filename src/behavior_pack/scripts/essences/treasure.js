import { ItemStack, Player, Potions, system } from "@minecraft/server";
import { getTrustedPlayers } from "../functions";

const TREASURE_ESSENCE_CONFIG = {
    MESSAGES: {
        FORTUNES_RECKONING_ACTIVATED: " §dA random effect has been applied to you!",
        FORTUNES_RECKONING_READY: " §aFortune's Reckoning is ready!",
        FORTUNES_RECKONING_ALLY_AFFECTED: " §a{player} purified you with Fortune's Reckoning!",
        FORTUNES_RECKONING_ENEMY_AFFECTED: " §c{player} cursed you with Fortune's Reckoning!",
        GILDED_SANCTUARY_ACTIVATED: " §6§lGILDED SANCTUARY! §r§7Golden protection rises!",
        GILDED_SANCTUARY_READY: " §aGilded Sanctuary is ready!",
        GILDED_SANCTUARY_RECEIVED: " §a{player}'s Gilded Sanctuary blessed you with Regeneration IV!",
        CURSE_OF_AVARICE_ACTIVATED: " §5§lCURSE OF AVARICE! §r§7{target} suffers all curses!",
        CURSE_OF_AVARICE_AFFLICTED: " §4§lYou've been cursed with Avarice! §r§cAll negative effects applied!",
        CURSE_OF_AVARICE_READY: " §aCurse of Avarice is ready!",
        RANDOM_EFFECT_APPLIED: " §dA random effect has been applied to you!",
        EMERALD_REWARD_BREEZE_RODS: " §aYou found §e10 Breeze Rods§a!",
        EMERALD_REWARD_GOLDEN_APPLES: " §aYou found §e5 Golden Apples§a!",
        EMERALD_REWARD_ENCHANTED_APPLE: " §6You found an §dEnchanted Golden Apple§6!",
        EMERALD_REWARD_VILLAGER_EGG: " §aYou found a §eVillager Spawn Egg§a!",
        EMERALD_REWARD_WEAKNESS_POTIONS: " §aYou found §eWeakness Splash Potion§a!"
    },
    SOUNDS: {
        FORTUNES_RECKONING_ACTIVATED: "beacon.power",
        FORTUNES_RECKONING_READY: "random.orb",
        GILDED_SANCTUARY_ACTIVATED: "beacon.activate",
        GILDED_SANCTUARY_READY: "random.orb",
        CURSE_OF_AVARICE_ACTIVATED: "beacon.deactivate",
        CURSE_OF_AVARICE_READY: "random.orb",
        EMERALD_REWARD: "random.orb"
    },
    FORTUNES_RECKONING: {
        COOLDOWN: 3000,
        RADIUS: 20
    },
    GILDED_SANCTUARY: {
        COOLDOWN: 2400,
        RADIUS: 6,
        REGENERATION_DURATION: 400,
        REGENERATION_AMPLIFIER: 3
    },
    CURSE_OF_AVARICE: {
        COOLDOWN: 3600,
        EFFECT_DURATION: 500
    },
    RANDOM_EFFECT: {
        INTERVAL: 30000,
        DURATION: 1200
    },
    EMERALD_MINING: {
        BREEZE_RODS: { chance: 50, amount: 10, item: "minecraft:breeze_rod" },
        GOLDEN_APPLES: { chance: 45, amount: 5, item: "minecraft:golden_apple" },
        ENCHANTED_APPLE: { chance: 150, amount: 1, item: "minecraft:enchanted_golden_apple" },
        VILLAGER_EGG: { chance: 100, amount: 1, item: "minecraft:villager_spawn_egg" }
    }
};

const fortunesReckoningCooldowns = new Map();
const gildedSanctuaryCooldowns = new Map();
const curseOfAvariceCooldowns = new Map();
const sanctuaryIntervals = new Map();
const randomEffectTimers = new Map();

const BENEFICIAL_EFFECTS = [
    { type: "speed", amplifier: 1 },
    { type: "strength", amplifier: 1 },
    { type: "regeneration", amplifier: 1 },
    { type: "resistance", amplifier: 1 },
    { type: "fire_resistance", amplifier: 1 },
    { type: "absorption", amplifier: 1 },
    { type: "health_boost", amplifier: 1 },
    { type: "jump_boost", amplifier: 1 }
];

const HARMFUL_EFFECTS = [
    { type: "slowness", amplifier: 1 },
    { type: "weakness", amplifier: 1 },
    { type: "poison", amplifier: 1 },
    { type: "wither", amplifier: 1 },
    { type: "mining_fatigue", amplifier: 1 },
    { type: "nausea", amplifier: 1 },
    { type: "blindness", amplifier: 1 },
    { type: "hunger", amplifier: 1 }
];

const ALL_NEGATIVE_EFFECTS = [
    "slowness", "weakness", "poison", "wither", "mining_fatigue",
    "nausea", "blindness", "hunger", "darkness", "fatal_poison"
];

/**
 * @param {Player} player - the player being checked.
 */
function hasTreasureEssence(player) {
    const inventory = player.getComponent("inventory");
    if (!inventory) return false;

    const container = inventory.container;
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item && item.typeId === "metro:treasure_essence") {
            return true;
        }
    }
    return false;
}

/**
 * @param {Player} player - the player being checked.
 */
function getTreasureCooldownStatus(player) {
    const currentTick = system.currentTick;
    const fortunesLastUse = fortunesReckoningCooldowns.get(player.id);
    const sanctuaryLastUse = gildedSanctuaryCooldowns.get(player.id);
    const curseLastUse = curseOfAvariceCooldowns.get(player.id);

    let fortunesStatus;
    if (!fortunesLastUse || currentTick - fortunesLastUse >= TREASURE_ESSENCE_CONFIG.FORTUNES_RECKONING.COOLDOWN) {
        fortunesStatus = " §aReady!";
    } else {
        const remaining = Math.ceil((TREASURE_ESSENCE_CONFIG.FORTUNES_RECKONING.COOLDOWN - (currentTick - fortunesLastUse)) / 20);
        fortunesStatus = ` §c${remaining}s`;
    }

    let sanctuaryStatus;
    if (!sanctuaryLastUse || currentTick - sanctuaryLastUse >= TREASURE_ESSENCE_CONFIG.GILDED_SANCTUARY.COOLDOWN) {
        sanctuaryStatus = " §aReady!";
    } else {
        const remaining = Math.ceil((TREASURE_ESSENCE_CONFIG.GILDED_SANCTUARY.COOLDOWN - (currentTick - sanctuaryLastUse)) / 20);
        sanctuaryStatus = ` §c${remaining}s`;
    }

    let curseStatus;
    if (!curseLastUse || currentTick - curseLastUse >= TREASURE_ESSENCE_CONFIG.CURSE_OF_AVARICE.COOLDOWN) {
        curseStatus = " §aReady!";
    } else {
        const remaining = Math.ceil((TREASURE_ESSENCE_CONFIG.CURSE_OF_AVARICE.COOLDOWN - (currentTick - curseLastUse)) / 20);
        curseStatus = ` §c${remaining}s`;
    }

    return `${fortunesStatus} ${sanctuaryStatus} ${curseStatus}`;
}

/**
 * Treasure Essence Ability 1 (Fortune’s Reckoning): All allied players within a twenty (20) block
 *  radius have all negative status effects removed. At the same time, enemy players within the same
 *  radius have all positive status effects removed and replaced with random negative effects. This 
 * ability is triggered by using the Treasure Essence item (right click) and has a cooldown of two (2) 
 * minutes and thirty (30) seconds.
 * 
 * @param {Player} player - the player casting this ability.
 */
function fortunesReckoning(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = fortunesReckoningCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < TREASURE_ESSENCE_CONFIG.FORTUNES_RECKONING.COOLDOWN) {
            return false;
        }

        fortunesReckoningCooldowns.set(player.id, currentTick);

        const playerPos = player.location;
        const radius = TREASURE_ESSENCE_CONFIG.FORTUNES_RECKONING.RADIUS;

        player.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.FORTUNES_RECKONING_ACTIVATED);
        player.dimension.playSound(TREASURE_ESSENCE_CONFIG.SOUNDS.FORTUNES_RECKONING_ACTIVATED, player.location);

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
                    const effects = p.getEffects();
                    effects.forEach(effect => {
                        if (ALL_NEGATIVE_EFFECTS.includes(effect.typeId)) {
                            p.removeEffect(effect.typeId);
                        }
                    });
                    p.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.FORTUNES_RECKONING_ALLY_AFFECTED.replace("{player}", player.name));

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
                    const effects = p.getEffects();
                    effects.forEach(effect => {
                        if (BENEFICIAL_EFFECTS.some(e => e.type === effect.typeId)) {
                            p.removeEffect(effect.typeId);
                        }
                    });

                    const numEffects = Math.floor(Math.random() * 2) + 2;
                    const shuffled = [...HARMFUL_EFFECTS].sort(() => Math.random() - 0.5);
                    for (let i = 0; i < numEffects; i++) {
                        const effect = shuffled[i];
                        p.addEffect(effect.type, 400, {
                            amplifier: effect.amplifier,
                            showParticles: true
                        });
                    }

                    p.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.FORTUNES_RECKONING_ENEMY_AFFECTED.replace("{player}", player.name));

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
                player.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.FORTUNES_RECKONING_READY);
                player.playSound(TREASURE_ESSENCE_CONFIG.SOUNDS.FORTUNES_RECKONING_READY);
            }
        }, TREASURE_ESSENCE_CONFIG.FORTUNES_RECKONING.COOLDOWN);

        return true;
    });
}

/**
 * Ability 2 (Gilded Sanctuary): The user summons a golden ring around themselves, 
 * granting Regeneration IV to all allied players within the ring for twenty (20) 
 * seconds. This ability is triggered by using the Treasure Essence item (right click) 
 * while sneaking and has a cooldown of two (2) minutes.
 * @param {Player} player - the player that is summoning the golden ring.
 */
function gildedSanctuary(player) {
    system.run(() => {
        const currentTick = system.currentTick;
        const lastUse = gildedSanctuaryCooldowns.get(player.id);

        if (lastUse && currentTick - lastUse < TREASURE_ESSENCE_CONFIG.GILDED_SANCTUARY.COOLDOWN) {
            return false;
        }

        gildedSanctuaryCooldowns.set(player.id, currentTick);

        const sanctuaryCenter = { ...player.location };
        const radius = TREASURE_ESSENCE_CONFIG.GILDED_SANCTUARY.RADIUS;

        player.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.GILDED_SANCTUARY_ACTIVATED);
        player.dimension.playSound(TREASURE_ESSENCE_CONFIG.SOUNDS.GILDED_SANCTUARY_ACTIVATED, player.location);

        const trusted = getTrustedPlayers(player);
        const alreadyNotified = new Set();

        const effectInterval = system.runInterval(() => {
            const nearbyPlayers = player.dimension.getPlayers({
                location: sanctuaryCenter,
                maxDistance: radius
            });

            nearbyPlayers.forEach(p => {
                if (p.id === player.id || trusted.has(p.id)) {
                    p.addEffect("minecraft:regeneration", TREASURE_ESSENCE_CONFIG.GILDED_SANCTUARY.REGENERATION_DURATION, {
                        amplifier: TREASURE_ESSENCE_CONFIG.GILDED_SANCTUARY.REGENERATION_AMPLIFIER,
                        showParticles: true
                    });

                    if (p.id !== player.id && !alreadyNotified.has(p.id)) {
                        p.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.GILDED_SANCTUARY_RECEIVED.replace("{player}", player.name));
                        alreadyNotified.add(p.id);
                    }
                }
            });
        }, 20);

        let angle = 0;
        const particleInterval = system.runInterval(() => {
            for (let i = 0; i < 32; i++) {
                const particleAngle = angle + (i * Math.PI * 2 / 32);
                const x = sanctuaryCenter.x + radius * Math.cos(particleAngle);
                const z = sanctuaryCenter.z + radius * Math.sin(particleAngle);
                player.dimension.spawnParticle("minecraft:basic_flame_particle", {
                    x: x,
                    y: sanctuaryCenter.y + 1,
                    z: z
                });
            }
            angle += 0.15;
        }, 1);

        system.runTimeout(() => {
            system.clearRun(particleInterval);
            system.clearRun(effectInterval);
            sanctuaryIntervals.delete(player.id);
        }, TREASURE_ESSENCE_CONFIG.GILDED_SANCTUARY.REGENERATION_DURATION);

        system.runTimeout(() => {
            if (player.isValid) {
                player.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.GILDED_SANCTUARY_READY);
                player.playSound(TREASURE_ESSENCE_CONFIG.SOUNDS.GILDED_SANCTUARY_READY);
            }
        }, TREASURE_ESSENCE_CONFIG.GILDED_SANCTUARY.COOLDOWN);

        sanctuaryIntervals.set(player.id, { particleInterval, effectInterval });
        return true;
    });
}

/**
 * Treasure Essence Ability 3 (Curse of Avarice): Upon striking a player, the target is afflicted
 * with every negative status effect for twenty-five (25) seconds. This ability is triggered by 
 * hitting a player while holding the Treasure Essence item and has a cooldown of three (3) minutes.
 * @param {Player} attacker - the player attacking the target.
 * @param {Player} target - the player target being attacked.
 */
function curseOfAvarice(attacker, target) {
    const currentTick = system.currentTick;
    const lastUse = curseOfAvariceCooldowns.get(attacker.id);

    if (lastUse && currentTick - lastUse < TREASURE_ESSENCE_CONFIG.CURSE_OF_AVARICE.COOLDOWN) {
        return false;
    }

    curseOfAvariceCooldowns.set(attacker.id, currentTick);

    ALL_NEGATIVE_EFFECTS.forEach(effectType => {
        try {
            target.addEffect(effectType, TREASURE_ESSENCE_CONFIG.CURSE_OF_AVARICE.EFFECT_DURATION, {
                amplifier: 0,
                showParticles: true
            });
        } catch (e) {
        }
    });

    attacker.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.CURSE_OF_AVARICE_ACTIVATED.replace("{target}", target.name));
    target.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.CURSE_OF_AVARICE_AFFLICTED);
    target.dimension.playSound(TREASURE_ESSENCE_CONFIG.SOUNDS.CURSE_OF_AVARICE_ACTIVATED, target.location);

    for (let i = 0; i < 50; i++) {
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
            attacker.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.CURSE_OF_AVARICE_READY);
            attacker.playSound(TREASURE_ESSENCE_CONFIG.SOUNDS.CURSE_OF_AVARICE_READY);
        }
    }, TREASURE_ESSENCE_CONFIG.CURSE_OF_AVARICE.COOLDOWN);

    return true;
}

/**
 * @param {Player} player - the user receiving the random effect.
 */
function applyRandomEffect(player) {
    const allEffects = [...BENEFICIAL_EFFECTS, ...HARMFUL_EFFECTS];
    const randomEffect = allEffects[Math.floor(Math.random() * allEffects.length)];

    player.addEffect(randomEffect.type, TREASURE_ESSENCE_CONFIG.RANDOM_EFFECT.DURATION, {
        amplifier: randomEffect.amplifier,
        showParticles: true
    });

    player.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.RANDOM_EFFECT_APPLIED);
}

/**
 *  Treasure Essence Passive 2 : Every twenty five (25) minutes, 
 * the player is granted a random Tier II status effect, which 
 * may be beneficial or harmful.
 * @param {Player} player - the user receiving the random effect.
 */
function startRandomEffectTimer(player) {
    if (randomEffectTimers.has(player.id)) {
        return;
    }

    const timer = system.runInterval(() => {
        if (!player.isValid || !hasTreasureEssence(player)) {
            system.clearRun(timer);
            randomEffectTimers.delete(player.id);
            return;
        }

        applyRandomEffect(player);
    }, TREASURE_ESSENCE_CONFIG.RANDOM_EFFECT.INTERVAL);

    randomEffectTimers.set(player.id, timer);
}

/**
 * @param {Player} player - the player object.
 */
function stopRandomEffectTimer(player) {
    const timer = randomEffectTimers.get(player.id);
    if (timer) {
        system.clearRun(timer);
        randomEffectTimers.delete(player.id);
    }
}

/**
 * Treasure Essence Passive 3: Mining Emerald Ore has a chance to grant the player one of the following rewards:    
    - Ten (10) Breeze Rods — 1 in 50 chance
    - Five (5) Golden Apples — 1 in 45 chance
    - One (1) Enchanted Golden Apple — 1 in 150 chance
    - One (1) Villager Spawn Egg — 1 in 100 chance
    - Weakness Splash Potions — 1 in 35 chance
 *
 * @param {Player} player - the player that broke the block.
 * @param {string} blockId - the block's typeId.
 */
function handleEmeraldMining(player, blockId) {
    if (!hasTreasureEssence(player)) {
        return;
    }

    if (blockId !== "minecraft:emerald_ore" && blockId !== "minecraft:deepslate_emerald_ore") {
        return;
    }

    const config = TREASURE_ESSENCE_CONFIG.EMERALD_MINING;

    if (Math.floor(Math.random() * 50) === 0) {
        giveReward(player, config.BREEZE_RODS.item, config.BREEZE_RODS.amount, TREASURE_ESSENCE_CONFIG.MESSAGES.EMERALD_REWARD_BREEZE_RODS);
        return;
    }

    if (Math.floor(Math.random() * 45) === 0) {
        giveReward(player, config.GOLDEN_APPLES.item, config.GOLDEN_APPLES.amount, TREASURE_ESSENCE_CONFIG.MESSAGES.EMERALD_REWARD_GOLDEN_APPLES);
        return;
    }

    if (Math.floor(Math.random() * 35) === 0) {
        player.sendMessage(TREASURE_ESSENCE_CONFIG.MESSAGES.EMERALD_REWARD_WEAKNESS_POTIONS);
        player.playSound(TREASURE_ESSENCE_CONFIG.SOUNDS.EMERALD_REWARD);
        const weaknessPotion = Potions.resolve("minecraft:weakness", "ThrownSplash");
        const container = player.getComponent("inventory").container;
        const remainder = container.addItem(weaknessPotion);

        if (remainder) {
            player.dimension.spawnItem(remainder, player.location);
        }
        return;
    }

    if (Math.floor(Math.random() * 100) === 0) {
        giveReward(player, config.VILLAGER_EGG.item, config.VILLAGER_EGG.amount, TREASURE_ESSENCE_CONFIG.MESSAGES.EMERALD_REWARD_VILLAGER_EGG);
        return;
    }

    if (Math.floor(Math.random() * 150) === 0) {
        giveReward(player, config.ENCHANTED_APPLE.item, config.ENCHANTED_APPLE.amount, TREASURE_ESSENCE_CONFIG.MESSAGES.EMERALD_REWARD_ENCHANTED_APPLE);
        return;
    }
}

/**
 * Helper function to give rewards
 * @param {Player} player - the player receiving the item.
 * @param {string} itemId - the item identifier.
 * @param {number} amount - the item amount.
 * @param {string} message - the message sent to the player.
 */
function giveReward(player, itemId, amount, message) {
    const inventory = player.getComponent("inventory");
    if (inventory) {
        const itemStack = new ItemStack(itemId, amount);

        const container = inventory.container;
        const remainder = container.addItem(itemStack);

        if (remainder) {
            player.dimension.spawnItem(remainder, player.location);
        }
    }

    player.sendMessage(message);
    player.playSound(TREASURE_ESSENCE_CONFIG.SOUNDS.EMERALD_REWARD);
}

/**
 * @param {Player} player - the player object.
 */
function cleanupTreasureEssenceAbilities(player) {
    const intervals = sanctuaryIntervals.get(player.id);
    if (intervals) {
        if (intervals.particleInterval) {
            system.clearRun(intervals.particleInterval);
        }
        if (intervals.effectInterval) {
            system.clearRun(intervals.effectInterval);
        }
        sanctuaryIntervals.delete(player.id);
    }

    stopRandomEffectTimer(player);
}

export { cleanupTreasureEssenceAbilities, curseOfAvarice, fortunesReckoning, getTreasureCooldownStatus, gildedSanctuary, handleEmeraldMining, hasTreasureEssence, startRandomEffectTimer, stopRandomEffectTimer };

