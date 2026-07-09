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

        // ২. উই-কম (WeCom) হ্যান্ডলার
        if (url.pathname === "/api/wecom-webhook" && request.method === "POST") {
            return handleWeComWebhook(request, env);
        }

        return new Response("Not found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;

// টেলিগ্রাম হ্যান্ডলার
async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
    const data = await request.json() as any;
    if (!data.message) return new Response("OK");

    const chatId = data.message.chat.id;
    const sender = data.message.from?.username || "unknown";
    let textToProcess = "";

    if (data.message.voice) {
        const fileId = data.message.voice.file_id;
        const fileRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json() as any;
        const downloadUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
        
        const audio = await fetch(downloadUrl).then(res => res.arrayBuffer());
        const sttResult = await env.AI.run(STT_MODEL, { audio: [...new Uint8Array(audio)] }) as any;
        textToProcess = sttResult.text;
    } else {
        textToProcess = data.message.text || "";
    }

    const aiResponse = await getAiResponse(textToProcess, env);

    // ডাটাবেজে সেভ
    await env.DB.prepare("INSERT INTO chat_logs (chat_id, sender, input_text, ai_response, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(chatId, sender, textToProcess, aiResponse, new Date().toISOString()).run();

    // টেলিগ্রামে রিপ্লাই
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: aiResponse })
    });

    return new Response("OK");
}

// উই-কম (WeCom) হ্যান্ডলার
async function handleWeComWebhook(request: Request, env: Env): Promise<Response> {
    const secret = request.headers.get("X-WeCom-Secret");
    if (secret !== env.WECOM_SECRET_KEY) return new Response("Unauthorized", { status: 403 });

    const data = await request.json() as any;
    const userMessage = data.content; 

    const aiResponse = await getAiResponse(userMessage, env);

    // উই-কম এপিআই কল
    await fetch(`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${env.WECOM_BOT_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: "text", text: { content: aiResponse } })
    });

    return new Response(JSON.stringify({ status: "Success" }), { status: 200 });
}

// AI জেনারেশন ফাংশন
async function getAiResponse(text: string, env: Env): Promise<string> {
    const response = await env.AI.run(MODEL_ID, {
        messages: [{ role: "user", content: text }]
    }) as any;
    return response.response;
}
