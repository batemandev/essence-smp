import { ItemLockMode, ItemStack, system, world } from "@minecraft/server";
import { cleanupActiveEssenceAbilities } from "./index";

const CONFIG = {
    essenceTypes: ["agility", "earth", "healer", "revenge", "strength", "treasure"],
    essenceMessage: "§aYou received a new essence: §e",
    essenceLore: {
        agility: [
            "§r— §7Passive 1: Speed II permanently",
            "§r— §7Passive 2: Speed increases per 65 blocks",
            "§r— §1Ability 1:§f Ground Impact: Haste & Jump",
            "§r— §2Ability 2:§f Lightning Rush: Speed III",
            "§r— §3Ability 3:§f Crippling Blow on hit"
        ],
        earth: [
            "§r— §7Passive 1: Resistance I permanently",
            "§r— §7Passive 2: Resistance II below 6 hearts",
            "§r— §1Ability 1:§f Stone Clamp: Crushing walls",
            "§r— §2Ability 2:§f Tremble: Ground shakes",
            "§r— §3Ability 3:§f Rock Solid: Encase enemy in stone"
        ],
        healer: [
            "§r— §7Passive 1: Regeneration I permanently",
            "§r— §7Passive 2: Absorption on golden apple",
            "§r— §1Ability 1:§f Circle of Vitality: Heal allies",
            "§r— §2Ability 2:§f Purge Ward: Block golden apples",
            "§r— §3Ability 3:§f Touch of Grace on hit"
        ],
        revenge: [
            "§r— §7Passive 1: Strength II below 6 hearts",
            "§r— §1Ability 1:§f Enraged: Strength circle",
            "§r— §2Ability 2:§f Almighty Speech: Imprison foe",
            "§r— §3Ability 3:§f Divine Judgment: Weaken enemies"
        ],
        strength: [
            "§r— §7Passive 1: Strength I permanently",
            "§r— §7Passive 2: Strength III after 8 hit combo",
            "§r— §1Ability 1:§f Rally of Power: Buff allies",
            "§r— §2Ability 2:§f Titanic Slam: Ground smash",
            "§r— §3Ability 3:§f Crushing Blow on hit"
        ],
        treasure: [
            "§r— §7Passive 1: Luck permanently",
            "§r— §7Passive 2: Random effect every 25 minutes",
            "§r— §7Passive 3: Emerald ore mining rewards",
            "§r— §1Ability 1:§f Fortune's Reckoning: Cleanse",
            "§r— §2Ability 2:§f Gilded Sanctuary: Regen IV",
            "§r— §3Ability 3:§f Curse of Avarice on hit"
        ]
    }
};

const activeBoxes = new Set();
const boxUsageHistory = new Map();

world.beforeEvents.playerInteractWithEntity.subscribe(event => {
    const entity = event.target;
    const player = event.player;

    if (entity.typeId !== "metro:pandora_box") return;

    const entityId = entity.id;
    const playerId = player.id;

    if (activeBoxes.has(entityId)) {
        event.cancel = true;
        player.sendMessage("§cThis Pandora Box is already being opened!");
        return;
    }

    if (boxUsageHistory.has(entityId)) {
        const usageData = boxUsageHistory.get(entityId);
        if (usageData.has(playerId)) {
            event.cancel = true;
            player.sendMessage("§cYou have already used this Pandora Box!");
            return;
        }
    }

    activeBoxes.add(entityId);

    if (!boxUsageHistory.has(entityId)) {
        boxUsageHistory.set(entityId, new Set());
    }
    boxUsageHistory.get(entityId).add(playerId);

    system.run(() => {
        if (!activeBoxes.has(entityId)) return;

        try {
            entity.playAnimation("animation.pandora_box.open");
            player.camera.fade();
            entity.dimension.playSound("beacon.power", entity.location);

            const inventory = player.getComponent("inventory").container;

            let currentEssence = null;
            for (let i = 0; i < inventory.size; i++) {
                const item = inventory.getItem(i);
                if (item && item.typeId.startsWith("metro:") && item.typeId.endsWith("_essence")) {
                    currentEssence = item.typeId.replace("metro:", "").replace("_essence", "");
                    inventory.setItem(i, undefined);
                    break;
                }
            }

            cleanupActiveEssenceAbilities(player);

            const availableEssences = CONFIG.essenceTypes.filter(type => type !== currentEssence);
            const randomEssence = availableEssences[Math.floor(Math.random() * availableEssences.length)];

            const particleInterval = system.runInterval(() => {
                if (!entity.isValid) {
                    system.clearRun(particleInterval);
                    return;
                }

                const location = entity.location;
                const offsetY = 1.5;

                for (let i = 0; i < 8; i++) {
                    const randomRadius = Math.random() * 1.2;
                    const randomAngle = Math.random() * Math.PI * 2;
                    const randomHeight = (Math.random() - 0.5) * 1.5;
                    const particlePos = {
                        x: location.x + Math.cos(randomAngle) * randomRadius,
                        y: location.y + offsetY + randomHeight,
                        z: location.z + Math.sin(randomAngle) * randomRadius
                    };

                    entity.dimension.spawnParticle("minecraft:blue_flame_particle", particlePos);
                }

                for (let i = 0; i < 4; i++) {
                    const randomRadius = Math.random() * 1.2;
                    const randomAngle = Math.random() * Math.PI * 2;
                    const randomHeight = (Math.random() - 0.5) * 1.5;
                    const particlePos = {
                        x: location.x + Math.cos(randomAngle) * randomRadius,
                        y: location.y + offsetY + randomHeight,
                        z: location.z + Math.sin(randomAngle) * randomRadius
                    };

                    entity.dimension.spawnParticle("minecraft:lab_table_misc_mystical_particle", particlePos);
                }
            }, 1);

            system.runTimeout(() => {
                system.clearRun(particleInterval);

                if (entity.isValid) {
                    entity.playAnimation("animation.pandora_box.close");
                }

                const newEssence = new ItemStack(`metro:${randomEssence}_essence`, 1);
                newEssence.keepOnDeath = true;
                newEssence.lockMode = ItemLockMode.inventory;

                const loreList = CONFIG.essenceLore[randomEssence];
                if (loreList) {
                    newEssence.setLore(loreList);
                }

                inventory.addItem(newEssence);
                player.sendMessage(`${CONFIG.essenceMessage}${randomEssence.charAt(0).toUpperCase() + randomEssence.slice(1)} Essence`);

                system.runTimeout(() => {
                    if (!entity.isValid) {
                        activeBoxes.delete(entityId);
                        return;
                    }

                    const location = entity.location;

                    entity.dimension.spawnParticle("minecraft:bleach", {
                        x: location.x + 0.4,
                        y: location.y + 0.1,
                        z: location.z - 0.4
                    });
                    entity.dimension.spawnParticle("minecraft:bleach", {
                        x: location.x + 0.4,
                        y: location.y + 0.1,
                        z: location.z + 0.4
                    });
                    entity.dimension.spawnParticle("minecraft:bleach", {
                        x: location.x - 0.4,
                        y: location.y + 0.1,
                        z: location.z + 0.4
                    });
                    entity.dimension.spawnParticle("minecraft:bleach", {
                        x: location.x - 0.4,
                        y: location.y + 0.1,
                        z: location.z - 0.4
                    });

                    entity.dimension.spawnParticle("minecraft:totem_particle", {
                        x: location.x,
                        y: location.y + 0.8,
                        z: location.z
                    });

                    entity.remove();
                    player.dimension.playSound("liquid.lavapop", player.location);

                    activeBoxes.delete(entityId);
                    boxUsageHistory.delete(entityId);
                }, 20);
            }, 25);
        } catch (error) {
            activeBoxes.delete(entityId);
            console.warn("Pandora Box error:", error);
        }
    });
});