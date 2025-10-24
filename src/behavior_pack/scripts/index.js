import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { GLOBALCONFIG } from "./config";
import { addTrustedPlayer, almightySpeech, checkLowHealth, divineJudgment, enraged, getCooldownStatus, getTrustedPlayers, hasRevengeEssence, onJudgmentKill, removeTrustedPlayer } from "./essences";

system.runInterval(() => {
    const players = world.getAllPlayers();

    players.forEach(player => {
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
    });
}, 20);

world.afterEvents.playerSpawn.subscribe(event => {
    const { initialSpawn, player } = event;

    if (initialSpawn) {
        player.sendMessage(GLOBALCONFIG.MESSAGES.WHEN_A_PLAYER_JOINS_THE_SERVER.replace("{player}", player.name));
    }
});

world.afterEvents.playerHotbarSelectedSlotChange.subscribe(event => {
    const player = event.player;
    const selectedItem = event.itemStack;

    if (selectedItem && selectedItem.typeId === "metro:revenge_essence") {
        const cooldownStatus = getCooldownStatus(player);
        player.onScreenDisplay.setActionBar(cooldownStatus);
    }
});

world.beforeEvents.itemUse.subscribe(event => {
    const item = event.itemStack;
    const source = event.source;

    if (source instanceof Player) {
        const player = source;

        if (item.typeId === "metro:revenge_essence") {
            if (player.isSneaking) {
                divineJudgment(player);
            } else {
                enraged(player);
            }
        }
    }
});

world.afterEvents.entityHurt.subscribe(event => {
    const attacker = event.damageSource.damagingEntity;
    const victim = event.hurtEntity;

    if (victim instanceof Player) {

        checkLowHealth(victim);

        if (attacker instanceof Player) {
            const heldItem = attacker.getComponent("inventory").container.getItem(attacker.selectedSlotIndex);

            if (heldItem && heldItem.typeId === "metro:revenge_essence") {
                almightySpeech(attacker, victim);
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
});

system.beforeEvents.startup.subscribe((init) => {
    const trustOperationEnum = ["add", "remove", "list"];
    init.customCommandRegistry.registerEnum("metro:trust_operation", trustOperationEnum);

    const trustCmd = {
        name: "metro:trust",
        description: "Manage trusted players for Divine Judgment ability.",
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