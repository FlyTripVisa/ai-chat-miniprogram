import { Env } from "./types";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";
const STT_MODEL = "@cf/openai/whisper";

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // ১. টেলিগ্রাম Webhook হ্যান্ডলার
        if (url.pathname === "/api/telegram-webhook" && request.method === "POST") {
            return handleTelegramWebhook(request, env);
        }

        // ২. উইচ্যাট বা রোবট অ্যাকশন হ্যান্ডলার
        if (url.pathname === "/api/bot-action" && request.method === "POST") {
            return handleBotAction(request, env);
        }

        return new Response("Not found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
    const data = await request.json() as any;
    const message = data.message;
    if (!message) return new Response("OK");

    const chatId = message.chat.id;
    const sender = message.from?.username || "unknown";
    let textToProcess = "";

    // ভয়েস মেসেজ প্রসেসিং
    if (message.voice) {
        const fileId = message.voice.file_id;
        const fileRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json() as any;
        const downloadUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
        
        const audio = await fetch(downloadUrl).then(res => res.arrayBuffer());
        const sttResult = await env.AI.run(STT_MODEL, { audio: [...new Uint8Array(audio)] }) as any;
        textToProcess = sttResult.text;
    } else {
        textToProcess = message.text || "";
    }

    // AI রেসপন্স জেনারেশন
    const aiResponse = await getAiResponse(textToProcess, env);

    // ডাটাবেজে সেভ করা (D1 Database)
    try {
        await env.DB.prepare(
            "INSERT INTO chat_logs (chat_id, sender, input_text, ai_response, created_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(chatId, sender, textToProcess, aiResponse, new Date().toISOString())
        .run();
    } catch (e) {
        console.error("Database save failed:", e);
    }

    // টেলিগ্রামে রিপ্লাই পাঠানো
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: aiResponse })
    });

    return new Response("OK");
}

async function handleBotAction(request: Request, env: Env): Promise<Response> {
    const { action, secret } = await request.json() as any;
    if (secret !== env.BOT_SECRET_KEY) return new Response("Unauthorized", { status: 403 });
    return new Response(JSON.stringify({ status: "Success", action }), { headers: { 'content-type': 'application/json' } });
}

async function getAiResponse(text: string, env: Env): Promise<string> {
    const response = await env.AI.run(MODEL_ID, {
        messages: [{ role: "user", content: text }]
    }) as any;
    return response.response;
}
