import { system } from "@minecraft/server";
import { GLOBALCONFIG } from "./config.js";

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

function getCooldownStatus(player) {
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

function enraged(player) {
    const currentTick = system.currentTick;
    const lastUse = cooldowns.get(player.id);

    if (lastUse && currentTick - lastUse < COOLDOWN_TIME) {
        const remaining = Math.ceil((COOLDOWN_TIME - (currentTick - lastUse)) / 20);
        player.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_ENRAGED_ABILITY_IS_ON_COOLDOWN.replace("{remaining}", remaining));
        return;
    }

    cooldowns.set(player.id, currentTick);
    const playerPos = player.location;
    const radius = 6;

    const playersToNotify = player.dimension.getPlayers({
        location: playerPos,
        maxDistance: GLOBALCONFIG.HOW_FAR_OTHER_PLAYERS_CAN_SEE_ABILITY_MESSAGES
    });

    const trusted = getTrustedPlayers(player);

    playersToNotify.forEach(p => {
        if (p.id === player.id) {
            return;
        }

        if (trusted.has(p.id)) {
            p.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_TRUSTED_PLAYER_USES_ENRAGED_ABILITY.replace("{player}", player.name));
        } else {
            p.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_ANOTHER_PLAYER_USES_ENRAGED_ABILITY.replace("{player}", player.name));
        }
    });

    player.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_PLAYER_USES_ENRAGED_ABILITY);

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

function almightySpeech(attacker, victim) {
    const currentTick = system.currentTick;
    const lastUse = leftClickCooldowns.get(attacker.id);

    if (lastUse && currentTick - lastUse < LEFT_CLICK_COOLDOWN) {
        const remaining = Math.ceil((LEFT_CLICK_COOLDOWN - (currentTick - lastUse)) / 20);
        attacker.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_ALMIGHTY_SPEECH_ABILITY_IS_ON_COOLDOWN.replace("{remaining}", remaining));
        return;
    }

    leftClickCooldowns.set(attacker.id, currentTick);

    const attackerPos = attacker.location;
    const playersToNotify = attacker.dimension.getPlayers({
        location: attackerPos,
        maxDistance: GLOBALCONFIG.HOW_FAR_OTHER_PLAYERS_CAN_SEE_ABILITY_MESSAGES
    });

    playersToNotify.forEach(p => {
        if (p.id !== attacker.id) {
            p.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_ANOTHER_PLAYER_USES_ALMIGHTY_SPEECH_ABILITY.replace("{player}", attacker.name));
        }
    });

    attacker.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_PLAYER_USES_ALMIGHTY_SPEECH_ABILITY);

    victim.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_ALMIGHTY_SPEECH_ABILITY_IS_USED_ON_PLAYER);

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

const activeJudgments = new Map();

function divineJudgment(player) {
    const currentTick = system.currentTick;
    const lastUse = sneakCooldowns.get(player.id);

    if (lastUse && currentTick - lastUse < SNEAK_COOLDOWN) {
        const remaining = Math.ceil((SNEAK_COOLDOWN - (currentTick - lastUse)) / 20);
        player.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_DIVINE_JUDGMENT_ABILITY_IS_ON_COOLDOWN.replace("{remaining}", remaining));
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
        maxDistance: GLOBALCONFIG.HOW_FAR_OTHER_PLAYERS_CAN_SEE_ABILITY_MESSAGES
    });

    const trusted = getTrustedPlayers(player);

    playersToNotify.forEach(p => {
        if (p.id === player.id) {
            return;
        }

        if (trusted.has(p.id)) {
            p.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_TRUSTED_PLAYER_USES_DIVINE_JUDGMENT.replace("{player}", player.name));
        } else {
            p.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_ANOTHER_PLAYER_USES_DIVINE_JUDGMENT_ABILITY.replace("{player}", player.name));
        }
    });

    player.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_PLAYER_USES_DIVINE_JUDGMENT_ABILITY);

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
                p.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_DIVINE_JUDGMENT_AFFECTS_PLAYER.replace("{player}", player.name));
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

function addTrustedPlayer(player, trustedId) {
    const trusted = getTrustedPlayers(player);
    trusted.add(trustedId);
    const trustedArray = Array.from(trusted);
    player.setDynamicProperty("trustedPlayers", JSON.stringify(trustedArray));
}

function removeTrustedPlayer(player, trustedId) {
    const trusted = getTrustedPlayers(player);
    trusted.delete(trustedId);
    const trustedArray = Array.from(trusted);
    player.setDynamicProperty("trustedPlayers", JSON.stringify(trustedArray));
}

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

const lowHealthCooldowns = new Map();
const LOW_HEALTH_COOLDOWN = 300;
const LOW_HEALTH_THRESHOLD = 6;

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
        player.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_PLAYER_HEALTH_DROPS_BELOW_SIX);

        lowHealthCooldowns.set(player.id, currentTick);
        player.addEffect("strength", 60, {
            amplifier: 3,
            showParticles: true
        });
    }
}

function cleanupPlayerAbilities(player) {
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

export {
    addTrustedPlayer, almightySpeech, checkLowHealth, cleanupPlayerAbilities, divineJudgment, enraged, getCooldownStatus, onJudgmentKill, getTrustedPlayers, hasRevengeEssence, removeTrustedPlayer
};