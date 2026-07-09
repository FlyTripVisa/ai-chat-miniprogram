/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
export interface Env {
    // Cloudflare AI ও Database বাইন্ডিং
    AI: Ai;
    DB: any;

    // টেলিগ্রাম এনভায়রনমেন্ট ভেরিয়েবল
    TELEGRAM_BOT_TOKEN: string;

    // উই-কম (WeCom) এনভায়রনমেন্ট ভেরিয়েবল
    WECOM_BOT_KEY: string;
    WECOM_SECRET_KEY: string;
    WECOM_BOT_ID: string;
}

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

