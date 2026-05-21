import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { getDatabase } from '../database/setup';
import { logger } from '../utils/logger';

const uploadDir = process.env.UPLOAD_DIR || './uploads';
const outputDir = path.join(uploadDir, 'videos');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 检查 FFmpeg 是否可用
let ffmpegAvailable = false;
try {
  const { execSync } = require('child_process');
  execSync('ffmpeg -version', { stdio: 'ignore' });
  ffmpegAvailable = true;
  logger.info('FFmpeg is available');
} catch {
  logger.warn('FFmpeg is not installed. Video rendering will be unavailable. Install FFmpeg to enable video generation.');
}

export function isFFmpegAvailable(): boolean {
  return ffmpegAvailable;
}

interface RenderTask {
  videoId: number;
  projectId: number;
  resolution: string;
  bgmPath?: string;
  bgmVolume?: number;
}

// 简单的内存任务队列
const queue: RenderTask[] = [];
let processing = false;

export function enqueueVideoRender(task: RenderTask): void {
  queue.push(task);
  processQueue();
}

async function processQueue(): Promise<void> {
  if (processing || queue.length === 0) return;
  processing = true;

  const task = queue.shift()!;
  try {
    await renderVideo(task);
  } catch (error) {
    logger.error(`Video render failed for video ${task.videoId}:`, error);
    updateVideoStatus(task.videoId, 'failed');
  } finally {
    processing = false;
    if (queue.length > 0) {
      processQueue();
    }
  }
}

async function renderVideo(task: RenderTask): Promise<void> {
  const { videoId, projectId, resolution, bgmPath, bgmVolume } = task;

  if (!ffmpegAvailable) {
    logger.warn(`Cannot render video ${videoId}: FFmpeg not installed`);
    updateVideoStatus(videoId, 'failed');
    return;
  }

  updateVideoStatus(videoId, 'processing');

  const db = getDatabase();

  // 获取项目数据
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    updateVideoStatus(videoId, 'failed');
    return;
  }

  const chapters = db.prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY order_index').all(projectId) as any[];
  const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];

  // 收集所有分镜
  const allStoryboards: any[] = [];
  for (const chapter of chapters) {
    const scenes = db.prepare('SELECT * FROM scenes WHERE chapter_id = ? ORDER BY order_index').all(chapter.id) as any[];
    for (const scene of scenes) {
      const storyboards = db.prepare('SELECT * FROM storyboards WHERE scene_id = ? ORDER BY order_index').all(scene.id) as any[];
      for (const sb of storyboards) {
        const dialogues = db.prepare('SELECT * FROM dialogues WHERE storyboard_id = ? ORDER BY order_index').all(sb.id) as any[];
        allStoryboards.push({ ...sb, dialogues, sceneTitle: scene.title, chapterTitle: chapter.title });
      }
    }
  }

  if (allStoryboards.length === 0) {
    logger.warn(`No storyboards found for project ${projectId}`);
    updateVideoStatus(videoId, 'failed');
    return;
  }

  // 解析分辨率
  const [width, height] = parseResolution(resolution);

  // 生成每帧图片（带文字叠加）
  const frameDir = path.join(outputDir, `temp-${videoId}`);
  if (!fs.existsSync(frameDir)) {
    fs.mkdirSync(frameDir, { recursive: true });
  }

  const frameFiles: string[] = [];

  for (let i = 0; i < allStoryboards.length; i++) {
    const sb = allStoryboards[i];
    const framePath = path.join(frameDir, `frame-${String(i).padStart(4, '0')}.png`);
    const basePath = path.join(frameDir, `base-${String(i).padStart(4, '0')}.png`);

    // 如果分镜有图片，使用图片；否则生成纯色帧
    if (sb.image_url && fs.existsSync(sb.image_url)) {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(sb.image_url)
          .size(`${width}x${height}`)
          .output(basePath)
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });
    } else {
      await generateTextFrame(basePath, width, height, sb);
    }

    // 叠加对话字幕
    if (sb.dialogues && sb.dialogues.length > 0) {
      await overlayDialogues(basePath, framePath, width, height, sb.dialogues);
    } else {
      fs.copyFileSync(basePath, framePath);
    }

    frameFiles.push(framePath);
  }

  // 合成视频
  const outputPath = path.join(outputDir, `video-${videoId}.mp4`);
  const duration = allStoryboards.reduce((sum, sb) => sum + (sb.duration || 5), 0);

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg();

    // 添加所有帧
    for (let i = 0; i < frameFiles.length; i++) {
      command.input(frameFiles[i].replace(/\\/g, '/'));
    }

    // 构建 xfade 滤镜链
    const hasTransitions = allStoryboards.some(sb => sb.transition_type && sb.transition_type !== 'cut');

    if (frameFiles.length === 1) {
      // 单帧：直接循环
      const sb = allStoryboards[0];
      command.inputOptions(['-loop', '1', '-t', String(sb.duration || 5)]);
      command.outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24', '-y']);
    } else if (hasTransitions) {
      // 多帧带转场：使用 xfade 滤镜链
      const filterParts: string[] = [];
      let cumulativeOffset = 0;
      let lastLabel = '[0:v]';

      for (let i = 1; i < frameFiles.length; i++) {
        const prevSb = allStoryboards[i - 1];
        const currSb = allStoryboards[i];
        const prevDur = prevSb.duration || 5;
        const transType = prevSb.transition_type || 'cut';
        const transDur = transType === 'cut' ? 0 : (prevSb.transition_duration || 0.5);
        cumulativeOffset += prevDur - transDur;
        const outLabel = i === frameFiles.length - 1 ? '[vout]' : `[v${i}]`;

        if (transType === 'cut' || transDur === 0) {
          // 无转场：concat
          filterParts.push(`${lastLabel}[${i}:v]concat=n=2:v=1:a=0${outLabel}`);
        } else {
          filterParts.push(`${lastLabel}[${i}:v]xfade=transition=${transType}:duration=${transDur}:offset=${cumulativeOffset}${outLabel}`);
        }
        lastLabel = outLabel;
      }

      command.complexFilter(filterParts);
      command.outputOptions(['-map', '[vout]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24', '-y']);
    } else {
      // 多帧无转场：concat
      for (let i = 0; i < frameFiles.length; i++) {
        command.inputOptions(['-t', String(allStoryboards[i].duration || 5)]);
      }
      const filter = frameFiles.map((_, i) => `[${i}:v]`).join('') + `concat=n=${frameFiles.length}:v=1:a=0[out]`;
      command.complexFilter([filter]);
      command.outputOptions(['-map', '[out]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24', '-y']);
    }

    command
      .on('start', (cmd: string) => {
        logger.info(`Video render started for video ${videoId}: ${cmd}`);
      })
      .on('progress', (progress: any) => {
        if (progress.percent) {
          logger.info(`Video ${videoId} render progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        logger.info(`Video ${videoId} render completed`);
        resolve();
      })
      .on('error', (err: Error) => {
        logger.error(`Video ${videoId} render error:`, err);
        reject(err);
      })
      .save(outputPath);
  });

  // 混合背景音乐
  if (bgmPath && fs.existsSync(bgmPath)) {
    const tempOutput = path.join(outputDir, `video-${videoId}-bgm.mp4`);
    const volume = bgmVolume ?? 0.5;
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(outputPath)
        .inputOptions(['-stream_loop', '-1'])
        .input(bgmPath)
        .outputOptions([
          '-filter_complex', `[1:a]volume=${volume}[a];[0:a][a]amix=inputs=2:duration=first[mixout]`,
          '-map', '0:v',
          '-map', '[mixout]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-shortest',
          '-y',
        ])
        .on('end', () => {
          fs.renameSync(tempOutput, outputPath);
          resolve();
        })
        .on('error', (err: Error) => {
          logger.warn(`BGM mixing failed for video ${videoId}, using video without audio:`, err.message);
          resolve(); // continue without BGM
        })
        .save(tempOutput);
    });
  }

  // 更新视频记录
  const videoPath = `/uploads/videos/video-${videoId}.mp4`;
  const thumbnailPath = await generateThumbnail(outputPath, videoId);

  const db2 = getDatabase();
  db2.prepare(`
    UPDATE videos SET status = ?, file_path = ?, thumbnail = ?, duration = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run('completed', videoPath, thumbnailPath, duration, videoId);

  // 清理临时文件
  try {
    const tempFiles = fs.readdirSync(frameDir);
    for (const f of tempFiles) {
      fs.unlinkSync(path.join(frameDir, f));
    }
    if (fs.existsSync(frameDir)) fs.rmdirSync(frameDir);
  } catch {}

  logger.info(`Video ${videoId} rendered successfully: ${videoPath}`);
}

function updateVideoStatus(videoId: number, status: string): void {
  try {
    const db = getDatabase();
    db.prepare('UPDATE videos SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, videoId);
  } catch (error) {
    logger.error(`Failed to update video ${videoId} status:`, error);
  }
}

function parseResolution(resolution: string): [number, number] {
  const map: Record<string, [number, number]> = {
    '480p': [854, 480],
    '720p': [1280, 720],
    '1080p': [1920, 1080],
  };
  return map[resolution] || [1280, 720];
}

async function generateTextFrame(outputPath: string, width: number, height: number, sb: any): Promise<void> {
  // 使用 FFmpeg 的 drawtext 滤镜生成带文字的帧
  const title = (sb.title || '').replace(/'/g, "\\'").replace(/:/g, '\\:');
  const desc = (sb.description || '').substring(0, 80).replace(/'/g, "\\'").replace(/:/g, '\\:');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=#1a1a2e:s=' + width + 'x' + height)
      .inputOptions(['-f', 'lavfi', '-t', '1'])
      .videoFilters([
        `drawtext=text='${title}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40`,
        `drawtext=text='${desc}':fontsize=20:fontcolor=#aaaaaa:x=(w-text_w)/2:y=(h-text_h)/2+20`,
      ])
      .outputOptions(['-frames:v', '1', '-y'])
      .on('end', () => resolve())
      .on('error', reject)
      .save(outputPath);
  });
}

async function overlayDialogues(
  inputPath: string, outputPath: string, width: number, height: number, dialogues: any[]
): Promise<void> {
  const filters = dialogues.map((d, i) => {
    const text = (d.content || '').replace(/'/g, "\\'").replace(/:/g, '\\:');
    const x = `(${d.position_x || 50}/100)*w-tw/2`;
    const y = `(${d.position_y || 85}/100)*h-th/2`;
    const fontSize = d.style === 'shout' ? 28 : d.style === 'whisper' ? 16 : 22;
    const fontColor = d.style === 'shout' ? 'yellow' : d.style === 'whisper' ? '#cccccc' : 'white';
    return `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:x=${x}:y=${y}:borderw=2:bordercolor=black`;
  });

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(filters)
      .outputOptions(['-y'])
      .on('end', () => resolve())
      .on('error', reject)
      .save(outputPath);
  });
}

async function generateThumbnail(videoPath: string, videoId: number): Promise<string> {
  const thumbPath = path.join(outputDir, `thumb-${videoId}.jpg`);
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({ timestamps: [0.5], filename: `thumb-${videoId}.jpg`, folder: outputDir, size: '320x180' })
      .on('end', () => resolve(`/uploads/videos/thumb-${videoId}.jpg`))
      .on('error', reject);
  });
}
