declare module "@api/Settings" {
    export function definePluginSettings<T extends Record<string, any>>(settings: T): {
        store: {
            [K in keyof T]: any;
        };
        use: (keys: string[]) => Record<string, any>;
    };
}

declare module "@utils/types" {
    export enum OptionType {
        STRING = 0,
        NUMBER = 1,
        BIGINT = 2,
        BOOLEAN = 3,
        SELECT = 4,
        SLIDER = 5,
        COMPONENT = 6,
        CUSTOM = 7
    }

    export interface PluginDefinition {
        name: string;
        description: string;
        authors: Array<{ name: string; id: bigint }>;
        settings?: any;
        commands?: any[];
        dependencies?: string[];
        flux?: Record<string, (event: any) => void>;
        start?: () => void;
        stop?: () => void;
    }

    export default function definePlugin(definition: PluginDefinition): PluginDefinition;
}

declare module "@webpack/common" {
    export const RestAPI: {
        put: (args: { url: string }) => Promise<any>;
    };

    export const MessageActions: {
        sendMessage: (channelId: string, data: any, waitForChannelReady?: boolean, options?: any) => Promise<any>;
        deleteMessage: (channelId: string, messageId: string) => Promise<any> | void;
    };

    export const UserStore: {
        getCurrentUser: () => { id: string } | null;
    };

    export const ExpressionPickerStore: {
        openExpressionPicker: (activeView: string, activeViewType?: any) => void;
        toggleExpressionPicker?: (activeView: string, activeViewType?: any) => void;
        setExpressionPickerView?: (activeView: string) => void;
    };

    export const Button: any;
    export const Forms: any;
    export const TextArea: any;
    export const React: any;
    export function useState<T>(value: T): [T, (next: T) => void];
}
