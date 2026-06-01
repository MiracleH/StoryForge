import { Response } from 'express';
import path from 'path';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { getDatabase } from '../database/setup';
import { analyzeScriptWithLLM, analyzeScriptWithLLMStream, reviewScriptWithLLM, reviseScriptWithLLM, reviseScriptWithLLMStream, reviewScriptWithLLMStream } from '../services/llm-analysis';
import { processAssetQueue, processAssetQueueForEpisode, generateAssetAudio } from '../services/asset-generator';
import { generateImage } from '../services/ai';
import { generateStoryboardsForProject, generateStoryboardsForProjectStream, generateStoryboardsForEpisode } from '../services/storyboard-generator';
import { generateSeedanceStoryboardsForEpisode } from '../services/seedance-storyboard-generator';
import { generateSoraStoryboardsForEpisode } from '../services/sora-storyboard-generator';
import { createKeyframeCardsForEpisode } from '../services/keyframe-card-creator';
import { createVideoClipsForEpisode } from '../services/video-clip-creator';
import { generateImageEdit, generateVideoClip } from '../services/ai';
import { generateKeyframes, generateKeyframesForEpisode } from '../services/keyframe-composer';
import { transitionWorkflow, setWorkflowError, getWorkflowState, resetWorkflow,
         transitionWorkflowEpisode, setWorkflowErrorEpisode, getWorkflowStateEpisode, resetWorkflowEpisode } from '../services/workflow';
import { EpisodeModel } from '../models/episode';
import { WorkflowTaskModel } from '../models/workflow-task';
import { GeneratedAssetModel } from '../models/generated-asset';
import { VideoModel } from '../models/video';
import { enqueueVideoRender, isFFmpegAvailable, mergeVideoClips } from '../services/videoRenderer';
import { logger } from '../utils/logger';

function verifyOwnership(projectId: number, userId: number): any {
  const db = getDatabase();
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  if (!project) throw createError('Project not found', 404);
  return project;
}

function getLLMOpts(req: AuthRequest) {
  const { api_key, base_url, model } = req.body || {};
  return { api_key, base_url, model };
}

function getImageOpts(req: AuthRequest) {
  const { api_key, base_url, model } = req.body || {};
  return { api_key, base_url, model };
}

/** 设置 SSE 响应头 */
function initSSE(res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

/** 发送 SSE 事件 */
function sendSSE(res: Response, event: string, data: any) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // 强制 flush，防止 compression 中间件缓冲
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
}

export const WorkflowController = {
  /**
   * Stage 1: 分析 (SSE 流式)
   */
  async analyze(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const project = verifyOwnership(projectId, req.user!.id) as any;

    if (!project.novel_text) {
      throw createError('项目没有小说文本，请先导入或输入文本', 400);
    }

    const state = getWorkflowState(projectId);
    const from = state?.state || 'idle';

    // 允许从 idle/failed/analyzing（卡住的状态）重新开始分析
    if (from !== 'idle' && from !== 'failed' && from !== 'analyzing') {
      throw createError(`工作流当前状态为 ${from}，无法开始分析`, 400);
    }

    // 如果是 analyzing/failed 状态，强制重置到 idle 再转换
    if (from === 'analyzing' || from === 'failed') {
      const db = getDatabase();
      db.prepare("UPDATE projects SET workflow_state = 'idle', workflow_error = NULL WHERE id = ?").run(projectId);
      if (!transitionWorkflow(projectId, 'idle', 'analyzing')) {
        throw createError('状态转换失败', 500);
      }
    } else {
      if (!transitionWorkflow(projectId, from as any, 'analyzing')) {
        throw createError('状态转换失败', 500);
      }
    }

    const llmOpts = getLLMOpts(req);

    initSSE(res);

    try {
      const db = getDatabase();
      const stylePreset = project.style_preset || 'anime';

      db.prepare('DELETE FROM chapters WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM characters WHERE project_id = ?').run(projectId);

      sendSSE(res, 'status', { message: '正在分析剧本...' });

      const result = await analyzeScriptWithLLMStream(project.novel_text, stylePreset, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      });

      sendSSE(res, 'status', { message: '正在保存分析结果...' });

      for (const chapter of result.chapters) {
        const chResult = db.prepare(
          'INSERT INTO chapters (project_id, title, content, order_index) VALUES (?, ?, ?, ?)'
        ).run(projectId, chapter.title, chapter.content, chapter.order_index);
        const chapterId = chResult.lastInsertRowid;

        if (Array.isArray(chapter.scenes)) {
          for (const scene of chapter.scenes) {
            const scResult = db.prepare(
              'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
            const sceneId = scResult.lastInsertRowid;

            if (Array.isArray(scene.storyboards)) {
              for (const sb of scene.storyboards) {
                db.prepare(
                  'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
              }
            }
          }
        }
      }

      db.prepare("DELETE FROM characters WHERE project_id = ?").run(projectId);
      for (const char of result.characters) {
        db.prepare(
          'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(projectId, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
      }

      db.prepare("DELETE FROM props WHERE project_id = ?").run(projectId);
      const seenProps = new Set<string>();
      for (const prop of (result.props || [])) {
        if (seenProps.has(prop.name)) continue;
        seenProps.add(prop.name);
        db.prepare(
          'INSERT INTO props (project_id, name, description, image_prompt) VALUES (?, ?, ?, ?)'
        ).run(projectId, prop.name, prop.description, prop.image_prompt);
      }

      for (const dialogue of result.dialogues) {
        const sb = db.prepare(`
          SELECT sb.id FROM storyboards sb
          JOIN scenes s ON sb.scene_id = s.id
          JOIN chapters c ON s.chapter_id = c.id
          WHERE c.project_id = ? AND c.order_index = ? AND s.order_index = ? AND sb.order_index = ?
        `).get(projectId, dialogue.chapter_index, dialogue.scene_index, dialogue.storyboard_index) as any;

        if (sb) {
          const char = db.prepare(
            'SELECT id FROM characters WHERE project_id = ? AND name = ?'
          ).get(projectId, dialogue.character_name) as any;

          db.prepare(
            'INSERT INTO dialogues (storyboard_id, character_id, content, emotion, action_description, style, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(sb.id, char?.id || null, dialogue.content, dialogue.emotion, dialogue.action_description, dialogue.style || 'speech', 0);
        }
      }

      // 保存漫剧剧本
      if (result.script) {
        db.prepare('UPDATE projects SET script = ? WHERE id = ?').run(result.script, projectId);
        logger.info(`Script saved for project ${projectId}`);
      }

      transitionWorkflow(projectId, 'analyzing', 'reviewing');
      db.prepare("UPDATE projects SET status = 'in_progress' WHERE id = ?").run(projectId);

      sendSSE(res, 'done', {
        state: 'reviewing',
        chapters: result.chapters.length,
        characters: result.characters.length,
      });

      logger.info(`Analysis completed for project ${projectId}: ${result.chapters.length} chapters, ${result.characters.length} chars`);
    } catch (err: any) {
      const errMsg = err.message || String(err);
      let hint = '';
      if (errMsg.includes('400') || errMsg.includes('Param Incorrect')) {
        hint = '。请到设置页面检查文本 AI 配置';
      }
      setWorkflowError(projectId, errMsg + hint);
      sendSSE(res, 'error', { message: errMsg + hint });
    }

    res.end();
  },



  /**
   * 用户修改剧本 (SSE 流式)
   */
  async reviseScript(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    if (!state || state.state !== 'reviewing') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法修改`, 400);
    }

    const { feedback } = req.body;
    if (!feedback) throw createError('请提供修改意见', 400);

    const llmOpts = getLLMOpts(req);

    initSSE(res);

    try {
      const db = getDatabase();
      const project = db.prepare('SELECT script, novel_text FROM projects WHERE id = ?').get(projectId) as any;
      if (!project.script) throw createError('没有剧本可供修改', 400);
      const existingChars = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];

      const revised = await reviseScriptWithLLMStream(project.script, feedback, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      }, existingChars);

      sendSSE(res, 'status', { message: '正在保存修改结果...' });

      db.prepare('DELETE FROM chapters WHERE project_id = ?').run(projectId);

      // 获取已有角色名字，避免重复插入
      const existingCharNames = new Set(existingChars.map((c: any) => c.name));

      for (const chapter of revised.chapters) {
        const chResult = db.prepare(
          'INSERT INTO chapters (project_id, title, content, order_index) VALUES (?, ?, ?, ?)'
        ).run(projectId, chapter.title, chapter.content, chapter.order_index);
        const chapterId = chResult.lastInsertRowid;

        if (Array.isArray(chapter.scenes)) {
          for (const scene of chapter.scenes) {
            const scResult = db.prepare(
              'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
            const sceneId = scResult.lastInsertRowid;

            if (Array.isArray(scene.storyboards)) {
              for (const sb of scene.storyboards) {
                db.prepare(
                  'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
              }
            }
          }
        }
      }

      for (const char of revised.characters) {
        if (!existingCharNames.has(char.name)) {
          db.prepare(
            'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(projectId, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
        }
      }

      // 保存修改后的剧本
      db.prepare('UPDATE projects SET script = ? WHERE id = ?').run(revised.script, projectId);

      sendSSE(res, 'status', { message: '正在 AI 审核...' });

      const review = await reviewScriptWithLLM(revised.script, project.novel_text, llmOpts);

      sendSSE(res, 'done', {
        state: 'reviewing',
        chapters: revised.chapters.length,
        characters: revised.characters.length,
        dialogues: revised.dialogues.length,
        review: {
          approved: review.approved,
          issues: review.issues,
          suggestions: review.suggestions,
        },
      });
    } catch (err: any) {
      setWorkflowError(projectId, err.message);
      sendSSE(res, 'error', { message: `剧本修改失败: ${err.message}` });
    }

    res.end();
  },

  /**
   * 流式 AI 审核 (SSE)
   */
  async reviewScript(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    if (!state || state.state !== 'reviewing') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法审核`, 400);
    }

    const llmOpts = getLLMOpts(req);

    initSSE(res);

    try {
      const db = getDatabase();
      const project = db.prepare('SELECT script, novel_text FROM projects WHERE id = ?').get(projectId) as any;
      if (!project.script) throw createError('没有剧本可供审核', 400);

      const review = await reviewScriptWithLLMStream(project.script, project.novel_text, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      });

      sendSSE(res, 'done', {
        state: 'reviewing',
        review: {
          approved: review.approved,
          issues: review.issues,
          suggestions: review.suggestions,
        },
      });
    } catch (err: any) {
      sendSSE(res, 'error', { message: `审核失败: ${err.message}` });
    }

    res.end();
  },

  /**
   * 一键 AI 修正 (SSE 流式): 审核 + 自动应用修改
   */
  async applyReview(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    if (!state || state.state !== 'reviewing') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法执行`, 400);
    }

    const llmOpts = getLLMOpts(req);

    initSSE(res);

    try {
      const db = getDatabase();
      const project = db.prepare('SELECT script, novel_text FROM projects WHERE id = ?').get(projectId) as any;
      if (!project.script) throw createError('没有剧本可供审核', 400);

      const existingChars = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];

      // Step 1: 审核剧本
      sendSSE(res, 'status', { message: '正在审核剧本...' });
      const review = await reviewScriptWithLLMStream(project.script, project.novel_text, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      });

      if (review.approved) {
        sendSSE(res, 'done', {
          state: 'reviewing',
          review: { approved: true, issues: [], suggestions: [] },
          message: '审核通过，无需修改',
        });
      } else {
        // Step 2: 自动修正
        const feedback = [
          '请修复以下问题：',
          ...(review.issues || []).map((s: string) => `- ${s}`),
          '建议：',
          ...(review.suggestions || []).map((s: string) => `- ${s}`),
        ].join('\n');

        sendSSE(res, 'status', { message: '正在自动修正...' });

        const revised = await reviseScriptWithLLMStream(project.script, feedback, llmOpts, (chunk) => {
          sendSSE(res, 'chunk', { text: chunk });
        }, existingChars);

        sendSSE(res, 'status', { message: '正在保存修正结果...' });

        // 保存修改结果
        db.prepare('DELETE FROM chapters WHERE project_id = ?').run(projectId);

        const existingCharNamesApply = new Set(existingChars.map((c: any) => c.name));

        for (const chapter of revised.chapters) {
          const chResult = db.prepare(
            'INSERT INTO chapters (project_id, title, content, order_index) VALUES (?, ?, ?, ?)'
          ).run(projectId, chapter.title, chapter.content, chapter.order_index);
          const chapterId = chResult.lastInsertRowid;

          if (Array.isArray(chapter.scenes)) {
            for (const scene of chapter.scenes) {
              const scResult = db.prepare(
                'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
              const sceneId = scResult.lastInsertRowid;

              if (Array.isArray(scene.storyboards)) {
                for (const sb of scene.storyboards) {
                  db.prepare(
                    'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
                  ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
                }
              }
            }
          }
        }

        for (const char of revised.characters) {
          if (!existingCharNamesApply.has(char.name)) {
            db.prepare(
              'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(projectId, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
          }
        }

        // 保存修改后的剧本
        db.prepare('UPDATE projects SET script = ? WHERE id = ?').run(revised.script, projectId);

        // 清除旧对白并重新插入
        db.prepare(`
          DELETE FROM dialogues WHERE storyboard_id IN (
            SELECT sb.id FROM storyboards sb
            JOIN scenes s ON sb.scene_id = s.id
            JOIN chapters c ON s.chapter_id = c.id
            WHERE c.project_id = ?
          )
        `).run(projectId);

        for (const dialogue of revised.dialogues) {
          const sb = db.prepare(`
            SELECT sb.id FROM storyboards sb
            JOIN scenes s ON sb.scene_id = s.id
            JOIN chapters c ON s.chapter_id = c.id
            WHERE c.project_id = ? AND c.order_index = ? AND s.order_index = ? AND sb.order_index = ?
          `).get(projectId, dialogue.chapter_index, dialogue.scene_index, dialogue.storyboard_index) as any;

          if (sb) {
            const char = db.prepare('SELECT id FROM characters WHERE project_id = ? AND name = ?').get(projectId, dialogue.character_name) as any;
            db.prepare(
              'INSERT INTO dialogues (storyboard_id, character_id, content, emotion, action_description, style, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(sb.id, char?.id || null, dialogue.content, dialogue.emotion, dialogue.action_description, dialogue.style || 'speech', 0);
          }
        }

        sendSSE(res, 'done', {
          state: 'reviewing',
          chapters: revised.chapters.length,
          characters: revised.characters.length,
          dialogues: revised.dialogues.length,
          review: { approved: false, issues: review.issues, suggestions: review.suggestions },
          message: '已自动修正',
        });
      }
    } catch (err: any) {
      setWorkflowError(projectId, err.message);
      sendSSE(res, 'error', { message: `一键修正失败: ${err.message}` });
    }

    res.end();
  },

  /**
   * 用户确认通过 → 进入素材生成
   */
  async approveScript(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    if (!state || state.state !== 'reviewing') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法确认`, 400);
    }

    if (!transitionWorkflow(projectId, 'reviewing', 'assets_ready')) {
      throw createError('状态转换失败', 500);
    }

    res.json({
      success: true,
      data: { state: 'assets_ready', message: '剧本已确认，可以开始生成素材' },
    });
  },

  /** 返回审核状态，重新修改剧本 */
  async backToReview(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    if (!state || state.state !== 'assets_ready') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法返回审核`, 400);
    }

    if (!transitionWorkflow(projectId, 'assets_ready', 'reviewing')) {
      throw createError('状态转换失败', 500);
    }

    res.json({ success: true, data: { state: 'reviewing', message: '已返回剧本审核' } });
  },

  /**
   * Stage 2: 创建素材卡片（不生成图片）
   */
  async createAssets(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    const currentState = state?.state || 'idle';
    if (currentState !== 'reviewing' && currentState !== 'assets_ready' && currentState !== 'failed') {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成剧本审核`, 400);
    }

    if (!transitionWorkflow(projectId, currentState as any, 'generating_assets')) {
      throw createError('状态转换失败', 500);
    }

    const db = getDatabase();
    const project = db.prepare('SELECT style_preset FROM projects WHERE id = ?').get(projectId) as any;
    const stylePreset = project?.style_preset || 'anime';

    const { buildCharacterSheetPrompt, buildSceneSheetPrompt, buildPropSheetPrompt } = require('../services/style-consistency');

    const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];
    const scenes = db.prepare(
      'SELECT s.* FROM scenes s JOIN chapters c ON s.chapter_id = c.id WHERE c.project_id = ?'
    ).all(projectId) as any[];

    let characterCount = 0;
    let sceneCount = 0;

    for (const char of characters) {
      const existing = db.prepare(
        "SELECT id FROM generated_assets WHERE project_id = ? AND asset_type = 'character_design' AND entity_id = ? AND entity_type = 'character'"
      ).get(projectId, char.id);
      if (!existing) {
        GeneratedAssetModel.create({
          project_id: projectId, asset_type: 'character_design', entity_type: 'character', entity_id: char.id,
          name: char.name, description: char.description,
          prompt: buildCharacterSheetPrompt(char, stylePreset),
          voice_prompt: char.voice_prompt || null, image_url: 'pending', style_preset: stylePreset, status: 'pending',
        });
        characterCount++;
      }
    }

    for (const scene of scenes) {
      const existing = db.prepare(
        "SELECT id FROM generated_assets WHERE project_id = ? AND asset_type = 'background' AND entity_id = ? AND entity_type = 'scene'"
      ).get(projectId, scene.id);
      if (!existing) {
        GeneratedAssetModel.create({
          project_id: projectId, asset_type: 'background', entity_type: 'scene', entity_id: scene.id,
          name: scene.title, description: scene.description,
          prompt: buildSceneSheetPrompt(scene, stylePreset),
          image_url: 'pending', style_preset: stylePreset, status: 'pending',
        });
        sceneCount++;
      }
    }

    let propsCount = 0;
    const props = db.prepare('SELECT * FROM props WHERE project_id = ?').all(projectId) as any[];
    for (const prop of props) {
      const existing = db.prepare(
        "SELECT id FROM generated_assets WHERE project_id = ? AND asset_type = 'prop' AND entity_id = ? AND entity_type = 'prop'"
      ).get(projectId, prop.id);
      if (!existing) {
        GeneratedAssetModel.create({
          project_id: projectId, asset_type: 'prop', entity_type: 'prop', entity_id: prop.id,
          name: prop.name, description: prop.description,
          prompt: prop.image_prompt || '',
          image_url: 'pending', style_preset: stylePreset, status: 'pending',
        });
        propsCount++;
      }
    }

    transitionWorkflow(projectId, 'generating_assets', 'assets_ready');

    res.json({
      success: true,
      data: {
        state: 'assets_ready',
        character_count: characterCount,
        scene_count: sceneCount,
        props_count: propsCount,
        message: `已创建 ${characterCount} 个角色卡片、${sceneCount} 个场景卡片、${propsCount} 个道具卡片`,
      },
    });
  },

  async recreateAssets(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    const currentState = state?.state || 'idle';
    if (currentState !== 'reviewing' && currentState !== 'assets_ready' && currentState !== 'failed') {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成剧本审核`, 400);
    }

    const db = getDatabase();

    db.prepare("DELETE FROM generated_assets WHERE project_id = ? AND asset_type IN ('character_design', 'background', 'prop')").run(projectId);

    const { style: bodyStyle } = req.body || {};
    const project = db.prepare('SELECT style_preset FROM projects WHERE id = ?').get(projectId) as any;
    const stylePreset = bodyStyle || project?.style_preset || 'anime';
    if (bodyStyle) {
      db.prepare('UPDATE projects SET style_preset = ? WHERE id = ?').run(bodyStyle, projectId);
    }

    const { buildCharacterSheetPrompt, buildSceneSheetPrompt, buildPropSheetPrompt } = require('../services/style-consistency');

    const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];
    const scenes = db.prepare(
      'SELECT s.* FROM scenes s JOIN chapters c ON s.chapter_id = c.id WHERE c.project_id = ?'
    ).all(projectId) as any[];

    let characterCount = 0;
    let sceneCount = 0;
    let propsCount = 0;

    for (const char of characters) {
      GeneratedAssetModel.create({
        project_id: projectId, asset_type: 'character_design', entity_type: 'character', entity_id: char.id,
        name: char.name, description: char.description,
        prompt: buildCharacterSheetPrompt(char, stylePreset),
        voice_prompt: char.voice_prompt || null, image_url: 'pending', style_preset: stylePreset, status: 'pending',
      });
      characterCount++;
    }

    for (const scene of scenes) {
      GeneratedAssetModel.create({
        project_id: projectId, asset_type: 'background', entity_type: 'scene', entity_id: scene.id,
        name: scene.title, description: scene.description,
        prompt: buildSceneSheetPrompt(scene, stylePreset),
        image_url: 'pending', style_preset: stylePreset, status: 'pending',
      });
      sceneCount++;
    }

    const props = db.prepare('SELECT * FROM props WHERE project_id = ?').all(projectId) as any[];
    const seenPropNames = new Set<string>();
    for (const prop of props) {
      if (seenPropNames.has(prop.name)) continue;
      seenPropNames.add(prop.name);
      GeneratedAssetModel.create({
        project_id: projectId, asset_type: 'prop', entity_type: 'prop', entity_id: prop.id,
        name: prop.name, description: prop.description,
        prompt: prop.image_prompt || '',
        image_url: 'pending', style_preset: stylePreset, status: 'pending',
      });
      propsCount++;
    }

    res.json({
      success: true,
      data: {
        character_count: characterCount,
        scene_count: sceneCount,
        props_count: propsCount,
        message: `已重新生成 ${characterCount} 个角色、${sceneCount} 个场景、${propsCount} 个道具的提示词`,
      },
    });
  },

  /**
   * Stage 2: 批量生成素材（创建卡片 + 生成图片）
   */
  async generateAssets(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    const currentState = state?.state || 'idle';
    if (currentState !== 'reviewing' && currentState !== 'assets_ready' && currentState !== 'failed') {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成剧本审核`, 400);
    }

    if (!transitionWorkflow(projectId, currentState as any, 'generating_assets')) {
      throw createError('状态转换失败', 500);
    }

    processAssetQueue(projectId, getImageOpts(req))
      .then(() => {
        const counts = WorkflowTaskModel.countByStatus(projectId);
        if (counts.failed > 0 && counts.completed === 0) {
          setWorkflowError(projectId, `所有素材生成任务失败 (${counts.failed} 个)`);
        } else {
          transitionWorkflow(projectId, 'generating_assets', 'assets_ready');
        }
      })
      .catch((err) => {
        setWorkflowError(projectId, err.message);
      });

    res.json({
      success: true,
      data: { state: 'generating_assets', message: '素材生成已开始' },
    });
  },

  /**
   * 获取素材列表
   */
  getAssets(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const type = req.query.type as string | undefined;
    const assets = GeneratedAssetModel.findByProject(projectId, type);

    res.json({ success: true, data: assets });
  },

  /**
   * 单个素材重新生成
   */
  async regenerateAsset(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const assetId = Number(req.params.assetId);
    verifyOwnership(projectId, req.user!.id);

    const asset = GeneratedAssetModel.findById(assetId) as any;
    if (!asset || asset.project_id !== projectId) throw createError('Asset not found', 404);

    // Reset status
    GeneratedAssetModel.updateStatus(assetId, 'pending');

    res.json({ success: true, data: { message: '素材已重置为待生成状态' } });
  },

  async generateSingleAsset(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const assetId = Number(req.params.assetId);
    verifyOwnership(projectId, req.user!.id);

    const asset = GeneratedAssetModel.findById(assetId) as any;
    if (!asset || asset.project_id !== projectId) throw createError('Asset not found', 404);
    if (asset.status === 'completed') throw createError('该素材已生成', 400);

    const opts = getImageOpts(req);
    GeneratedAssetModel.updateStatus(assetId, 'generating');

    try {
      const imageUrl = await generateImage(asset.prompt, { size: asset.asset_type === 'background' ? '1792x1024' : '1024x1024', ...opts });
      GeneratedAssetModel.updateStatus(assetId, 'completed', imageUrl);
      res.json({ success: true, data: { status: 'completed', image_url: imageUrl } });
    } catch (err: any) {
      GeneratedAssetModel.updateStatus(assetId, 'failed', undefined, err.message);
      throw createError(`图片生成失败: ${err.message}`, 500);
    }
  },

  /**
   * 编辑素材 prompt
   */
  async updateAsset(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const assetId = Number(req.params.assetId);
    verifyOwnership(projectId, req.user!.id);

    const asset = GeneratedAssetModel.findById(assetId) as any;
    if (!asset || asset.project_id !== projectId) throw createError('Asset not found', 404);

    const { prompt, voice_prompt } = req.body;
    if (prompt || voice_prompt) {
      GeneratedAssetModel.updatePrompts(assetId, prompt || asset.prompt, voice_prompt);
    }

    res.json({ success: true });
  },

  /**
   * 单个素材生成语音
   */
  async generateAssetAudioEndpoint(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const assetId = Number(req.params.assetId);
    verifyOwnership(projectId, req.user!.id);

    const asset = GeneratedAssetModel.findById(assetId) as any;
    if (!asset || asset.project_id !== projectId) throw createError('Asset not found', 404);
    if (!asset.voice_prompt) throw createError('该素材没有语音提示词', 400);

    try {
      const audioUrl = await generateAssetAudio(assetId, asset.voice_prompt);
      res.json({ success: true, data: { audio_url: audioUrl } });
    } catch (err: any) {
      throw createError(`语音生成失败: ${err.message}`, 500);
    }
  },

  /**
   * Stage 3: 生成分镜 JSON (SSE 流式)
   */
  async generateStoryboards(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    const currentState = state?.state || 'idle';
    if (currentState !== 'assets_ready' && currentState !== 'storyboards_ready') {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成素材生成`, 400);
    }

    if (!transitionWorkflow(projectId, currentState as any, 'generating_storyboards')) {
      throw createError('状态转换失败', 500);
    }

    const llmOpts = getLLMOpts(req);

    initSSE(res);

    try {
      await generateStoryboardsForProjectStream(projectId, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      });

      transitionWorkflow(projectId, 'generating_storyboards', 'storyboards_ready');
      sendSSE(res, 'done', { state: 'storyboards_ready', message: '分镜生成完成' });
      logger.info(`Storyboard generation completed for project ${projectId}`);
    } catch (err: any) {
      setWorkflowError(projectId, err.message);
      sendSSE(res, 'error', { message: err.message });
    }

    res.end();
  },

  /**
   * Stage 4: 生成关键帧
   */
  async generateKeyframesEndpoint(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    if (!state || state.state !== 'storyboards_ready') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，需要先完成分镜生成`, 400);
    }

    if (!transitionWorkflow(projectId, 'storyboards_ready', 'generating_keyframes')) {
      throw createError('状态转换失败', 500);
    }

    generateKeyframes(projectId, getImageOpts(req))
      .then(() => {
        transitionWorkflow(projectId, 'generating_keyframes', 'completed');
        logger.info(`Keyframe generation completed for project ${projectId}`);
      })
      .catch((err) => {
        setWorkflowError(projectId, err.message);
      });

    res.json({
      success: true,
      data: { state: 'generating_keyframes', message: '关键帧生成已开始' },
    });
  },

  /**
   * 获取可用的风格和画幅选项
   */
  getStyleOptions(_req: AuthRequest, res: Response) {
    const { getPresetOptions } = require('../services/style-consistency');
    res.json({
      success: true,
      data: {
        style_presets: getPresetOptions(),
        aspect_ratios: [
          { value: '16:9', label: '16:9 (横屏)' },
          { value: '9:16', label: '9:16 (竖屏/手机)' },
          { value: '4:3', label: '4:3 (传统)' },
          { value: '1:1', label: '1:1 (方形)' },
          { value: '3:2', label: '3:2 (相机)' },
        ],
      },
    });
  },

  /**
   * AI 风格推荐 + 手动确认
   */
  suggestStyles(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const db = getDatabase();
    const project = db.prepare('SELECT style_preset FROM projects WHERE id = ?').get(projectId) as any;

    const { getPresetOptions } = require('../services/style-consistency');
    const reasons: Record<string, string> = {
      anime: '适合大部分叙事类故事',
      realistic: '适合严肃、历史类题材',
      chinese_ink: '适合古风、武侠类故事',
      cartoon: '适合轻松幽默的故事',
      illustration: '适合奇幻、冒险类故事',
      '3d_render': '适合科幻、未来题材',
      oil_painting: '适合文艺、古典类故事',
      watercolor: '适合温馨、治愈类故事',
      sketch: '适合悬疑、黑暗类故事',
      cyberpunk: '适合科幻、反乌托邦题材',
    };
    const presets = getPresetOptions().map((p: { value: string; label: string }) => ({
      style_key: p.value,
      label: p.label,
      reason: reasons[p.value] || '适用于多种题材',
    }));

    res.json({
      success: true,
      data: {
        current: project?.style_preset || 'anime',
        analysis: '根据故事内容，推荐以下视觉风格：',
        recommendations: presets,
      },
    });
  },

  /**
   * 设置项目风格
   */
  setStyle(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const { style } = req.body;
    if (!style) throw createError('请提供风格', 400);

    getDatabase().prepare('UPDATE projects SET style_preset = ? WHERE id = ?').run(style, projectId);

    res.json({ success: true, data: { style } });
  },

  /**
   * 获取工作流状态
   */
  getStatus(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const db = getDatabase();
    const state = getWorkflowState(projectId);
    const taskCounts = WorkflowTaskModel.countByStatus(projectId);
    const assets = GeneratedAssetModel.findByProject(projectId);

    const currentState = state?.state || 'idle';

    // Include analysis summary when reviewing or later
    let analysis: any = undefined;
    let script: string | undefined;
    if (currentState !== 'idle' && currentState !== 'analyzing' && currentState !== 'failed') {
      const chapters = db.prepare('SELECT id, title FROM chapters WHERE project_id = ?').all(projectId) as any[];
      const characters = db.prepare('SELECT id, name, description FROM characters WHERE project_id = ?').all(projectId) as any[];
      const props = db.prepare('SELECT id, name, description FROM props WHERE project_id = ?').all(projectId) as any[];

      let dialogueCount = 0;
      for (const ch of chapters) {
        const scenes = db.prepare('SELECT id FROM scenes WHERE chapter_id = ?').all(ch.id) as any[];
        for (const sc of scenes) {
          const count = db.prepare('SELECT COUNT(*) as c FROM dialogues WHERE storyboard_id IN (SELECT id FROM storyboards WHERE scene_id = ?)').get(sc.id) as any;
          dialogueCount += count.c;
        }
      }

      analysis = {
        chapters: chapters.length,
        characters: characters.length,
        props: props.length,
        dialogues: dialogueCount,
      };

      // 获取漫剧剧本
      const project = db.prepare('SELECT script FROM projects WHERE id = ?').get(projectId) as any;
      script = project?.script;
    }

    res.json({
      success: true,
      data: {
        state: currentState,
        progress: state?.progress || 0,
        error: state?.error,
        style_preset: state?.style_preset || 'anime',
        tasks: taskCounts,
        assets_count: assets.length,
        analysis,
        script,
      },
    });
  },

  /**
   * 获取项目分镜列表（含场景/章节信息）
   */
  getStoryboards(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const db = getDatabase();
    const storyboards = db.prepare(`
      SELECT sb.*, s.title as scene_title, s.order_index as scene_order,
             c.title as chapter_title, c.order_index as chapter_order
      FROM storyboards sb
      JOIN scenes s ON sb.scene_id = s.id
      JOIN chapters c ON s.chapter_id = c.id
      WHERE c.project_id = ?
      ORDER BY c.order_index, s.order_index, sb.order_index
    `).all(projectId);

    res.json({ success: true, data: storyboards });
  },

  /**
   * 重置工作流
   */
  reset(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    WorkflowTaskModel.deleteByProject(projectId);
    GeneratedAssetModel.deleteByProject(projectId);
    resetWorkflow(projectId);

    res.json({ success: true, data: { state: 'idle' } });
  },

  /**
   * 一键执行全部阶段
   */
  async runAll(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const project = verifyOwnership(projectId, req.user!.id) as any;

    if (!project.novel_text) {
      throw createError('项目没有小说文本', 400);
    }

    const llmOpts = getLLMOpts(req);

    (async () => {
      try {
        const db = getDatabase();
        const from = (getWorkflowState(projectId)?.state || 'idle') as any;

        // Stage 1: Analyze
        if (from === 'idle' || from === 'failed') {
          transitionWorkflow(projectId, from, 'analyzing');
          db.prepare('DELETE FROM chapters WHERE project_id = ?').run(projectId);
          db.prepare('DELETE FROM characters WHERE project_id = ?').run(projectId);

          const result = await analyzeScriptWithLLM(project.novel_text, project.style_preset || 'anime', llmOpts);

          for (const chapter of result.chapters) {
            const chResult = db.prepare(
              'INSERT INTO chapters (project_id, title, content, order_index) VALUES (?, ?, ?, ?)'
            ).run(projectId, chapter.title, chapter.content, chapter.order_index);
            const chapterId = chResult.lastInsertRowid;

            if (Array.isArray(chapter.scenes)) {
              for (const scene of chapter.scenes) {
                const scResult = db.prepare(
                  'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
                const sceneId = scResult.lastInsertRowid;

                if (Array.isArray(scene.storyboards)) {
                  for (const sb of scene.storyboards) {
                    db.prepare(
                      'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
                    ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
                  }
                }
              }
            }
          }

          db.prepare("DELETE FROM characters WHERE project_id = ?").run(projectId);
          for (const char of result.characters) {
            db.prepare(
              'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(projectId, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
          }

          db.prepare("DELETE FROM props WHERE project_id = ?").run(projectId);
          const seenProps = new Set<string>();
          for (const prop of (result.props || [])) {
            if (seenProps.has(prop.name)) continue;
            seenProps.add(prop.name);
            db.prepare(
              'INSERT INTO props (project_id, name, description, image_prompt) VALUES (?, ?, ?, ?)'
            ).run(projectId, prop.name, prop.description, prop.image_prompt);
          }

          for (const dialogue of result.dialogues) {
            const sb = db.prepare(`
              SELECT sb.id FROM storyboards sb
              JOIN scenes s ON sb.scene_id = s.id
              JOIN chapters c ON s.chapter_id = c.id
              WHERE c.project_id = ? AND c.order_index = ? AND s.order_index = ? AND sb.order_index = ?
            `).get(projectId, dialogue.chapter_index, dialogue.scene_index, dialogue.storyboard_index) as any;

            if (sb) {
              const char = db.prepare('SELECT id FROM characters WHERE project_id = ? AND name = ?').get(projectId, dialogue.character_name) as any;
              db.prepare(
                'INSERT INTO dialogues (storyboard_id, character_id, content, emotion, action_description, style, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
              ).run(sb.id, char?.id || null, dialogue.content, dialogue.emotion, dialogue.action_description, dialogue.style || 'speech', 0);
            }
          }

          transitionWorkflow(projectId, 'analyzing', 'reviewing');
        }

        // Stage 2: Assets
        const state2 = getWorkflowState(projectId);
        if (state2?.state === 'reviewing') {
          transitionWorkflow(projectId, 'reviewing', 'generating_assets');
          await processAssetQueue(projectId);
          const counts = WorkflowTaskModel.countByStatus(projectId);
          if (counts.failed > 0 && counts.completed === 0) {
            setWorkflowError(projectId, '素材生成全部失败');
            return;
          }
          transitionWorkflow(projectId, 'generating_assets', 'assets_ready');
        }

        // Stage 3: Storyboards
        const state3 = getWorkflowState(projectId);
        if (state3?.state === 'assets_ready') {
          transitionWorkflow(projectId, 'assets_ready', 'generating_storyboards');
          await generateStoryboardsForProject(projectId, llmOpts);
          transitionWorkflow(projectId, 'generating_storyboards', 'storyboards_ready');
        }

        // Stage 4: Keyframes
        const state4 = getWorkflowState(projectId);
        if (state4?.state === 'storyboards_ready') {
          transitionWorkflow(projectId, 'storyboards_ready', 'generating_keyframes');
          await generateKeyframes(projectId);
          transitionWorkflow(projectId, 'generating_keyframes', 'completed');
        }

        logger.info(`Run-all workflow completed for project ${projectId}`);
      } catch (err: any) {
        setWorkflowError(projectId, err.message);
      }
    })();

    res.json({
      success: true,
      data: { state: 'analyzing', message: '全流水线已启动' },
    });
  },

  /**
   * 重试失败任务
   */
  async retryFailed(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    if (state?.state !== 'failed') {
      throw createError('工作流未处于失败状态', 400);
    }

    const failedTasks = WorkflowTaskModel.findByProject(projectId, 'failed') as any[];
    const taskTypes = failedTasks.map((t: any) => t.task_type);

    const isAssetTask = (t: string) => ['generate_character', 'generate_background', 'generate_prop', 'generate_asset_audio'].includes(t);
    const isKeyframeTask = (t: string) => t === 'generate_keyframe';

    if (taskTypes.every(isAssetTask)) {
      if (!transitionWorkflow(projectId, 'failed', 'generating_assets')) {
        throw createError('状态转换失败', 500);
      }
      for (const task of failedTasks) WorkflowTaskModel.incrementRetry(task.id);
      processAssetQueue(projectId, getImageOpts(req))
        .then(() => {
          const counts = WorkflowTaskModel.countByStatus(projectId);
          if (counts.failed > 0 && counts.completed === 0) {
            setWorkflowError(projectId, '素材生成全部失败');
          } else {
            transitionWorkflow(projectId, 'generating_assets', 'assets_ready');
          }
        })
        .catch((err: any) => setWorkflowError(projectId, err.message));

      res.json({ success: true, data: { target: 'generating_assets', message: '已重新启动素材生成' } });
    } else if (taskTypes.every(isKeyframeTask)) {
      if (!transitionWorkflow(projectId, 'failed', 'generating_keyframes')) {
        throw createError('状态转换失败', 500);
      }
      for (const task of failedTasks) WorkflowTaskModel.incrementRetry(task.id);
      generateKeyframes(projectId)
        .then(() => transitionWorkflow(projectId, 'generating_keyframes', 'completed'))
        .catch((err: any) => setWorkflowError(projectId, err.message));

      res.json({ success: true, data: { target: 'generating_keyframes', message: '已重新启动关键帧生成' } });
    } else {
      if (!transitionWorkflow(projectId, 'failed', 'reviewing')) {
        throw createError('状态转换失败', 500);
      }
      for (const task of failedTasks) WorkflowTaskModel.incrementRetry(task.id);
      res.json({ success: true, data: { target: 'reviewing', message: '已重置到审核步骤，请重新审批' } });
    }
  },

  // ==================== Stage 5: Video Generation ====================

  async generateVideo(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const project = verifyOwnership(projectId, req.user!.id);
    const { resolution, bgm_volume, title } = req.body || {};

    const state = getWorkflowState(projectId);
    const allowedStates = ['generating_keyframes', 'completed', 'video_ready'];
    if (!state || !allowedStates.includes(state.state)) {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，需要先生成关键帧`, 400);
    }

    if (!transitionWorkflow(projectId, state.state as any, 'generating_video')) {
      throw createError('状态转换失败', 500);
    }

    const video = VideoModel.create({
      project_id: projectId,
      title: title || `${project.title} 视频`,
      resolution: resolution || '1080p',
      bgm_volume: bgm_volume ?? 0.5,
    }) as any;

    if (isFFmpegAvailable()) {
      const db = getDatabase();
      enqueueVideoRender({
        videoId: video.id,
        projectId,
        resolution: resolution || '1080p',
        bgmVolume: bgm_volume ?? 0.5,
        onComplete: () => {
          const finalStatus = db.prepare('SELECT status FROM videos WHERE id = ?').get(video.id) as any;
          if (finalStatus?.status === 'completed') {
            transitionWorkflow(projectId, 'generating_video', 'video_ready');
          } else {
            transitionWorkflow(projectId, 'generating_video', 'completed');
          }
        },
      });
      logger.info(`Project video generation queued: video ${video.id}, project ${projectId}`);
    } else {
      transitionWorkflow(projectId, 'generating_video', 'completed');
    }

    res.status(201).json({ success: true, data: video });
  },

  getVideoStatus(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const db = getDatabase();
    const video = db.prepare('SELECT * FROM videos WHERE project_id = ? AND episode_id IS NULL ORDER BY created_at DESC LIMIT 1').get(projectId) as any;
    if (!video) {
      res.json({ success: true, data: null });
      return;
    }
    res.json({ success: true, data: video });
  },
};

// ==================== Episode Workflow Controller ====================

function verifyEpisodeOwnership(episodeId: number, userId: number): any {
  const episode = EpisodeModel.findByIdWithOwnership(episodeId, userId);
  if (!episode) throw createError('Episode not found', 404);
  return episode;
}

export const EpisodeWorkflowController = {
  async analyze(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;

    if (!episode.novel_text_segment) {
      throw createError('剧集没有小说文本片段', 400);
    }

    const state = getWorkflowStateEpisode(episodeId);
    const from = state?.state || 'idle';

    if (from !== 'idle' && from !== 'failed' && from !== 'analyzing') {
      throw createError(`工作流当前状态为 ${from}，无法开始分析`, 400);
    }

    if (from === 'analyzing' || from === 'failed') {
      const db = getDatabase();
      db.prepare("UPDATE episodes SET workflow_state = 'idle', workflow_error = NULL WHERE id = ?").run(episodeId);
      if (!transitionWorkflowEpisode(episodeId, 'idle', 'analyzing')) {
        throw createError('状态转换失败', 500);
      }
    } else {
      if (!transitionWorkflowEpisode(episodeId, from as any, 'analyzing')) {
        throw createError('状态转换失败', 500);
      }
    }

    const llmOpts = getLLMOpts(req);
    const projectId = episode.project_id;

    initSSE(res);

    try {
      const db = getDatabase();
      const stylePreset = episode.style_preset || 'anime';

      db.prepare('DELETE FROM chapters WHERE episode_id = ?').run(episodeId);

      sendSSE(res, 'status', { message: '正在分析剧本...' });

      const result = await analyzeScriptWithLLMStream(episode.novel_text_segment, stylePreset, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      }, { episodeNumber: episode.episode_number, episodeTitle: episode.title });

      sendSSE(res, 'status', { message: '正在保存分析结果...' });

      for (const chapter of result.chapters) {
        const chResult = db.prepare(
          'INSERT INTO chapters (project_id, episode_id, title, content, order_index) VALUES (?, ?, ?, ?, ?)'
        ).run(projectId, episodeId, chapter.title, chapter.content, chapter.order_index);
        const chapterId = chResult.lastInsertRowid;

        if (Array.isArray(chapter.scenes)) {
          for (const scene of chapter.scenes) {
            const scResult = db.prepare(
              'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
            const sceneId = scResult.lastInsertRowid;

            if (Array.isArray(scene.storyboards)) {
              for (const sb of scene.storyboards) {
                db.prepare(
                  'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
              }
            }
          }
        }
      }

      const existingChars = db.prepare('SELECT name FROM characters WHERE project_id = ?').all(projectId) as any[];
      const existingNames = new Set(existingChars.map((c: any) => c.name));

      for (const char of result.characters) {
        if (!existingNames.has(char.name)) {
          db.prepare(
            'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(projectId, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
        }
      }

      db.prepare("DELETE FROM props WHERE project_id = ?").run(projectId);
      const seenProps = new Set<string>();
      for (const prop of (result.props || [])) {
        if (seenProps.has(prop.name)) continue;
        seenProps.add(prop.name);
        db.prepare(
          'INSERT INTO props (project_id, name, description, image_prompt) VALUES (?, ?, ?, ?)'
        ).run(projectId, prop.name, prop.description, prop.image_prompt);
      }

      for (const dialogue of result.dialogues) {
        const sb = db.prepare(`
          SELECT sb.id FROM storyboards sb
          JOIN scenes s ON sb.scene_id = s.id
          JOIN chapters c ON s.chapter_id = c.id
          WHERE c.episode_id = ? AND c.order_index = ? AND s.order_index = ? AND sb.order_index = ?
        `).get(episodeId, dialogue.chapter_index, dialogue.scene_index, dialogue.storyboard_index) as any;

        if (sb) {
          const char = db.prepare(
            'SELECT id FROM characters WHERE project_id = ? AND name = ?'
          ).get(projectId, dialogue.character_name) as any;

          db.prepare(
            'INSERT INTO dialogues (storyboard_id, character_id, content, emotion, action_description, style, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(sb.id, char?.id || null, dialogue.content, dialogue.emotion, dialogue.action_description, dialogue.style || 'speech', 0);
        }
      }

      // 保存漫剧剧本
      if (result.script) {
        db.prepare('UPDATE episodes SET script = ? WHERE id = ?').run(result.script, episodeId);
        logger.info(`Script saved for episode ${episodeId}`);
      }

      transitionWorkflowEpisode(episodeId, 'analyzing', 'reviewing');

      sendSSE(res, 'done', {
        state: 'reviewing',
        chapters: result.chapters.length,
        characters: result.characters.length,
      });

      logger.info(`Episode ${episodeId} analysis completed`);
    } catch (err: any) {
      const errMsg = err.message || String(err);
      let hint = '';
      if (errMsg.includes('400') || errMsg.includes('Param Incorrect')) {
        hint = '。请到设置页面检查文本 AI 配置';
      }
      setWorkflowErrorEpisode(episodeId, errMsg + hint);
      sendSSE(res, 'error', { message: errMsg + hint });
    }

    res.end();
  },



  async reviseScript(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;

    const state = getWorkflowStateEpisode(episodeId);
    if (!state || state.state !== 'reviewing') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法修改`, 400);
    }

    const { feedback } = req.body;
    if (!feedback) throw createError('请提供修改意见', 400);

    const llmOpts = getLLMOpts(req);

    initSSE(res);

    try {
      const db = getDatabase();
      const ep = db.prepare('SELECT script FROM episodes WHERE id = ?').get(episodeId) as any;
      if (!ep.script) throw createError('没有剧本可供修改', 400);
      const existingChars = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(episode.project_id) as any[];

      const revised = await reviseScriptWithLLMStream(ep.script, feedback, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      }, existingChars);

      sendSSE(res, 'status', { message: '正在保存修改结果...' });

      db.prepare('DELETE FROM chapters WHERE episode_id = ?').run(episodeId);

      for (const chapter of revised.chapters) {
        const chResult = db.prepare(
          'INSERT INTO chapters (project_id, episode_id, title, content, order_index) VALUES (?, ?, ?, ?, ?)'
        ).run(episode.project_id, episodeId, chapter.title, chapter.content, chapter.order_index);
        const chapterId = chResult.lastInsertRowid;

        if (Array.isArray(chapter.scenes)) {
          for (const scene of chapter.scenes) {
            const scResult = db.prepare(
              'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
            const sceneId = scResult.lastInsertRowid;

            if (Array.isArray(scene.storyboards)) {
              for (const sb of scene.storyboards) {
                db.prepare(
                  'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
              }
            }
          }
        }
      }

      const existingCharNames = new Set(existingChars.map((c: any) => c.name));
      for (const char of revised.characters) {
        if (!existingCharNames.has(char.name)) {
          db.prepare(
            'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(episode.project_id, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
        }
      }

      // 保存修改后的剧本
      db.prepare('UPDATE episodes SET script = ? WHERE id = ?').run(revised.script, episodeId);

      sendSSE(res, 'status', { message: '正在 AI 审核...' });

      const review = await reviewScriptWithLLM(revised.script, episode.novel_text_segment, llmOpts);

      sendSSE(res, 'done', {
        state: 'reviewing',
        chapters: revised.chapters.length,
        characters: revised.characters.length,
        dialogues: revised.dialogues.length,
        review: { approved: review.approved, issues: review.issues, suggestions: review.suggestions },
      });
    } catch (err: any) {
      setWorkflowErrorEpisode(episodeId, err.message);
      sendSSE(res, 'error', { message: `剧本修改失败: ${err.message}` });
    }

    res.end();
  },

  async reviewScript(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;

    const state = getWorkflowStateEpisode(episodeId);
    if (!state || state.state !== 'reviewing') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法审核`, 400);
    }

    const llmOpts = getLLMOpts(req);

    initSSE(res);

    try {
      const db = getDatabase();
      const ep = db.prepare('SELECT script FROM episodes WHERE id = ?').get(episodeId) as any;
      if (!ep.script) throw createError('没有剧本可供审核', 400);

      const review = await reviewScriptWithLLMStream(ep.script, episode.novel_text_segment, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      });

      sendSSE(res, 'done', {
        state: 'reviewing',
        review: {
          approved: review.approved,
          issues: review.issues,
          suggestions: review.suggestions,
        },
      });
    } catch (err: any) {
      sendSSE(res, 'error', { message: `审核失败: ${err.message}` });
    }

    res.end();
  },

  /**
   * 一键 AI 修正 (SSE 流式): 审核 + 自动应用修改
   */
  async applyReview(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;

    const state = getWorkflowStateEpisode(episodeId);
    if (!state || state.state !== 'reviewing') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法执行`, 400);
    }

    const llmOpts = getLLMOpts(req);

    initSSE(res);

    try {
      const db = getDatabase();
      const ep = db.prepare('SELECT script FROM episodes WHERE id = ?').get(episodeId) as any;
      if (!ep.script) throw createError('没有剧本可供审核', 400);

      const existingChars = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(episode.project_id) as any[];

      // Step 1: 审核剧本
      sendSSE(res, 'status', { message: '正在审核剧本...' });
      const review = await reviewScriptWithLLMStream(ep.script, episode.novel_text_segment, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      });

      if (review.approved) {
        sendSSE(res, 'done', {
          state: 'reviewing',
          review: { approved: true, issues: [], suggestions: [] },
          message: '审核通过，无需修改',
        });
      } else {
        // Step 2: 自动修正
        const feedback = [
          '请修复以下问题：',
          ...(review.issues || []).map((s: string) => `- ${s}`),
          '建议：',
          ...(review.suggestions || []).map((s: string) => `- ${s}`),
        ].join('\n');

        sendSSE(res, 'status', { message: '正在自动修正...' });

        const revised = await reviseScriptWithLLMStream(ep.script, feedback, llmOpts, (chunk) => {
          sendSSE(res, 'chunk', { text: chunk });
        }, existingChars);

        sendSSE(res, 'status', { message: '正在保存修正结果...' });

        // 保存修改结果
        db.prepare('DELETE FROM chapters WHERE episode_id = ?').run(episodeId);

        const existingCharNamesApplyEp = new Set(existingChars.map((c: any) => c.name));

        for (const chapter of revised.chapters) {
          const chResult = db.prepare(
            'INSERT INTO chapters (project_id, episode_id, title, content, order_index) VALUES (?, ?, ?, ?, ?)'
          ).run(episode.project_id, episodeId, chapter.title, chapter.content, chapter.order_index);
          const chapterId = chResult.lastInsertRowid;

          if (Array.isArray(chapter.scenes)) {
            for (const scene of chapter.scenes) {
              const scResult = db.prepare(
                'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
              const sceneId = scResult.lastInsertRowid;

              if (Array.isArray(scene.storyboards)) {
                for (const sb of scene.storyboards) {
                  db.prepare(
                    'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
                  ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
                }
              }
            }
          }
        }

        for (const char of revised.characters) {
          if (!existingCharNamesApplyEp.has(char.name)) {
            db.prepare(
              'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(episode.project_id, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
          }
        }

        // 保存修改后的剧本
        db.prepare('UPDATE episodes SET script = ? WHERE id = ?').run(revised.script, episodeId);

        // 清除旧对白并重新插入
        db.prepare(`
          DELETE FROM dialogues WHERE storyboard_id IN (
            SELECT sb.id FROM storyboards sb
            JOIN scenes s ON sb.scene_id = s.id
            JOIN chapters c ON s.chapter_id = c.id
            WHERE c.episode_id = ?
          )
        `).run(episodeId);

        for (const dialogue of revised.dialogues) {
          const sb = db.prepare(`
            SELECT sb.id FROM storyboards sb
            JOIN scenes s ON sb.scene_id = s.id
            JOIN chapters c ON s.chapter_id = c.id
            WHERE c.episode_id = ? AND c.order_index = ? AND s.order_index = ? AND sb.order_index = ?
          `).get(episodeId, dialogue.chapter_index, dialogue.scene_index, dialogue.storyboard_index) as any;

          if (sb) {
            const char = db.prepare('SELECT id FROM characters WHERE project_id = ? AND name = ?').get(episode.project_id, dialogue.character_name) as any;
            db.prepare(
              'INSERT INTO dialogues (storyboard_id, character_id, content, emotion, action_description, style, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(sb.id, char?.id || null, dialogue.content, dialogue.emotion, dialogue.action_description, dialogue.style || 'speech', 0);
          }
        }

        sendSSE(res, 'done', {
          state: 'reviewing',
          chapters: revised.chapters.length,
          characters: revised.characters.length,
          dialogues: revised.dialogues.length,
          review: { approved: false, issues: review.issues, suggestions: review.suggestions },
          message: '已自动修正',
        });
      }
    } catch (err: any) {
      setWorkflowErrorEpisode(episodeId, err.message);
      sendSSE(res, 'error', { message: `一键修正失败: ${err.message}` });
    }

    res.end();
  },

  async approveScript(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const state = getWorkflowStateEpisode(episodeId);
    if (!state || state.state !== 'reviewing') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法确认`, 400);
    }

    if (!transitionWorkflowEpisode(episodeId, 'reviewing', 'assets_ready')) {
      throw createError('状态转换失败', 500);
    }

    res.json({ success: true, data: { state: 'assets_ready', message: '剧本已确认，可以开始生成素材' } });
  },

  backToReview(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const state = getWorkflowStateEpisode(episodeId);
    if (!state || state.state !== 'assets_ready') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法返回审核`, 400);
    }

    if (!transitionWorkflowEpisode(episodeId, 'assets_ready', 'reviewing')) {
      throw createError('状态转换失败', 500);
    }

    res.json({ success: true, data: { state: 'reviewing', message: '已返回剧本审核' } });
  },

  suggestStyles(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;

    const db = getDatabase();
    const ep = db.prepare('SELECT style_preset FROM episodes WHERE id = ?').get(episodeId) as any;

    const { getPresetOptions } = require('../services/style-consistency');
    const reasons: Record<string, string> = {
      anime: '适合大部分叙事类故事',
      realistic: '适合严肃、历史类题材',
      chinese_ink: '适合古风、武侠类故事',
      cartoon: '适合轻松幽默的故事',
      illustration: '适合奇幻、冒险类故事',
      '3d_render': '适合科幻、未来题材',
      oil_painting: '适合文艺、古典类故事',
      watercolor: '适合温馨、治愈类故事',
      sketch: '适合悬疑、黑暗类故事',
      cyberpunk: '适合科幻、反乌托邦题材',
    };
    const presets = getPresetOptions().map((p: { value: string; label: string }) => ({
      style_key: p.value,
      label: p.label,
      reason: reasons[p.value] || '适用于多种题材',
    }));

    res.json({
      success: true,
      data: {
        current: ep?.style_preset || 'anime',
        analysis: '根据故事内容，推荐以下视觉风格：',
        recommendations: presets,
      },
    });
  },

  setStyle(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const { style } = req.body;
    if (!style) throw createError('请提供风格', 400);

    getDatabase().prepare('UPDATE episodes SET style_preset = ? WHERE id = ?').run(style, episodeId);

    res.json({ success: true, data: { style } });
  },

  async createAssets(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;

    const state = getWorkflowStateEpisode(episodeId);
    const currentState = state?.state || 'idle';
    if (currentState !== 'reviewing' && currentState !== 'assets_ready' && currentState !== 'failed') {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成剧本审核`, 400);
    }

    if (!transitionWorkflowEpisode(episodeId, currentState as any, 'generating_assets')) {
      throw createError('状态转换失败', 500);
    }

    const db = getDatabase();
    const ep = db.prepare('SELECT style_preset FROM episodes WHERE id = ?').get(episodeId) as any;
    const stylePreset = ep?.style_preset || episode.style_preset || 'anime';

    const { buildCharacterSheetPrompt, buildSceneSheetPrompt, buildPropSheetPrompt } = require('../services/style-consistency');

    const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(episode.project_id) as any[];
    const scenes = db.prepare(
      'SELECT s.* FROM scenes s JOIN chapters c ON s.chapter_id = c.id WHERE c.episode_id = ?'
    ).all(episodeId) as any[];

    let characterCount = 0;
    let sceneCount = 0;

    for (const char of characters) {
      const existing = db.prepare(
        "SELECT id FROM generated_assets WHERE episode_id = ? AND asset_type = 'character_design' AND entity_id = ? AND entity_type = 'character'"
      ).get(episodeId, char.id);
      if (!existing) {
        GeneratedAssetModel.createWithEpisode({
          project_id: episode.project_id, episode_id: episodeId,
          asset_type: 'character_design', entity_type: 'character', entity_id: char.id,
          name: char.name, description: char.description,
          prompt: buildCharacterSheetPrompt(char, stylePreset),
          voice_prompt: char.voice_prompt || null, image_url: 'pending', style_preset: stylePreset, status: 'pending',
        });
        characterCount++;
      }
    }

    for (const scene of scenes) {
      const existing = db.prepare(
        "SELECT id FROM generated_assets WHERE episode_id = ? AND asset_type = 'background' AND entity_id = ? AND entity_type = 'scene'"
      ).get(episodeId, scene.id);
      if (!existing) {
        GeneratedAssetModel.createWithEpisode({
          project_id: episode.project_id, episode_id: episodeId,
          asset_type: 'background', entity_type: 'scene', entity_id: scene.id,
          name: scene.title, description: scene.description,
          prompt: buildSceneSheetPrompt(scene, stylePreset),
          image_url: 'pending', style_preset: stylePreset, status: 'pending',
        });
        sceneCount++;
      }
    }

    // 从 props 表读取并创建 episode-scoped 道具卡片
    let propsCount = 0;
    const props = db.prepare('SELECT * FROM props WHERE project_id = ?').all(episode.project_id) as any[];
    for (const prop of props) {
      const existing = db.prepare(
        "SELECT id FROM generated_assets WHERE episode_id = ? AND asset_type = 'prop' AND entity_id = ? AND entity_type = 'prop'"
      ).get(episodeId, prop.id);
      if (!existing) {
        GeneratedAssetModel.createWithEpisode({
          project_id: episode.project_id, episode_id: episodeId,
          asset_type: 'prop', entity_type: 'prop', entity_id: prop.id,
          name: prop.name, description: prop.description,
          prompt: prop.image_prompt || '',
          image_url: 'pending', style_preset: stylePreset, status: 'pending',
        });
        propsCount++;
      }
    }

    transitionWorkflowEpisode(episodeId, 'generating_assets', 'assets_ready');

    res.json({
      success: true,
      data: {
        state: 'assets_ready',
        character_count: characterCount,
        scene_count: sceneCount,
        props_count: propsCount,
        message: `已创建 ${characterCount} 个角色卡片、${sceneCount} 个场景卡片、${propsCount} 个道具卡片`,
      },
    });
  },

  async recreateAssets(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;

    const state = getWorkflowStateEpisode(episodeId);
    const currentState = state?.state || 'idle';
    if (currentState !== 'reviewing' && currentState !== 'assets_ready' && currentState !== 'failed') {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成剧本审核`, 400);
    }

    const db = getDatabase();

    // 从 props 表读取道具数据，然后全部删除重建
    const props = db.prepare('SELECT * FROM props WHERE project_id = ?').all(episode.project_id) as any[];
    db.prepare("DELETE FROM generated_assets WHERE episode_id = ? AND asset_type IN ('character_design', 'background', 'prop')").run(episodeId);

    const { style: bodyStyle } = req.body || {};
    const ep = db.prepare('SELECT style_preset FROM episodes WHERE id = ?').get(episodeId) as any;
    const stylePreset = bodyStyle || ep?.style_preset || episode.style_preset || 'anime';
    // 同步保存到 DB
    if (bodyStyle) {
      db.prepare('UPDATE episodes SET style_preset = ? WHERE id = ?').run(bodyStyle, episodeId);
    }

    const { buildCharacterSheetPrompt, buildSceneSheetPrompt, buildPropSheetPrompt } = require('../services/style-consistency');

    const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(episode.project_id) as any[];
    const scenes = db.prepare(
      'SELECT s.* FROM scenes s JOIN chapters c ON s.chapter_id = c.id WHERE c.episode_id = ?'
    ).all(episodeId) as any[];

    let characterCount = 0;
    let sceneCount = 0;
    let propsCount = 0;

    for (const char of characters) {
      GeneratedAssetModel.createWithEpisode({
        project_id: episode.project_id, episode_id: episodeId,
        asset_type: 'character_design', entity_type: 'character', entity_id: char.id,
        name: char.name, description: char.description,
        prompt: buildCharacterSheetPrompt(char, stylePreset),
        voice_prompt: char.voice_prompt || null, image_url: 'pending', style_preset: stylePreset, status: 'pending',
      });
      characterCount++;
    }

    for (const scene of scenes) {
      GeneratedAssetModel.createWithEpisode({
        project_id: episode.project_id, episode_id: episodeId,
        asset_type: 'background', entity_type: 'scene', entity_id: scene.id,
        name: scene.title, description: scene.description,
        prompt: buildSceneSheetPrompt(scene, stylePreset),
        image_url: 'pending', style_preset: stylePreset, status: 'pending',
      });
      sceneCount++;
    }

    const seenPropNames = new Set<string>();
    for (const prop of props) {
      if (seenPropNames.has(prop.name)) continue;
      seenPropNames.add(prop.name);
      GeneratedAssetModel.createWithEpisode({
        project_id: episode.project_id, episode_id: episodeId,
        asset_type: 'prop', entity_type: 'prop', entity_id: prop.id,
        name: prop.name, description: prop.description,
        prompt: buildPropSheetPrompt(prop, stylePreset),
        image_url: 'pending', style_preset: stylePreset, status: 'pending',
      });
      propsCount++;
    }

    res.json({
      success: true,
      data: {
        character_count: characterCount,
        scene_count: sceneCount,
        props_count: propsCount,
        message: `已重新生成 ${characterCount} 个角色、${sceneCount} 个场景、${propsCount} 个道具的提示词`,
      },
    });
  },

  generateAssets(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;

    const state = getWorkflowStateEpisode(episodeId);
    const currentState = state?.state || 'idle';
    if (currentState !== 'reviewing' && currentState !== 'assets_ready' && currentState !== 'failed') {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成剧本审核`, 400);
    }

    if (!transitionWorkflowEpisode(episodeId, currentState as any, 'generating_assets')) {
      throw createError('状态转换失败', 500);
    }

    processAssetQueueForEpisode(episode.project_id, episodeId, getImageOpts(req))
      .then(() => {
        const counts = WorkflowTaskModel.countByEpisode(episodeId);
        if (counts.failed > 0 && counts.completed === 0) {
          setWorkflowErrorEpisode(episodeId, `素材生成全部失败`);
        } else {
          transitionWorkflowEpisode(episodeId, 'generating_assets', 'assets_ready');
        }
      })
      .catch((err) => setWorkflowErrorEpisode(episodeId, err.message));

    res.json({ success: true, data: { state: 'generating_assets', message: '素材生成已开始' } });
  },

  getAssets(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const type = req.query.type as string | undefined;
    const version = req.query.version as string | undefined;

    if ((type === 'keyframe' || type === 'video_clip') && version) {
      const db = getDatabase();
      const assets = db.prepare(`
        SELECT ga.*, sb.version as storyboard_version, sb.title as storyboard_title,
               sb.camera_angle, sb.camera_movement, sb.description as storyboard_description,
               sb.seedance_prompt, sb.sora_prompt, sb.duration as storyboard_duration,
               s.title as scene_title, c.title as chapter_title
        FROM generated_assets ga
        JOIN storyboards sb ON ga.entity_id = sb.id AND ga.entity_type = 'storyboard'
        JOIN scenes s ON sb.scene_id = s.id
        JOIN chapters c ON s.chapter_id = c.id
        WHERE ga.episode_id = ? AND ga.asset_type = ? AND sb.version = ?
        ORDER BY c.order_index, s.order_index, sb.order_index
      `).all(episodeId, type, version);
      res.json({ success: true, data: assets });
    } else {
      const assets = GeneratedAssetModel.findByEpisode(episodeId, type);
      res.json({ success: true, data: assets });
    }
  },

  async generateSingleAsset(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const assetId = Number(req.params.assetId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const asset = GeneratedAssetModel.findById(assetId) as any;
    if (!asset || asset.episode_id !== episodeId) throw createError('Asset not found', 404);
    if (asset.status === 'completed') throw createError('该素材已生成', 400);

    const opts = getImageOpts(req);
    GeneratedAssetModel.updateStatus(assetId, 'generating');

    try {
      const imageUrl = await generateImage(asset.prompt, { size: asset.asset_type === 'background' ? '1792x1024' : '1024x1024', ...opts });
      GeneratedAssetModel.updateStatus(assetId, 'completed', imageUrl);
      res.json({ success: true, data: { status: 'completed', image_url: imageUrl } });
    } catch (err: any) {
      GeneratedAssetModel.updateStatus(assetId, 'failed', undefined, err.message);
      throw createError(`图片生成失败: ${err.message}`, 500);
    }
  },

  async regenerateAsset(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const assetId = Number(req.params.assetId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const asset = GeneratedAssetModel.findById(assetId) as any;
    if (!asset || asset.episode_id !== episodeId) throw createError('Asset not found', 404);

    GeneratedAssetModel.updateStatus(assetId, 'pending');
    res.json({ success: true, data: { message: '素材已重置为待生成状态' } });
  },

  // --- Keyframe card operations ---

  createKeyframeCards(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const state = getWorkflowStateEpisode(episodeId);
    const currentState = state?.state || 'idle';
    const allowedStates = ['storyboards_ready', 'generating_keyframes', 'completed'];
    if (!allowedStates.includes(currentState)) {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成分镜生成`, 400);
    }

    const { style } = req.body || {};

    const result = createKeyframeCardsForEpisode(episodeId, style);
    res.json({
      success: true,
      data: {
        message: `已创建 ${result.total} 个关键帧卡片 (Seedance: ${result.byVersion.seedance}, Sora-2: ${result.byVersion.sora})`,
        ...result,
      },
    });
  },

  async generateSingleKeyframe(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const assetId = Number(req.params.assetId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const asset = GeneratedAssetModel.findById(assetId) as any;
    if (!asset || asset.episode_id !== episodeId) throw createError('Keyframe card not found', 404);
    if (asset.asset_type !== 'keyframe') throw createError('该素材不是关键帧卡片', 400);
    if (asset.status === 'completed' && asset.thumbnail_url) throw createError('该首尾帧已生成', 400);

    // Parse reference asset IDs from metadata
    let referenceAssetIds: number[] = [];
    try {
      const meta = JSON.parse(asset.metadata || '{}');
      referenceAssetIds = meta.reference_asset_ids || [];
    } catch {}

    if (referenceAssetIds.length === 0) {
      throw createError('该关键帧卡片没有关联参考素材，请重新创建卡片', 400);
    }

    // Get reference image paths
    const db = getDatabase();
    const refImages: { path: string; label: string }[] = [];
    for (const refId of referenceAssetIds) {
      const refAsset = db.prepare(
        'SELECT image_url, name, asset_type FROM generated_assets WHERE id = ? AND status = ?'
      ).get(refId, 'completed') as any;
      if (refAsset && refAsset.image_url && refAsset.image_url !== 'pending') {
        refImages.push({
          path: refAsset.image_url,
          label: refAsset.name || refAsset.asset_type || '素材',
        });
      }
    }

    if (refImages.length === 0) {
      throw createError('所有参考素材图片均未生成或不可用', 400);
    }

    const opts = getImageOpts(req);
    GeneratedAssetModel.updateStatus(assetId, 'generating');

    try {
      // Step 1: Generate first frame
      const imageUrl = await generateImageEdit(asset.prompt, refImages, {
        size: '1792x1024',
        ...opts,
      });

      GeneratedAssetModel.updateStatus(assetId, 'completed', imageUrl);

      // Update storyboard image_url too
      if (asset.entity_type === 'storyboard' && asset.entity_id) {
        db.prepare('UPDATE storyboards SET image_url = ? WHERE id = ?').run(imageUrl, asset.entity_id);
      }

      // Step 2: Generate last frame
      const lastFramePrompt = '[Last Frame / Ending] ' + asset.prompt;
      try {
        const lastUrl = await generateImageEdit(lastFramePrompt, refImages, {
          size: '1792x1024',
          ...opts,
        });

        db.prepare('UPDATE generated_assets SET thumbnail_url = ? WHERE id = ?').run(lastUrl, assetId);

        if (asset.entity_type === 'storyboard' && asset.entity_id) {
          db.prepare('UPDATE storyboards SET last_frame_image = ? WHERE id = ?').run(lastUrl, asset.entity_id);
        }

        res.json({ success: true, data: { status: 'completed', image_url: imageUrl, last_frame_url: lastUrl, reference_count: refImages.length } });
      } catch (lastErr: any) {
        // Last frame failed, but first frame succeeded - still mark as completed
        logger.error(`尾帧生成失败 (asset ${assetId}):`, lastErr.message);
        res.json({ success: true, data: { status: 'completed', image_url: imageUrl, last_frame_url: null, last_frame_error: lastErr.message, reference_count: refImages.length } });
      }
    } catch (err: any) {
      GeneratedAssetModel.updateStatus(assetId, 'failed', undefined, err.message);
      throw createError(`首帧生成失败: ${err.message}`, 500);
    }
  },

  regenerateKeyframe(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const assetId = Number(req.params.assetId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const asset = GeneratedAssetModel.findById(assetId) as any;
    if (!asset || asset.episode_id !== episodeId) throw createError('Keyframe card not found', 404);
    if (asset.asset_type !== 'keyframe') throw createError('该素材不是关键帧卡片', 400);

    GeneratedAssetModel.updateStatus(assetId, 'pending');
    res.json({ success: true, data: { message: '关键帧已重置为待生成状态' } });
  },

  async generateStoryboards(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const version = (req.query.version as string) || 'both'; // 'seedance' | 'sora' | 'both'

    const state = getWorkflowStateEpisode(episodeId);
    const currentState = state?.state || 'idle';
    const allowedStates = ['assets_ready', 'storyboards_ready', 'generating_keyframes', 'completed'];
    if (!allowedStates.includes(currentState)) {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成素材生成`, 400);
    }

    if (!transitionWorkflowEpisode(episodeId, currentState as any, 'generating_storyboards')) {
      throw createError('状态转换失败', 500);
    }

    const llmOpts = getLLMOpts(req);

    initSSE(res);

    try {
      const versionsToGenerate = version === 'both' ? ['seedance', 'sora'] : [version];

      for (const ver of versionsToGenerate) {
        sendSSE(res, 'status', { version: ver, message: `开始生成 ${ver} 版本分镜...` });

        if (ver === 'seedance') {
          await generateSeedanceStoryboardsForEpisode(episodeId, llmOpts, (chunk) => {
            sendSSE(res, 'chunk', { version: 'seedance', text: chunk });
          });
        } else if (ver === 'sora') {
          await generateSoraStoryboardsForEpisode(episodeId, llmOpts, (chunk) => {
            sendSSE(res, 'chunk', { version: 'sora', text: chunk });
          });
        }

        sendSSE(res, 'status', { version: ver, message: `${ver} 版本分镜生成完成` });
      }

      transitionWorkflowEpisode(episodeId, 'generating_storyboards', 'storyboards_ready');
      sendSSE(res, 'done', { state: 'storyboards_ready', message: '双版本分镜生成完成' });
    } catch (err: any) {
      setWorkflowErrorEpisode(episodeId, err.message);
      sendSSE(res, 'error', { message: err.message });
    }

    res.end();
  },

  async generateKeyframesEndpoint(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const state = getWorkflowStateEpisode(episodeId);
    if (!state || state.state !== 'storyboards_ready') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，需要先完成分镜生成`, 400);
    }

    if (!transitionWorkflowEpisode(episodeId, 'storyboards_ready', 'generating_keyframes')) {
      throw createError('状态转换失败', 500);
    }

    generateKeyframesForEpisode(episodeId, getImageOpts(req))
      .then(() => {
        transitionWorkflowEpisode(episodeId, 'generating_keyframes', 'completed');
      })
      .catch((err) => setWorkflowErrorEpisode(episodeId, err.message));

    res.json({ success: true, data: { state: 'generating_keyframes', message: '关键帧生成已开始' } });
  },

  getStatus(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const db = getDatabase();
    const state = getWorkflowStateEpisode(episodeId);
    const taskCounts = WorkflowTaskModel.countByEpisode(episodeId);
    const assets = GeneratedAssetModel.findByEpisode(episodeId);

    const currentState = state?.state || 'idle';

    let analysis: any = undefined;
    if (currentState !== 'idle' && currentState !== 'analyzing' && currentState !== 'failed') {
      const chapters = db.prepare('SELECT id, title FROM chapters WHERE episode_id = ?').all(episodeId) as any[];
      const episode = EpisodeModel.findById(episodeId) as any;
      const characters = db.prepare('SELECT id, name, description FROM characters WHERE project_id = ?').all(episode.project_id) as any[];
      const props = db.prepare('SELECT id, name, description FROM props WHERE project_id = ?').all(episode.project_id) as any[];

      let dialogueCount = 0;
      for (const ch of chapters) {
        const scenes = db.prepare('SELECT id FROM scenes WHERE chapter_id = ?').all(ch.id) as any[];
        for (const sc of scenes) {
          const count = db.prepare('SELECT COUNT(*) as c FROM dialogues WHERE storyboard_id IN (SELECT id FROM storyboards WHERE scene_id = ?)').get(sc.id) as any;
          dialogueCount += count.c;
        }
      }

      analysis = { chapters: chapters.length, characters: characters.length, props: props.length, dialogues: dialogueCount };
    }

    // 获取漫剧剧本
    let script: string | undefined;
    const episodeData = db.prepare('SELECT script FROM episodes WHERE id = ?').get(episodeId) as any;
    script = episodeData?.script;

    res.json({
      success: true,
      data: {
        state: currentState,
        progress: state?.progress || 0,
        error: state?.error,
        style_preset: state?.style_preset || 'anime',
        tasks: taskCounts,
        assets_count: assets.length,
        analysis,
        script,
      },
    });
  },

  /**
   * 获取剧集分镜列表
   */
  getStoryboards(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const version = req.query.version as string | undefined;
    const db = getDatabase();

    let query = `
      SELECT sb.*, s.title as scene_title, s.order_index as scene_order,
             c.title as chapter_title, c.order_index as chapter_order
      FROM storyboards sb
      JOIN scenes s ON sb.scene_id = s.id
      JOIN chapters c ON s.chapter_id = c.id
      WHERE c.episode_id = ?
    `;
    const params: any[] = [episodeId];

    if (version && version !== 'all') {
      query += ' AND sb.version = ?';
      params.push(version);
    }

    query += ' ORDER BY c.order_index, s.order_index, sb.order_index';

    const storyboards = db.prepare(query).all(...params);

    res.json({ success: true, data: storyboards });
  },

  reset(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    WorkflowTaskModel.deleteByEpisode(episodeId);
    GeneratedAssetModel.deleteByEpisode(episodeId);
    resetWorkflowEpisode(episodeId);

    res.json({ success: true, data: { state: 'idle' } });
  },

  async retryFailed(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;

    const state = getWorkflowStateEpisode(episodeId);
    if (state?.state !== 'failed') {
      throw createError('工作流未处于失败状态', 400);
    }

    const failedTasks = WorkflowTaskModel.findByEpisode(episodeId, 'failed') as any[];
    const taskTypes = failedTasks.map((t: any) => t.task_type);

    // Determine which step failed based on task types
    const isAssetTask = (t: string) => ['generate_character', 'generate_background', 'generate_prop', 'generate_asset_audio'].includes(t);
    const isKeyframeTask = (t: string) => t === 'generate_keyframe';

    if (taskTypes.every(isAssetTask)) {
      // Failed at asset generation — re-queue assets
      if (!transitionWorkflowEpisode(episodeId, 'failed', 'generating_assets')) {
        throw createError('状态转换失败', 500);
      }
      for (const task of failedTasks) WorkflowTaskModel.incrementRetry(task.id);
      processAssetQueueForEpisode(episode.project_id, episodeId, getImageOpts(req))
        .then(() => {
          const counts = WorkflowTaskModel.countByEpisode(episodeId);
          if (counts.failed > 0 && counts.completed === 0) {
            setWorkflowErrorEpisode(episodeId, '素材生成全部失败');
          } else {
            transitionWorkflowEpisode(episodeId, 'generating_assets', 'assets_ready');
          }
        })
        .catch((err: any) => setWorkflowErrorEpisode(episodeId, err.message));

      res.json({ success: true, data: { target: 'generating_assets', message: '已重新启动素材生成' } });
    } else if (taskTypes.every(isKeyframeTask)) {
      // Failed at keyframe generation
      if (!transitionWorkflowEpisode(episodeId, 'failed', 'generating_keyframes')) {
        throw createError('状态转换失败', 500);
      }
      for (const task of failedTasks) WorkflowTaskModel.incrementRetry(task.id);
      generateKeyframesForEpisode(episodeId, getImageOpts(req))
        .then(() => transitionWorkflowEpisode(episodeId, 'generating_keyframes', 'completed'))
        .catch((err: any) => setWorkflowErrorEpisode(episodeId, err.message));

      res.json({ success: true, data: { target: 'generating_keyframes', message: '已重新启动关键帧生成' } });
    } else {
      // Unknown or mixed — go back to reviewing
      if (!transitionWorkflowEpisode(episodeId, 'failed', 'reviewing')) {
        throw createError('状态转换失败', 500);
      }
      for (const task of failedTasks) WorkflowTaskModel.incrementRetry(task.id);
      res.json({ success: true, data: { target: 'reviewing', message: '已重置到审核步骤，请重新审批' } });
    }
  },

  // ==================== Stage 5: Video Generation ====================

  createVideoClips(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const state = getWorkflowStateEpisode(episodeId);
    const allowedStates = ['generating_keyframes', 'completed', 'video_ready', 'generating_video'];
    if (!state || !allowedStates.includes(state.state)) {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，需要先生成关键帧`, 400);
    }

    const result = createVideoClipsForEpisode(episodeId);
    res.json({ success: true, data: { message: `已创建 ${result.total} 个视频片段卡片`, total: result.total } });
  },

  async generateSingleVideoClip(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const assetId = Number(req.params.assetId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const db = getDatabase();
    const asset = db.prepare("SELECT * FROM generated_assets WHERE id = ? AND episode_id = ? AND asset_type = 'video_clip'").get(assetId, episodeId) as any;
    if (!asset) throw createError('视频片段卡片未找到', 404);

    const state = getWorkflowStateEpisode(episodeId);
    if (!state || !['generating_keyframes', 'completed', 'video_ready', 'generating_video'].includes(state.state)) {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，不允许此操作`, 400);
    }

    // Move to generating_video if not already
    if (state.state !== 'generating_video') {
      if (!transitionWorkflowEpisode(episodeId, state.state as any, 'generating_video')) {
        throw createError('状态转换失败', 500);
      }
    }

    // Update status to generating
    db.prepare("UPDATE generated_assets SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(assetId);

    try {
      const metadata = JSON.parse(asset.metadata || '{}');
      const videoPath = await generateVideoClip(asset.prompt, {
        version: metadata.storyboard_version || 'seedance',
        model: req.body.model,
        referenceImagePath: metadata.reference_image || undefined,
        lastFramePath: metadata.last_frame_image || undefined,
        seconds: req.body.seconds || String(metadata.duration || 5),
        ratio: req.body.ratio || metadata.ratio || undefined,
        resolution: req.body.resolution || metadata.resolution || undefined,
        generateAudio: req.body.generate_audio ?? metadata.generate_audio ?? true,
        cameraFixed: req.body.camera_fixed ?? metadata.camera_fixed ?? false,
        api_key: req.body.api_key,
        base_url: req.body.base_url,
      });

      db.prepare("UPDATE generated_assets SET status = 'completed', image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(videoPath, assetId);
    } catch (err: any) {
      db.prepare("UPDATE generated_assets SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(assetId);
      throw err;
    }

    res.json({ success: true, data: { assetId, status: 'completed' } });
  },

  async mergeVideoClips(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;
    const { resolution, title } = req.body || {};

    const state = getWorkflowStateEpisode(episodeId);
    if (!state || state.state !== 'generating_video') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，需要先进入视频生成阶段`, 400);
    }

    if (!isFFmpegAvailable()) {
      throw createError('FFmpeg 未安装，无法合成视频', 500);
    }

    const db = getDatabase();
    const video = VideoModel.create({
      project_id: episode.project_id,
      episode_id: episodeId,
      title: title || `剧集 ${episode.episode_number} 合成视频`,
      resolution: resolution || '1080p',
    }) as any;

    // Run merge async
    mergeVideoClips({
      episodeId,
      projectId: episode.project_id,
      videoId: video.id,
      resolution: resolution || '1080p',
      onComplete: () => {
        const finalStatus = db.prepare('SELECT status FROM videos WHERE id = ?').get(video.id) as any;
        if (finalStatus?.status === 'completed') {
          transitionWorkflowEpisode(episodeId, 'generating_video', 'video_ready');
        } else {
          transitionWorkflowEpisode(episodeId, 'generating_video', 'completed');
        }
      },
    }).catch((err) => {
      logger.error(`Video merge failed for episode ${episodeId}:`, err);
      transitionWorkflowEpisode(episodeId, 'generating_video', 'completed');
    });

    res.json({ success: true, data: video, message: '视频合并已开始' });
  },

  getVideos(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const db = getDatabase();
    const videos = db.prepare('SELECT * FROM videos WHERE episode_id = ? ORDER BY created_at DESC').all(episodeId);
    res.json({ success: true, data: videos });
  },

  getVideoStatus(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const db = getDatabase();
    const video = db.prepare('SELECT * FROM videos WHERE episode_id = ? ORDER BY created_at DESC LIMIT 1').get(episodeId) as any;
    if (!video) {
      res.json({ success: true, data: null });
      return;
    }
    res.json({ success: true, data: video });
  },
};

function buildCurrentResultForEpisode(episodeId: number): any {
  const db = getDatabase();

  const chapters = db.prepare(
    'SELECT * FROM chapters WHERE episode_id = ? ORDER BY order_index'
  ).all(episodeId) as any[];

  const episode = EpisodeModel.findById(episodeId) as any;

  const result: any = {
    chapters: chapters.map(ch => {
      const scenes = db.prepare(
        'SELECT * FROM scenes WHERE chapter_id = ? ORDER BY order_index'
      ).all(ch.id) as any[];

      return {
        ...ch,
        scenes: scenes.map(sc => {
          const storyboards = db.prepare(
            'SELECT * FROM storyboards WHERE scene_id = ? ORDER BY order_index'
          ).all(sc.id) as any[];
          return { ...sc, storyboards };
        }),
      };
    }),
    characters: db.prepare('SELECT * FROM characters WHERE project_id = ?').all(episode.project_id),
    props: [],
    dialogues: [],
    sentiment: { positive: 0.33, negative: 0.33, neutral: 0.34, dominant: 'neutral' },
    style_recommendation: 'anime',
  };

  return result;
}

function buildCurrentResult(projectId: number): any {
  const db = getDatabase();

  const chapters = db.prepare(
    'SELECT * FROM chapters WHERE project_id = ? ORDER BY order_index'
  ).all(projectId) as any[];

  const result: any = {
    chapters: chapters.map(ch => {
      const scenes = db.prepare(
        'SELECT * FROM scenes WHERE chapter_id = ? ORDER BY order_index'
      ).all(ch.id) as any[];

      return {
        ...ch,
        scenes: scenes.map(sc => {
          const storyboards = db.prepare(
            'SELECT * FROM storyboards WHERE scene_id = ? ORDER BY order_index'
          ).all(sc.id) as any[];
          return { ...sc, storyboards };
        }),
      };
    }),
    characters: db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId),
    props: [],
    dialogues: [],
    sentiment: { positive: 0.33, negative: 0.33, neutral: 0.34, dominant: 'neutral' },
    style_recommendation: 'anime',
  };

  return result;
}
