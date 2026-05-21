import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { logger } from '../utils/logger';

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

function env(key: string, fallback?: string): string {
  return process.env[key] || fallback || '';
}

// 懒初始化：只在首次使用时创建 client，避免无 key 时启动报错
const clients: Record<string, OpenAI> = {};

function getClient(name: string, apiKeyEnv: string, baseUrlEnv: string): OpenAI {
  if (!clients[name]) {
    clients[name] = new OpenAI({
      apiKey: env(apiKeyEnv, env('AI_API_KEY')),
      baseURL: env(baseUrlEnv, env('AI_BASE_URL', 'https://api.openai.com/v1')),
    });
  }
  return clients[name];
}

export const aiConfig = {
  textModel:    env('AI_TEXT_MODEL',    'gpt-4o'),
  imageModel:   env('AI_IMAGE_MODEL',   'dall-e-3'),
  videoModel:   env('AI_VIDEO_MODEL',   'sora'),
  ttsModel:     env('AI_TTS_MODEL',     'tts-1'),
  ttsVoice:     env('AI_TTS_VOICE',     'alloy'),
};

export function isAIConfigured(): boolean {
  return !!(env('AI_TEXT_API_KEY')  || env('AI_IMAGE_API_KEY') ||
            env('AI_VIDEO_API_KEY') || env('AI_TTS_API_KEY')   || env('AI_API_KEY'));
}

export function isTextConfigured(): boolean  { return !!(env('AI_TEXT_API_KEY')  || env('AI_API_KEY')); }
export function isImageConfigured(): boolean { return !!(env('AI_IMAGE_API_KEY') || env('AI_API_KEY')); }
export function isVideoConfigured(): boolean { return !!(env('AI_VIDEO_API_KEY') || env('AI_API_KEY')); }
export function isTTSConfigured(): boolean   { return !!(env('AI_TTS_API_KEY')   || env('AI_API_KEY')); }

export async function generateImage(prompt: string, opts?: { size?: string; style?: string }): Promise<string> {
  const client = getClient('image', 'AI_IMAGE_API_KEY', 'AI_IMAGE_BASE_URL');
  const response = await client.images.generate({
    model: aiConfig.imageModel,
    prompt,
    n: 1,
    size: (opts?.size as any) || '1024x1024',
    style: (opts?.style as any) || 'vivid',
    response_format: 'url',
  });
  return response.data![0].url!;
}

export async function generateSpeech(text: string, opts?: { voice?: string }): Promise<Buffer> {
  const client = getClient('tts', 'AI_TTS_API_KEY', 'AI_TTS_BASE_URL');
  const response = await client.audio.speech.create({
    model: aiConfig.ttsModel,
    voice: (opts?.voice as any) || aiConfig.ttsVoice,
    input: text,
    response_format: 'mp3',
  });
  return Buffer.from(await response.arrayBuffer());
}

export function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function generateText(prompt: string, opts?: {
  model?: string; temperature?: number; responseFormat?: any; api_key?: string; base_url?: string
}): Promise<string> {
  let client: OpenAI;
  if (opts?.api_key) {
    client = new OpenAI({
      apiKey: opts.api_key,
      baseURL: (opts.base_url || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    });
  } else {
    client = getClient('text', 'AI_TEXT_API_KEY', 'AI_TEXT_BASE_URL');
  }
  const model = opts?.model || aiConfig.textModel;
  const params: any = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 16384,
  };
  // temperature 不传则用 provider 默认值，避免某些 provider 不支持
  if (opts?.temperature !== undefined) {
    params.temperature = opts.temperature;
  }
  // response_format 不是所有 provider 都支持，仅在显式传入时使用
  if (opts?.responseFormat) {
    params.response_format = opts.responseFormat;
  }

  logger.info(`LLM request: model=${model}, base_url=${client.baseURL}`);

  try {
    const response = await client.chat.completions.create(params);
    const content = response.choices[0].message.content || '';
    logger.info(`LLM response: ${content.substring(0, 200)}...`);
    return content;
  } catch (err: any) {
    logger.error(`LLM error: status=${err.status}, message=${err.message}`, {
      model,
      base_url: client.baseURL,
      code: err.code,
      type: err.type,
    });
    throw err;
  }
}

/**
 * 流式生成文本，返回 async generator 逐块 yield
 */
export async function* generateTextStream(
  prompt: string,
  opts?: { model?: string; temperature?: number; api_key?: string; base_url?: string }
): AsyncGenerator<string> {
  let client: OpenAI;
  if (opts?.api_key) {
    client = new OpenAI({
      apiKey: opts.api_key,
      baseURL: (opts.base_url || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    });
  } else {
    client = getClient('text', 'AI_TEXT_API_KEY', 'AI_TEXT_BASE_URL');
  }
  const model = opts?.model || aiConfig.textModel;
  const params: any = {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    max_tokens: 16384,
  };
  if (opts?.temperature !== undefined) {
    params.temperature = opts.temperature;
  }

  logger.info(`LLM stream request: model=${model}, base_url=${client.baseURL}`);

  try {
    const stream = (await client.chat.completions.create(params)) as any;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  } catch (err: any) {
    logger.error(`LLM stream error: status=${err.status}, message=${err.message}`, {
      model,
      base_url: client.baseURL,
      code: err.code,
      type: err.type,
    });
    throw err;
  }
}

/**
 * 测试文本 AI 连接是否可用
 */
export async function testTextConnection(customModel?: string, opts?: {
  api_key?: string; base_url?: string
}): Promise<{
  ok: boolean; model: string; base_url: string; error?: string; hint?: string
}> {
  let client: OpenAI;
  if (opts?.api_key) {
    client = new OpenAI({
      apiKey: opts.api_key,
      baseURL: (opts.base_url || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    });
  } else {
    client = getClient('text', 'AI_TEXT_API_KEY', 'AI_TEXT_BASE_URL');
  }
  const model = customModel || aiConfig.textModel;
  const baseUrl = client.baseURL;

  logger.info(`Testing text AI: model=${model}, base_url=${baseUrl}`);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Hi, reply with just "ok"' }],
      max_tokens: 10,
    });
    return { ok: true, model, base_url: String(baseUrl) };
  } catch (err: any) {
    logger.error(`Text AI test failed: status=${err.status}, message=${err.message}`);

    let hint = '';
    if (err.status === 400) {
      hint = `模型 "${model}" 可能不被当前 provider 支持。请到设置页面点击「获取模型列表」查看可用模型，或检查 API Key 是否正确。`;
    } else if (err.status === 401) {
      hint = 'API Key 无效或已过期，请检查配置。';
    } else if (err.status === 429) {
      hint = '请求过于频繁，请稍后再试。';
    } else if (err.message?.includes('fetch failed') || err.message?.includes('ECONNREFUSED')) {
      hint = `无法连接到 ${baseUrl}，请检查 Base URL 是否正确。`;
    }

    return {
      ok: false,
      model,
      base_url: String(baseUrl),
      error: `${err.status || ''}: ${err.message}`,
      hint,
    };
  }
}

export function saveFile(buffer: Buffer, filename: string): string {
  const audioDir = path.join(uploadDir, 'audio');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${filename}`;
}
