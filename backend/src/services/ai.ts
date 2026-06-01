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
  videoModelSeedance: env('AI_VIDEO_MODEL_SEEDANCE', 'seedance-2.0'),
  videoModelSora:     env('AI_VIDEO_MODEL_SORA',     'sora-2'),
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

export async function generateImage(prompt: string, opts?: { size?: string; style?: string; api_key?: string; base_url?: string; model?: string }): Promise<string> {
  let client: OpenAI;
  if (opts?.api_key) {
    client = new OpenAI({
      apiKey: opts.api_key,
      baseURL: (opts.base_url || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    });
  } else {
    client = getClient('image', 'AI_IMAGE_API_KEY', 'AI_IMAGE_BASE_URL');
  }
  const response = await client.images.generate({
    model: opts?.model || aiConfig.imageModel,
    prompt,
    n: 1,
    size: (opts?.size as any) || '1024x1024',
    style: (opts?.style as any) || 'vivid',
    response_format: 'b64_json',
  });
  const b64 = response.data![0].b64_json;
  if (!b64) throw new Error('图片生成失败: 未返回 base64 数据');
  const buffer = Buffer.from(b64, 'base64');
  const filename = `ai-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  return saveFile(buffer, filename);
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

export function downloadImage(url: string, headers?: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const reqOpts = headers ? { headers } : {};
    mod.get(url, reqOpts, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImage(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`图片下载失败: HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 100) {
          reject(new Error(`图片下载失败: 文件过小 (${buf.length} bytes)，可能是错误响应`));
          return;
        }
        const head = buf.subarray(0, 12).toString('hex');
        const isPNG = head.startsWith('89504e47');
        const isJPEG = head.startsWith('ffd8ff');
        const isWebP = head.startsWith('52494646'); // RIFF....WEBP
        const isGIF = head.startsWith('47494638');
        if (!isPNG && !isJPEG && !isWebP && !isGIF) {
          reject(new Error(`图片下载失败: 不是有效图片格式 (头部: ${head.substring(0, 8)}...)`));
          return;
        }
        resolve(buf);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function generateText(prompt: string, opts?: {
  model?: string; temperature?: number; responseFormat?: any; api_key?: string; base_url?: string; systemMessage?: string
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
  const messages: any[] = [];
  if (opts?.systemMessage) {
    messages.push({ role: 'system', content: opts.systemMessage });
  }
  messages.push({ role: 'user', content: prompt });
  const params: any = {
    model,
    messages,
    max_tokens: 65536,
  };
  // temperature 不传则用 provider 默认值，避免某些 provider 不支持
  if (opts?.temperature !== undefined) {
    params.temperature = opts.temperature;
  }
  // response_format 不是所有 provider 都支持，仅在显式传入时使用
  if (opts?.responseFormat) {
    params.response_format = opts.responseFormat;
  }

  logger.info(`LLM request: model=${model}, base_url=${client.baseURL}, prompt 长度=${params.messages[0].content.length} 字`);

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
    max_tokens: 65536,
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

/**
 * 调用 /v1/images/edits 接口生成关键帧，传入参考图片
 */
export async function generateImageEdit(
  prompt: string,
  referenceImages: { path: string; label: string }[],
  opts?: { size?: string; model?: string; quality?: string; api_key?: string; base_url?: string }
): Promise<string> {
  const apiKey = opts?.api_key || env('AI_IMAGE_API_KEY', env('AI_API_KEY'));
  if (!apiKey) throw new Error('AI 图片生成 API Key 未配置');

  let baseUrl = (opts?.base_url || env('AI_IMAGE_BASE_URL', env('AI_BASE_URL', 'https://www.packyapi.com'))).replace(/\/+$/, '');
  // If baseUrl already ends with /v1, don't double it
  const url = baseUrl.endsWith('/v1') ? `${baseUrl}/images/edits` : `${baseUrl}/v1/images/edits`;

  // Build multipart form data manually
  const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];

  const addField = (name: string, value: string) => {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ));
  };

  const addFile = (name: string, filePath: string) => {
    // File path from DB is like /uploads/xxx.png — resolve relative to uploadDir
    const fullPath = filePath.startsWith('/uploads/')
      ? path.join(uploadDir, path.basename(filePath))
      : path.resolve(filePath);
    const fileBuffer = fs.readFileSync(fullPath);
    const filename = path.basename(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeMap: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
    const mime = mimeMap[ext] || 'image/png';

    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
    ));
    parts.push(fileBuffer);
    parts.push(Buffer.from('\r\n'));
  };

  addField('model', opts?.model || 'gpt-image-2');
  addField('prompt', prompt);
  addField('size', opts?.size || '1792x1024');
  addField('quality', opts?.quality || 'high');
  addField('output_format', 'png');
  addField('response_format', 'url');

  for (const img of referenceImages) {
    addFile('image', img.path);
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  logger.info(`generateImageEdit: url=${url}, model=${opts?.model || 'gpt-image-2'}, refs=${referenceImages.length}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': '*/*',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`图片编辑 API 失败 (${response.status}): ${errText}`);
  }

  const result: any = await response.json();
  logger.info(`Image edit response keys: ${Object.keys(result).join(', ')}, data: ${JSON.stringify(result.data?.map((d: any) => ({ url: (d.url || '').slice(0, 80), has_b64: !!d.b64_json })) || 'none')}`);

  // Handle b64_json response
  if (result.data?.[0]?.b64_json) {
    const buffer = Buffer.from(result.data[0].b64_json, 'base64');
    const filename = `ai-keyframe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    return saveFile(buffer, filename);
  }

  // Handle url response — download image (signed URLs typically don't need auth)
  if (result.data?.[0]?.url) {
    const imageUrl = result.data[0].url;
    logger.info(`Downloading generated image: ${imageUrl}`);
    // Try without auth first — many CDN signed URLs reject unexpected Authorization headers
    let dlResp = await fetch(imageUrl);
    if (!dlResp.ok) {
      logger.warn(`Direct download failed (${dlResp.status}), retrying with auth header`);
      dlResp = await fetch(imageUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    }
    if (!dlResp.ok) {
      const errText = await dlResp.text().catch(() => 'Unknown');
      logger.error(`Image download failed: HTTP ${dlResp.status}, body: ${errText.slice(0, 500)}`);
      throw new Error(`图片下载失败: HTTP ${dlResp.status}`);
    }
    const imageBuffer = Buffer.from(await dlResp.arrayBuffer());
    const filename = `ai-keyframe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    return saveFile(imageBuffer, filename);
  }

  throw new Error('图片编辑 API 返回格式异常: ' + JSON.stringify(result).slice(0, 200));
}

export function saveFile(buffer: Buffer, filename: string): string {
  const dir = path.dirname(path.join(uploadDir, filename));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${filename}`;
}

/**
 * 调用 AI 视频生成 API，为单个分镜生成视频片段
 * 支持 Sora API 格式：POST /v1/videos 创建任务，GET /v1/videos/{task_id} 查询状态，GET /v1/videos/{task_id}/content 获取内容
 */
export async function generateVideoClip(
  prompt: string,
  opts?: {
    version?: 'seedance' | 'sora';
    model?: string;
    referenceImagePath?: string;
    lastFramePath?: string;
    duration?: number;
    seconds?: string;
    ratio?: string;
    resolution?: string;
    generateAudio?: boolean;
    cameraFixed?: boolean;
    api_key?: string;
    base_url?: string;
  }
): Promise<string> {
  const version = opts?.version || 'seedance';
  const apiKey = opts?.api_key || env('AI_VIDEO_API_KEY', env('AI_API_KEY'));
  if (!apiKey) throw new Error('AI 视频生成 API Key 未配置');

  let baseUrl = (opts?.base_url || env('AI_VIDEO_BASE_URL', env('AI_BASE_URL', 'https://www.packyapi.com'))).replace(/\/+$/, '');
  // 优先使用前端传入的 model，否则根据 version 从环境变量读取
  // 支持 AI_VIDEO_MODEL（通用）、AI_VIDEO_MODEL_SORA、AI_VIDEO_MODEL_SEEDANCE
  const model = opts?.model
    || (version === 'sora'
      ? env('AI_VIDEO_MODEL_SORA', env('AI_VIDEO_MODEL', 'sora-2'))
      : env('AI_VIDEO_MODEL_SEEDANCE', env('AI_VIDEO_MODEL', 'seedance-2.0')));

  const url = baseUrl.endsWith('/v1') ? `${baseUrl}/videos` : `${baseUrl}/v1/videos`;

  // 使用 FormData 构建请求（Sora API 格式）
  const formData = new FormData();

  formData.append('model', model);
  formData.append('prompt', prompt);
  formData.append('seconds', String(opts?.seconds || opts?.duration || 5));

  // 添加首帧参考图片
  if (opts?.referenceImagePath) {
    const fullPath = opts.referenceImagePath.startsWith('/uploads/')
      ? path.join(uploadDir, path.basename(opts.referenceImagePath))
      : path.resolve(opts.referenceImagePath);

    if (fs.existsSync(fullPath)) {
      const fileBuffer = fs.readFileSync(fullPath);
      const blob = new Blob([fileBuffer], { type: 'image/png' });
      formData.append('input_reference', blob, 'first_frame.png');
      logger.info(`Appended first frame: ${fullPath} (${fileBuffer.length} bytes)`);
    } else {
      logger.warn(`First frame image not found: ${fullPath}, skipping`);
    }
  }

  // 添加尾帧参考图片
  if (opts?.lastFramePath) {
    const fullPath = opts.lastFramePath.startsWith('/uploads/')
      ? path.join(uploadDir, path.basename(opts.lastFramePath))
      : path.resolve(opts.lastFramePath);

    if (fs.existsSync(fullPath)) {
      const fileBuffer = fs.readFileSync(fullPath);
      const blob = new Blob([fileBuffer], { type: 'image/png' });
      formData.append('input_reference', blob, 'last_frame.png');
      logger.info(`Appended last frame: ${fullPath} (${fileBuffer.length} bytes)`);
    } else {
      logger.warn(`Last frame image not found: ${fullPath}, skipping`);
    }
  }

  // Sora-2 不接受 1920x1080，seedance 使用宽屏尺寸
  if (version === 'seedance') {
    formData.append('size', '1920x1080');
  }

  logger.info(`generateVideoClip: url=${url}, model=${model}, version=${version}, hasFirstFrame=${!!opts?.referenceImagePath}, hasLastFrame=${!!opts?.lastFramePath}`);

  // 使用 AbortController 设置超时（60秒创建任务）
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });
  } catch (fetchErr: any) {
    clearTimeout(timeout);
    if (fetchErr.name === 'AbortError') {
      throw new Error('视频生成 API 创建任务超时（60秒），请检查网络或稍后重试');
    }
    throw fetchErr;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`视频生成 API 失败 (${response.status}): ${errText}`);
  }

  const result: any = await response.json();
  logger.info(`Video generation response: ${JSON.stringify(result).slice(0, 500)}`);

  // 尝试从各种格式中提取视频 URL
  const directUrl =
    result.data?.[0]?.url ||
    result.data?.url ||
    result.video_url ||
    result.output?.url ||
    result.output?.video_url ||
    (typeof result.url === 'string' ? result.url : null);

  if (directUrl) {
    logger.info(`Got direct video URL: ${directUrl}`);
    const dlResp = await fetch(directUrl);
    if (!dlResp.ok) {
      const errText = await dlResp.text().catch(() => 'Unknown');
      throw new Error(`视频下载失败: HTTP ${dlResp.status}, body: ${errText.slice(0, 200)}`);
    }
    const videoBuffer = Buffer.from(await dlResp.arrayBuffer());
    const filename = `ai-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    return saveFile(videoBuffer, filename);
  }

  // Handle task-based async response（Sora 异步模式）
  // 兼容 id / task_id / jobId 等字段名
  const taskId = result.id || result.task_id || result.job_id || result.taskId || result.jobId;
  if (taskId) {
    logger.info(`Video generation task created: ${taskId}, polling for completion...`);
    return await pollVideoTask(baseUrl, String(taskId), apiKey);
  }

  // 检查是否有 success/status 标记表示任务已提交
  if (result.success || result.status === 'pending' || result.status === 'processing' || result.status === 'running') {
    // 可能是异步任务但没有返回 task_id，尝试从嵌套对象中查找
    const nestedId = result.data?.id || result.data?.task_id || result.result?.id || result.result?.task_id;
    if (nestedId) {
      logger.info(`Found nested task ID: ${nestedId}, polling...`);
      return await pollVideoTask(baseUrl, String(nestedId), apiKey);
    }
    logger.warn(`API returned success but no task ID found: ${JSON.stringify(result).slice(0, 300)}`);
    throw new Error('视频任务已提交但未返回任务 ID，无法追踪状态');
  }

  throw new Error('视频生成 API 返回格式异常: ' + JSON.stringify(result).slice(0, 300));
}

async function downloadVideoFromResult(result: any, contentUrl: string, apiKey: string): Promise<string> {
  // 尝试从 /content 端点获取下载链接
  try {
    const contentResp = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (contentResp.ok) {
      const content: any = await contentResp.json();
      logger.info(`Content endpoint response: ${JSON.stringify(content).slice(0, 300)}`);
      const contentUrl2 = content.url || content.video_url || content.data?.url || content.output?.url;
      if (contentUrl2) {
        logger.info(`Got video URL from content endpoint: ${contentUrl2}`);
        const dlResp = await fetch(contentUrl2);
        if (!dlResp.ok) throw new Error(`视频下载失败: HTTP ${dlResp.status}`);
        const videoBuffer = Buffer.from(await dlResp.arrayBuffer());
        const filename = `ai-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
        return saveFile(videoBuffer, filename);
      }
    }
  } catch (contentErr: any) {
    logger.warn(`Failed to get video content, trying direct URL: ${contentErr.message}`);
  }

  // 从状态响应中提取视频 URL
  const videoUrl =
    result.video_url ||
    result.output?.url || result.output?.video_url ||
    result.data?.url || result.data?.video_url || result.data?.[0]?.url ||
    result.result?.url || result.result?.video_url ||
    result.url;
  if (!videoUrl) throw new Error('视频任务完成但无下载链接');

  logger.info(`Got video URL from status: ${videoUrl}`);
  const dlResp = await fetch(videoUrl);
  if (!dlResp.ok) throw new Error(`视频下载失败: HTTP ${dlResp.status}`);
  const videoBuffer = Buffer.from(await dlResp.arrayBuffer());
  const filename = `ai-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  return saveFile(videoBuffer, filename);
}

async function pollVideoTask(baseUrl: string, taskId: string, apiKey: string, maxRetries = 120, interval = 5000): Promise<string> {
  const base = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;

  // 尝试多种 URL 模式（不同 API 可能用不同路径）
  const statusUrls = [
    `${base}/videos/${taskId}`,
    `${base}/videos/tasks/${taskId}`,
    `${base}/tasks/${taskId}`,
  ];
  const contentUrls = [
    `${base}/videos/${taskId}/content`,
    `${base}/videos/tasks/${taskId}/content`,
  ];

  // 首次请求时探测哪个 URL 可用
  let statusUrl = statusUrls[0];
  let contentUrl = contentUrls[0];
  let urlDetected = false;

  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, interval));

    // 首次探测可用的 URL
    if (!urlDetected) {
      for (const url of statusUrls) {
        try {
          const testResp = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } });
          if (testResp.status !== 404) {
            statusUrl = url;
            // 找到对应的 content URL
            if (url.includes('/tasks/')) {
              contentUrl = `${baseUrl}/v1/tasks/${taskId}/content`;
            } else if (url.includes('/videos/tasks/')) {
              contentUrl = `${baseUrl}/v1/videos/tasks/${taskId}/content`;
            }
            urlDetected = true;
            logger.info(`Status URL detected: ${statusUrl} (status ${testResp.status})`);
            // 如果这个请求成功了，直接处理结果
            if (testResp.ok) {
              const result: any = await testResp.json();
              logger.info(`Video task ${taskId} status: ${result.status}`);
              const isSuccess = ['completed', 'succeeded', 'done', 'ready', 'finished'].includes(result.status);
              const isFailed = ['failed', 'cancelled', 'canceled', 'error'].includes(result.status);
              if (isSuccess) {
                return await downloadVideoFromResult(result, contentUrl, apiKey);
              }
              if (isFailed) {
                throw new Error(`视频任务失败: ${result.error || result.message || '未知错误'}`);
              }
            }
            break;
          }
        } catch {}
      }
      if (!urlDetected) {
        logger.warn(`All status URLs returned 404 for task ${taskId}, retry ${i + 1}/${maxRetries}`);
        continue;
      }
    }

    const resp = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) {
      logger.warn(`Video task poll ${statusUrl} failed (${resp.status}), retry ${i + 1}/${maxRetries}`);
      continue;
    }

    const result: any = await resp.json();
    logger.info(`Video task ${taskId} status: ${result.status}, response keys: ${Object.keys(result).join(',')}`);

    const isSuccess = ['completed', 'succeeded', 'done', 'ready', 'finished'].includes(result.status);
    const isFailed = ['failed', 'cancelled', 'canceled', 'error'].includes(result.status);

    if (isSuccess) {
      return await downloadVideoFromResult(result, contentUrl, apiKey);
    }

    if (isFailed) {
      throw new Error(`视频任务失败: ${result.error || result.message || '未知错误'}`);
    }
  }

  throw new Error(`视频任务超时: ${taskId}`);
}
