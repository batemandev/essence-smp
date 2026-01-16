import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { GLOBALCONFIG } from "./config";
import { canConsumeGoldenAppleAgility, canTriggerCripplingBlow, checkGroundImpactLanding, cleanupAgilityEssenceAbilities, cripplingBlow, getAgilityCooldownStatus, getCurrentSpeedLevel, groundImpact, hasAgilityEssence, lightningRush, resetDistanceTracking, updateDistanceTracking } from "./essences/agility";
import { canTriggerRockSolid, cleanupEarthEssenceAbilities, getEarthCooldownStatus, hasEarthEssence, rockSolid, stoneClamp, tremble } from "./essences/earth";
import { canConsumeGoldenApple, circleOfVitality, cleanupHealerEssenceAbilities, getHealerCooldownStatus, hasHealerEssence, onGoldenAppleConsume, purgeWard, touchOfGrace } from "./essences/healer";
import { almightySpeech, checkLowHealth, cleanupPlayerRevengeAbilities, divineJudgment, enraged, getRevengeCooldownStatus, hasRevengeEssence, onJudgmentKill } from "./essences/revenge";
import { applyComboOnHit, canTriggerCrushingBlow, crushingBlow, getStrengthCooldownStatus, hasStrengthEssence, rallyOfPower, titanicSlam } from "./essences/strength";
import { cleanupTreasureEssenceAbilities, curseOfAvarice, fortunesReckoning, getTreasureCooldownStatus, gildedSanctuary, handleEmeraldMining, hasTreasureEssence, startRandomEffectTimer, stopRandomEffectTimer } from "./essences/treasure";
import { applyWitherOnHit, cleanupWitherEssenceAbilities, corruptionCloud, fireWitherSkullBarrage, getWitherCooldownStatus, hasWitherEssence, witherStrike } from "./essences/wither";
import { addTrustedPlayer, removeTrustedPlayer, getTrustedPlayers } from "./functions";
import "./rerollBox";

const actionBarIntervals = new Map();

system.runInterval(() => {
    const players = world.getAllPlayers();

    players.forEach(player => {
        /*
        Agility Essence Passive 1 : The player is permanently granted Speed II and Haste I as long as the Agility Essence item remains in their inventory.
        */
        if (hasAgilityEssence(player)) {
            const speedLevel = getCurrentSpeedLevel(player);
            player.addEffect("speed", 41, {
                amplifier: speedLevel,
                showParticles: true
            });
            player.addEffect("haste", 41, {
                amplifier: 0,
                showParticles: true
            });
            updateDistanceTracking(player);
        }

        /*
        Earth Essence Passive 1 : The player is permanently granted Resistance I as long as the Earth Essence item remains in their inventory.
        */
        if (hasEarthEssence(player)) {
            player.addEffect("resistance", 41, {
                amplifier: 0,
                showParticles: true
            });
        }

        /*
        Healer Essence Passive 1 : The player is permanently granted Health Boost II and Regeneration I as long as the Healer Essence item remains in their inventory.
        */
        if (hasHealerEssence(player)) {
            player.addEffect("health_boost", 41, {
                amplifier: 1,
                showParticles: true
            });
            player.addEffect("regeneration", 41, {
                amplifier: 0,
                showParticles: true
            });
        }

        /*
        Revenge Essence Passive 1: Player is granted speed 1 and strength 1 infinitely, so long as the Revenge Essence item is in their inventory.
        */
        if (hasRevengeEssence(player)) {
            player.addEffect("speed", 41, {
                amplifier: 0,
                showParticles: true
            });
            player.addEffect("strength", 41, {
                amplifier: 0,
                showParticles: true
            });
        }

        /*
        Strength Essence Passive 1: The player is permanently granted Strength II and Health Boost II as long as the Strength Essence item remains in their inventory.
        */
        if (hasStrengthEssence(player)) {
            player.addEffect("strength", 41, {
                amplifier: 1,
                showParticles: true
            });
            player.addEffect("health_boost", 41, {
                amplifier: 1,
                showParticles: true
            });
        }

        /*
        Treasure Essence Passive 1 : The player is permanently granted Hero of the Village III as long as the Treasure Essence item remains in their inventory. 
        */
        if (hasTreasureEssence(player)) {
            player.addEffect("village_hero", 41, {
                amplifier: 2,
                showParticles: true
            });
            startRandomEffectTimer(player);
        } else {
            stopRandomEffectTimer(player);
        }

        /*
        Wither Essence Passive 1: The player is permanently granted Resistance I, Strength II, Speed II, and Health Boost IV as long as the Wither Essence item remains in their inventory.
        */
        if (hasWitherEssence(player)) {
            player.addEffect("resistance", 41, {
                amplifier: 0,
                showParticles: true
            });
            player.addEffect("strength", 41, {
                amplifier: 1,
                showParticles: true
            });
            player.addEffect("speed", 41, {
                amplifier: 1,
                showParticles: true
            });
            player.addEffect("health_boost", 41, {
                amplifier: 3,
                showParticles: true
            });
        }
    });
}, 20);

/**
 * 
 * @param {Player} player - the player being cleansed of abilities. 
 */
function cleanupActiveEssenceAbilities(player) {
    cleanupAgilityEssenceAbilities(player);
    cleanupEarthEssenceAbilities(player);
    cleanupHealerEssenceAbilities(player);
    cleanupPlayerRevengeAbilities(player);
    cleanupTreasureEssenceAbilities(player);
    cleanupWitherEssenceAbilities(player);
}

world.beforeEvents.playerLeave.subscribe(event => {
    const player = event.player;
    cleanupActiveEssenceAbilities(player);

    if (actionBarIntervals.has(player.id)) {
        system.clearRun(actionBarIntervals.get(player.id));
        actionBarIntervals.delete(player.id);
    }
});

world.afterEvents.playerSpawn.subscribe(event => {
    const { initialSpawn, player } = event;

    if (initialSpawn) {
        player.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_A_PLAYER_JOINS_THE_SERVER.replace("{player}", player.name));
    }
});

world.afterEvents.playerButtonInput.subscribe(event => {
    const { player, button, newButtonState } = event;

    if (button === "Jump" && newButtonState === "Released") {
        checkGroundImpactLanding(player);
    }
});

world.afterEvents.playerInventoryItemChange.subscribe(event => {
    const player = event.player;
    const newItem = event.itemStack;

    if (player instanceof Player && newItem && newItem.typeId === "metro:wither_essence") {
        world.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_A_PLAYER_ACQUIRES_THE_WITHER_ESSENCE.replace("{player}", player.name));
        world.getAllPlayers().forEach(p => {
            p.playSound(GLOBALCONFIG.SOUNDS.WHEN_A_PLAYER_ACQUIRES_THE_WITHER_ESSENCE);
        });
    }
});

world.afterEvents.playerHotbarSelectedSlotChange.subscribe(event => {
    const player = event.player;
    const selectedItem = event.itemStack;
    const previousItem = event.previousItemStack;

    if (actionBarIntervals.has(player.id)) {
        system.clearRun(actionBarIntervals.get(player.id));
        actionBarIntervals.delete(player.id);
    }

    if (selectedItem && selectedItem.typeId === "metro:revenge_essence") {
        const interval = system.runInterval(() => {
            if (player.isValid) {
                const cooldownStatus = getRevengeCooldownStatus(player);
                player.onScreenDisplay.setActionBar(cooldownStatus);
            } else {
                system.clearRun(interval);
                actionBarIntervals.delete(player.id);
            }
        }, 1);
        actionBarIntervals.set(player.id, interval);
    }

    if (selectedItem && selectedItem.typeId === "metro:wither_essence") {
        const interval = system.runInterval(() => {
            if (player.isValid) {
                const cooldownStatus = getWitherCooldownStatus(player);
                player.onScreenDisplay.setActionBar(cooldownStatus);
            } else {
                system.clearRun(interval);
                actionBarIntervals.delete(player.id);
            }
        }, 1);
        actionBarIntervals.set(player.id, interval);
    }

    if (selectedItem && selectedItem.typeId === "metro:strength_essence") {
        const interval = system.runInterval(() => {
            if (player.isValid) {
                const cooldownStatus = getStrengthCooldownStatus(player);
                player.onScreenDisplay.setActionBar(cooldownStatus);
            } else {
                system.clearRun(interval);
                actionBarIntervals.delete(player.id);
            }
        }, 1);
        actionBarIntervals.set(player.id, interval);
    }

    if (selectedItem && selectedItem.typeId === "metro:healer_essence") {
        const interval = system.runInterval(() => {
            if (player.isValid) {
                const cooldownStatus = getHealerCooldownStatus(player);
                player.onScreenDisplay.setActionBar(cooldownStatus);
            } else {
                system.clearRun(interval);
                actionBarIntervals.delete(player.id);
            }
        }, 1);
        actionBarIntervals.set(player.id, interval);
    }

    if (selectedItem && selectedItem.typeId === "metro:treasure_essence") {
        const interval = system.runInterval(() => {
            if (player.isValid) {
                const cooldownStatus = getTreasureCooldownStatus(player);
                player.onScreenDisplay.setActionBar(cooldownStatus);
            } else {
                system.clearRun(interval);
                actionBarIntervals.delete(player.id);
            }
        }, 1);
        actionBarIntervals.set(player.id, interval);
    }

    if (selectedItem && selectedItem.typeId === "metro:agility_essence") {
        const interval = system.runInterval(() => {
            if (player.isValid) {
                const cooldownStatus = getAgilityCooldownStatus(player);
                player.onScreenDisplay.setActionBar(cooldownStatus);
            } else {
                system.clearRun(interval);
                actionBarIntervals.delete(player.id);
            }
        }, 1);
        actionBarIntervals.set(player.id, interval);
    }

    if (selectedItem && selectedItem.typeId === "metro:earth_essence") {
        const interval = system.runInterval(() => {
            if (player.isValid) {
                const cooldownStatus = getEarthCooldownStatus(player);
                player.onScreenDisplay.setActionBar(cooldownStatus);
            } else {
                system.clearRun(interval);
                actionBarIntervals.delete(player.id);
            }
        }, 1);
        actionBarIntervals.set(player.id, interval);
    }
});

world.beforeEvents.itemUse.subscribe(event => {
    const item = event.itemStack;
    const source = event.source;

    if (source instanceof Player) {
        const player = source;

        if (item.typeId === "minecraft:golden_apple") {
            if (!canConsumeGoldenApple(player) || !canConsumeGoldenAppleAgility(player)) {
                event.cancel = true;
                player.sendMessage(" §cYou are affected by an essence and cannot consume Golden Apples!");
                return;
            }
        }

        switch (item.typeId) {
            case "metro:revenge_essence":
                if (player.isSneaking) {
                    divineJudgment(player);
                } else {
                    enraged(player);
                }
                break;

            case "metro:wither_essence":
                if (player.isSneaking) {
                    corruptionCloud(player);
                } else {
                    fireWitherSkullBarrage(player);
                }
                break;

            case "metro:strength_essence":
                if (player.isSneaking) {
                    titanicSlam(player);
                } else {
                    rallyOfPower(player);
                }
                break;

            case "metro:healer_essence":
                if (player.isSneaking) {
                    purgeWard(player);
                } else {
                    circleOfVitality(player);
                }
                break;

            case "metro:treasure_essence":
                if (player.isSneaking) {
                    gildedSanctuary(player);
                } else {
                    fortunesReckoning(player);
                }
                break;

            case "metro:agility_essence":
                if (player.isSneaking) {
                    lightningRush(player);
                } else {
                    groundImpact(player);
                }
                break;

            case "metro:earth_essence":
                if (player.isSneaking) {
                    tremble(player);
                } else {
                    stoneClamp(player);
                }
                break;
        }
    }
});

world.afterEvents.itemCompleteUse.subscribe(event => {
    const item = event.itemStack;
    const source = event.source;

    if (source instanceof Player && item.typeId === "minecraft:golden_apple") {
        onGoldenAppleConsume(source);
    }
});

world.afterEvents.entityHurt.subscribe(event => {
    const attacker = event.damageSource.damagingEntity;
    const victim = event.hurtEntity;

    if (victim instanceof Player) {

        checkLowHealth(victim);

        if (hasAgilityEssence(victim)) {
            resetDistanceTracking(victim);
        }

        if (attacker instanceof Player) {
            const heldItem = attacker.getComponent("inventory").container.getItem(attacker.selectedSlotIndex);

            if (heldItem) {
                switch (heldItem.typeId) {
                    case "metro:agility_essence":
                        if (canTriggerCripplingBlow(attacker)) {
                            cripplingBlow(attacker, victim);
                        }
                        break;

                    case "metro:revenge_essence":
                        almightySpeech(attacker, victim);
                        break;

                    case "metro:wither_essence":
                        witherStrike(attacker, victim);
                        break;

                    case "metro:strength_essence":
                        if (canTriggerCrushingBlow(attacker)) {
                            crushingBlow(attacker, victim);
                        }
                        break;

                    case "metro:healer_essence":
                        touchOfGrace(attacker, victim);
                        break;

                    case "metro:treasure_essence":
                        curseOfAvarice(attacker, victim);
                        break;

                    case "metro:earth_essence":
                        if (canTriggerRockSolid(attacker)) {
                            rockSolid(attacker, victim);
                        }
                        break;
                }
            }

            if (hasWitherEssence(attacker)) {
                applyWitherOnHit(attacker, victim);
            }

            if (hasStrengthEssence(attacker)) {
                applyComboOnHit(attacker, victim);
            }
        }
    }
});

world.afterEvents.entityDie.subscribe(event => {
    const killer = event.damageSource.damagingEntity;
    const victim = event.deadEntity;

    if (killer instanceof Player && victim instanceof Player) {
        onJudgmentKill(killer);
    }

    if (victim instanceof Player) {
        cleanupActiveEssenceAbilities(victim);

        if (actionBarIntervals.has(victim.id)) {
            system.clearRun(actionBarIntervals.get(victim.id));
            actionBarIntervals.delete(victim.id);
        }
    }
});

world.afterEvents.playerBreakBlock.subscribe(event => {
    const block = event.brokenBlockPermutation.type.id;
    const player = event.player;

    handleEmeraldMining(player, block);
});

system.beforeEvents.startup.subscribe((init) => {
    const trustOperationEnum = ["add", "remove", "list"];
    init.customCommandRegistry.registerEnum("metro:trust_operation", trustOperationEnum);

    const trustCmd = {
        name: "metro:trust",
        description: "Manage your trusted players.",
        permissionLevel: CommandPermissionLevel.Any,
        mandatoryParameters: [
            {
                type: CustomCommandParamType.Enum,
                name: "metro:trust_operation"
            }
        ],
        optionalParameters: [
            {
                type: CustomCommandParamType.PlayerSelector,
                name: "player"
            }
        ]
    };

    init.customCommandRegistry.registerCommand(trustCmd, trustCommand);
});

function trustCommand(origin, operation, playerArray) {
    system.run(() => {
        if (origin && origin.sourceEntity instanceof Player) {
            const player = origin.sourceEntity;

            switch (operation) {
                case "add":
                    if (!playerArray || playerArray.length === 0) {
                        player.sendMessage("§cUsage: /metro:trust add <player>");
                        return { status: CustomCommandStatus.Failure };
                    }
                    const targetPlayerAdd = world.getAllPlayers().find(p => p.id === playerArray[0].id);
                    if (!targetPlayerAdd) {
                        player.sendMessage("§cPlayer not found or not online.");
                        return { status: CustomCommandStatus.Failure };
                    }
                    if (targetPlayerAdd.id === player.id) {
                        player.sendMessage("§cYou cannot add yourself to the trusted list.");
                        return { status: CustomCommandStatus.Failure };
                    }
                    const trusted = getTrustedPlayers(player);
                    if (trusted.has(targetPlayerAdd.id)) {
                        player.sendMessage(`§c${targetPlayerAdd.name} is already in your trusted list.`);
                        return { status: CustomCommandStatus.Failure };
                    }
                    addTrustedPlayer(player, targetPlayerAdd.id, targetPlayerAdd.name);
                    player.sendMessage(`§aAdded §e${targetPlayerAdd.name} §ato trusted list`);
                    break;

                case "remove":
                    if (!playerArray || playerArray.length === 0) {
                        player.sendMessage("§cUsage: /metro:trust remove <player>");
                        return { status: CustomCommandStatus.Failure };
                    }
                    const targetPlayerRemove = world.getAllPlayers().find(p => p.id === playerArray[0].id);
                    if (!targetPlayerRemove) {
                        player.sendMessage("§cPlayer not found or not online.");
                        return { status: CustomCommandStatus.Failure };
                    }
                    const trustedRemove = getTrustedPlayers(player);
                    if (!trustedRemove.has(targetPlayerRemove.id)) {
                        player.sendMessage(`§c${targetPlayerRemove.name} is not in your trusted list.`);
                        return { status: CustomCommandStatus.Failure };
                    }
                    removeTrustedPlayer(player, targetPlayerRemove.id);
                    player.sendMessage(`§cRemoved §e${targetPlayerRemove.name} §cfrom trusted list`);
                    break;

                case "list":
                    const trustedList = getTrustedPlayers(player);
                    if (trustedList.size === 0) {
                        player.sendMessage("§7No trusted players");
                    } else {
                        player.sendMessage("§6Trusted Players:");
                        const allPlayers = world.getAllPlayers();
                        trustedList.forEach(playerId => {
                            const trustedPlayer = allPlayers.find(p => p.id === playerId);
                            const displayName = trustedPlayer ? trustedPlayer.name : `Unknown (ID: ${playerId})`;
                            player.sendMessage(`§7- §e${displayName}`);
                        });
                    }
                    break;
            }

            return { status: CustomCommandStatus.Success };
        }
    });
}