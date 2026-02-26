import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Button, ExpressionPickerStore, Forms, MessageActions, React, RestAPI, TextArea, UserStore, useState } from "@webpack/common";

const PREFIX = "%autoreact";
const HELP_TEXT = `${PREFIX} commands: status | emoji <value> | mode <all|self|selected> | add <@user|id> | remove <@user|id> | clear | enabled <true|false> | self <true|false> | bots <true|false> | cooldown <ms>`;

const enum TargetMode {
    All = "all",
    Self = "self",
    Selected = "selected"
}

interface PrefixCommandResult {
    handled: boolean;
    success: boolean;
    response?: string;
}

function normalizeMode(value: unknown): TargetMode {
    const mode = String(value ?? "").toLowerCase().trim();
    if (mode === TargetMode.Self) return TargetMode.Self;
    if (mode === TargetMode.Selected) return TargetMode.Selected;
    return TargetMode.All;
}

function parseUserId(input: unknown) {
    const raw = String(input ?? "").trim();
    if (!raw) return "";

    const mention = raw.match(/^<@!?(\d+)>$/);
    if (mention) return mention[1];

    const id = raw.match(/^(\d{10,})$/);
    return id ? id[1] : "";
}

function normalizeUserIdList(input: string) {
    const ids = new Set(
        input
            .split(",")
            .map(chunk => parseUserId(chunk))
            .filter(Boolean)
    );

    return Array.from(ids).join(", ");
}

function parseBoolean(input: string) {
    const value = input.toLowerCase().trim();
    if (["true", "on", "yes", "1"].includes(value)) return true;
    if (["false", "off", "no", "0"].includes(value)) return false;
    return null;
}

function SelectedUsersComponent(props: { setValue: (value: string) => void; }) {
    const [value, setValue] = useState<string>(settings.store.selectedUserIds ?? "");

    function onChange(next: string) {
        setValue(next);
        props.setValue(next);
    }

    return React.createElement(
        "section",
        null,
        React.createElement(Forms.FormTitle, { tag: "h3" }, "Selected User IDs"),
        React.createElement(
            Forms.FormText,
            null,
            "Only used when Target mode is 'Selected users'. Paste IDs or mentions, comma separated."
        ),
        React.createElement(TextArea, {
            type: "text",
            value,
            onChange,
            placeholder: "123456789012345678, <@987654321098765432>"
        })
    );
}

function EmojiPickerComponent() {
    function openEmojiPickerSafe() {
        try {
            const store = ExpressionPickerStore as any;
            if (typeof store?.toggleExpressionPicker === "function") {
                store.toggleExpressionPicker("emoji");
                if (typeof store?.setExpressionPickerView === "function") {
                    store.setExpressionPickerView("emoji");
                }
                return;
            }
            if (typeof store?.openExpressionPicker === "function") {
                store.openExpressionPicker("emoji");
                if (typeof store?.setExpressionPickerView === "function") {
                    store.setExpressionPickerView("emoji");
                }
                return;
            }
        } catch {
            // no-op
        }

        console.warn("AutoReact: could not open emoji picker here. Open any chat box, then try again.");
    }

    return React.createElement(
        "section",
        null,
        React.createElement(Forms.FormTitle, { tag: "h3" }, "Emoji Picker"),
        React.createElement(Forms.FormText, null, "Open Discord's emoji picker, then copy/paste the emoji into the Emoji setting."),
        React.createElement(Button, {
            onClick: openEmojiPickerSafe
        }, "Open Emoji Picker")
    );
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable or disable AutoReact",
        default: true
    },
    emoji: {
        type: OptionType.STRING,
        description: "Emoji to react with (unicode like 👍 or custom like <:blobwave:123456789012345678>)",
        default: "👍"
    },
    openEmojiPicker: {
        type: OptionType.COMPONENT,
        component: EmojiPickerComponent
    },
    targetMode: {
        type: OptionType.SELECT,
        description: "Who should receive auto reactions",
        options: [
            { label: "Everyone", value: TargetMode.All, default: true },
            { label: "Only me", value: TargetMode.Self },
            { label: "Selected users", value: TargetMode.Selected }
        ]
    },
    selectedUserIds: {
        type: OptionType.COMPONENT,
        default: "",
        onChange(newValue: string) {
            settings.store.selectedUserIds = normalizeUserIdList(newValue);
        },
        component: props => SelectedUsersComponent({ setValue: props.setValue })
    },
    reactToSelf: {
        type: OptionType.BOOLEAN,
        description: "React to your own messages (used in Everyone mode)",
        default: false
    },
    reactToBots: {
        type: OptionType.BOOLEAN,
        description: "React to bot messages",
        default: false
    },
    cooldownMs: {
        type: OptionType.NUMBER,
        description: "Minimum delay between auto reactions in milliseconds",
        default: 750
    }
});

interface DiscordAuthor {
    id: string;
    bot?: boolean;
}

interface DiscordMessage {
    id: string;
    channel_id: string;
    content?: string;
    author: DiscordAuthor;
}

interface MessageCreateEvent {
    message?: DiscordMessage;
}

let lastReactionAt = 0;
const handledPrefixMessageIds = new Set<string>();

function normalizeEmoji(input: string) {
    return input.trim();
}

function isEmojiValueValid(input: string) {
    const value = normalizeEmoji(input);
    if (!value) return false;
    if (/^<a?:[a-zA-Z0-9_]+:\d+>$/.test(value)) return true;
    return /\p{Extended_Pictographic}/u.test(value);
}

function getSelectedUserIdSet() {
    const normalized = normalizeUserIdList(settings.store.selectedUserIds ?? "");
    if (normalized !== settings.store.selectedUserIds) {
        settings.store.selectedUserIds = normalized;
    }

    return new Set(normalized.split(",").map(x => x.trim()).filter(Boolean));
}

function shouldReactToMessage(message: DiscordMessage, isSelfMessage: boolean) {
    if (!settings.store.reactToBots && message.author.bot) return false;

    const mode = normalizeMode(settings.store.targetMode);
    if (mode === TargetMode.Self) {
        return isSelfMessage;
    }

    if (mode === TargetMode.Selected) {
        return getSelectedUserIdSet().has(message.author.id);
    }

    if (!settings.store.reactToSelf && isSelfMessage) return false;
    return true;
}

function statusText() {
    const selectedUsers = getSelectedUserIdSet();

    return [
        `Enabled: ${settings.store.enabled ? "Yes" : "No"}`,
        `Emoji: ${settings.store.emoji}`,
        `Mode: ${normalizeMode(settings.store.targetMode)}`,
        `Selected users: ${selectedUsers.size}`,
        `React to self (Everyone mode): ${settings.store.reactToSelf ? "Yes" : "No"}`,
        `React to bots: ${settings.store.reactToBots ? "Yes" : "No"}`,
        `Cooldown: ${settings.store.cooldownMs}ms`
    ].join("\n");
}

function handlePrefixCommand(content: string): PrefixCommandResult {
    const raw = content.trim();
    if (!raw.toLowerCase().startsWith(PREFIX)) {
        return { handled: false, success: false };
    }

    const args = raw.slice(PREFIX.length).trim();
    if (!args) {
        return { handled: true, success: true, response: HELP_TEXT };
    }

    const [command, ...rest] = args.split(/\s+/g);
    const value = rest.join(" ").trim();

    switch (command.toLowerCase()) {
        case "status":
            return { handled: true, success: true, response: statusText() };

        case "emoji":
            if (!value || !isEmojiValueValid(value)) {
                return { handled: true, success: false, response: "AutoReact: invalid emoji. Use unicode or <:name:id>" };
            }
            settings.store.emoji = normalizeEmoji(value);
            return { handled: true, success: true };

        case "mode": {
            const mode = normalizeMode(value);
            settings.store.targetMode = mode;
            return { handled: true, success: true };
        }

        case "add": {
            const id = parseUserId(value);
            if (!id) {
                return { handled: true, success: false, response: "AutoReact: invalid user. Use mention or numeric ID" };
            }
            const users = getSelectedUserIdSet();
            users.add(id);
            settings.store.selectedUserIds = Array.from(users).join(", ");
            settings.store.targetMode = TargetMode.Selected;
            return { handled: true, success: true };
        }

        case "remove": {
            const id = parseUserId(value);
            if (!id) {
                return { handled: true, success: false, response: "AutoReact: invalid user. Use mention or numeric ID" };
            }
            const users = getSelectedUserIdSet();
            users.delete(id);
            settings.store.selectedUserIds = Array.from(users).join(", ");
            return { handled: true, success: true };
        }

        case "clear": {
            settings.store.selectedUserIds = "";
            return { handled: true, success: true };
        }

        case "enabled": {
            const parsed = parseBoolean(value);
            if (parsed == null) {
                return { handled: true, success: false, response: "AutoReact: enabled must be true/false" };
            }
            settings.store.enabled = parsed;
            return { handled: true, success: true };
        }

        case "self": {
            const parsed = parseBoolean(value);
            if (parsed == null) {
                return { handled: true, success: false, response: "AutoReact: self must be true/false" };
            }
            settings.store.reactToSelf = parsed;
            return { handled: true, success: true };
        }

        case "bots": {
            const parsed = parseBoolean(value);
            if (parsed == null) {
                return { handled: true, success: false, response: "AutoReact: bots must be true/false" };
            }
            settings.store.reactToBots = parsed;
            return { handled: true, success: true };
        }

        case "cooldown": {
            const n = Number.parseInt(value, 10);
            if (!Number.isFinite(n)) {
                return { handled: true, success: false, response: "AutoReact: cooldown must be a number" };
            }
            settings.store.cooldownMs = Math.max(0, n);
            return { handled: true, success: true };
        }

        case "help":
            return { handled: true, success: true, response: HELP_TEXT };

        default:
            return { handled: true, success: false, response: HELP_TEXT };
    }
}

function extractMessageIdFromSendResult(result: any) {
    return result?.id ?? result?.body?.id ?? result?.message?.id ?? "";
}

function scheduleDeleteAfter5s(channelId: string, messageId?: string) {
    if (!messageId) return;

    setTimeout(() => {
        void MessageActions.deleteMessage(channelId, messageId);
    }, 5000);
}

function markPrefixHandled(messageId: string) {
    handledPrefixMessageIds.add(messageId);
    setTimeout(() => handledPrefixMessageIds.delete(messageId), 15000);
}

async function sendResponseAndCleanup(channelId: string, commandMessageId: string, content: string) {
    let responseMessageId = "";

    try {
        const result = await MessageActions.sendMessage(channelId, { content }, false);
        responseMessageId = extractMessageIdFromSendResult(result);
    } catch {
        // no-op
    }

    scheduleDeleteAfter5s(channelId, commandMessageId);
    scheduleDeleteAfter5s(channelId, responseMessageId);
}

function toReactionPath(emoji: string) {
    const value = emoji.trim();
    const custom = value.match(/^<a?:([a-zA-Z0-9_]+):(\d+)>$/);

    if (custom) {
        return encodeURIComponent(`${custom[1]}:${custom[2]}`);
    }

    return encodeURIComponent(value);
}

async function addReaction(channelId: string, messageId: string, emoji: string) {
    const emojiPath = toReactionPath(emoji);

    await RestAPI.put({
        url: `/channels/${channelId}/messages/${messageId}/reactions/${emojiPath}/%40me`
    });
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function addReactionWithRetry(channelId: string, messageId: string, emoji: string, isSelfMessage: boolean) {
    const maxAttempts = isSelfMessage ? 3 : 1;
    const initialDelayMs = isSelfMessage ? 350 : 0;

    if (initialDelayMs > 0) {
        await sleep(initialDelayMs);
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await addReaction(channelId, messageId, emoji);
            lastReactionAt = Date.now();
            return;
        } catch {
            if (attempt >= maxAttempts) return;
            await sleep(250);
        }
    }
}

function onMessageCreate(event: MessageCreateEvent) {
    const message = event?.message;
    if (!message?.id || !message?.channel_id || !message?.author) return;
    if (!settings.store.enabled) return;

    const currentUser = UserStore.getCurrentUser();
    const isSelfMessage = message.author.id === currentUser?.id;

    if (isSelfMessage && typeof message.content === "string") {
        if (handledPrefixMessageIds.has(message.id)) {
            return;
        }

        const startedAt = Date.now();
        const result = handlePrefixCommand(message.content);
        if (result.handled) {
            markPrefixHandled(message.id);
            const elapsedMs = Date.now() - startedAt;
            const responseContent = result.response ?? (result.success ? `Done: ${elapsedMs}ms` : HELP_TEXT);
            void sendResponseAndCleanup(message.channel_id, message.id, responseContent);
            return;
        }
    }

    if (!shouldReactToMessage(message, isSelfMessage)) return;
    if (!isEmojiValueValid(settings.store.emoji)) return;

    const now = Date.now();
    if (settings.store.cooldownMs > 0 && now - lastReactionAt < settings.store.cooldownMs) return;

    void addReactionWithRetry(message.channel_id, message.id, settings.store.emoji, isSelfMessage);
}

export default definePlugin({
    name: "AutoReact",
    description: "Automatically reacts to messages with your chosen emoji",
    authors: [{ name: "adm", id: 0n }],
    settings,
    flux: {
        MESSAGE_CREATE: onMessageCreate
    }
});
