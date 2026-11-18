import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { GoogleGenAI } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Token နှင့် API Key များ တိုက်ရိုက်ထည့်သွင်းထားပါသည်
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(BOT_TOKEN);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const userVoices = new Map();
const DEFAULT_VOICE = 'my-MM-ThihaNeural'; // အမျိုးသားအသံ (မောင်ကျော်သူ / သီဟ)
const FEMALE_VOICE = 'my-MM-NilarNeural';  // အမျိုးသမီးအသံ (မဆုမြတ် / နီလာ)

async function generateMyanmarTTS(text, voiceName, outputPath) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  await tts.toFile(outputPath, text);
}

bot.start((ctx) => {
  ctx.reply(
    `🎬 **ATM Movie - Cloud Subtitle & Voice Studio Bot**\n\n` +
    `📌 **အသုံးပြုပုံ:**\n` +
    `• မြန်မာစာသား ပို့ပေးပါက **MP3 အသံဖိုင်** ထုတ်ပေးပါမည်။\n` +
    `• **.SRT ဖိုင်** ပို့ပေးပါက Gemini AI ဖြင့် စာတန်းထိုး ပြင်ဆင်ပေးပါမည်။\n\n` +
    `အောက်ပါခလုတ်များဖြင့် အသံရွေးချယ်ပါ 👇`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('👨 အမျိုးသားအသံ (Thiha)', 'VOICE_MALE'),
          Markup.button.callback('👩 အမျိုးသမီးအသံ (Nilar)', 'VOICE_FEMALE')
        ]
      ])
    }
  );
});

bot.action('VOICE_MALE', (ctx) => {
  userVoices.set(ctx.from.id, DEFAULT_VOICE);
  ctx.answerCbQuery('အမျိုးသားအသံ ရွေးချယ်ပြီးပါပြီ။');
  ctx.reply('✅ လက်ရှိအသံ: **my-MM-ThihaNeural**', { parse_mode: 'Markdown' });
});

bot.action('VOICE_FEMALE', (ctx) => {
  userVoices.set(ctx.from.id, FEMALE_VOICE);
  ctx.answerCbQuery('အမျိုးသမီးအသံ ရွေးချယ်ပြီးပါပြီ။');
  ctx.reply('✅ လက်ရှိအသံ: **my-MM-NilarNeural**', { parse_mode: 'Markdown' });
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  const voice = userVoices.get(ctx.from.id) || DEFAULT_VOICE;
  const tempFile = path.join('/tmp', `tts_${ctx.from.id}_${Date.now()}.mp3`);

  try {
    const statusMsg = await ctx.reply('🎙️ အသံဖိုင် ထုတ်လုပ်နေပါသည်...');
    await generateMyanmarTTS(text, voice, tempFile);

    await ctx.replyWithAudio(
      { source: tempFile, filename: 'ATM_Voiceover.mp3' },
      { caption: `🗣️ Voice: ${voice}` }
    );

    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
  } catch (error) {
    console.error('TTS Error:', error);
    ctx.reply('❌ အသံထုတ်လုပ်ရာတွင် အမှားအယွင်း ဖြစ်ပေါ်ပါသည်။');
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

bot.on('document', async (ctx) => {
  const doc = ctx.message.document;
  if (!doc.file_name.endsWith('.srt')) {
    return ctx.reply('⚠️ `.srt` ဖိုင်ကိုသာ ပေးပို့ပါ။');
  }

  const outputSrtPath = path.join('/tmp', `cleaned_${doc.file_name}`);

  try {
    await ctx.reply('⏳ SRT ဖိုင်ကို Gemini AI ဖြင့် ပြုပြင်နေပါသည်...');
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const response = await fetch(fileLink.href);
    const srtContent = await response.text();

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a professional Burmese movie subtitle editor. Clean up, fix grammar, and make the Burmese dialogue natural for voiceover while strictly keeping the exact SRT timestamps and numbering intact:\n\n${srtContent}`
    });

    fs.writeFileSync(outputSrtPath, aiResponse.text, 'utf-8');

    await ctx.replyWithDocument(
      { source: outputSrtPath, filename: `Cleaned_${doc.file_name}` },
      { caption: '✅ Subtitle ပြင်ဆင်မှု ပြီးစီးပါပြီ။' }
    );
  } catch (error) {
    console.error('SRT Error:', error);
    ctx.reply('❌ SRT ဖိုင် ပြင်ဆင်ရာတွင် အမှားအယွင်း ဖြစ်ပေါ်ပါသည်။');
  } finally {
    if (fs.existsSync(outputSrtPath)) fs.unlinkSync(outputSrtPath);
  }
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ATM Movie Telegram Bot is running!\n');
});

server.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});

bot.launch()
  .then(() => console.log('🤖 Telegram Bot စတင်အလုပ်လုပ်နေပါပြီ...'))
  .catch((err) => console.error('Bot Launch Failed:', err));

process.once('SIGINT', () => { bot.stop('SIGINT'); server.close(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });