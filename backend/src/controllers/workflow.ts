import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { getDatabase } from '../database/setup';
import { analyzeScriptWithLLM, analyzeScriptWithLLMStream, reviewScriptWithLLM, reviseScriptWithLLM, reviseScriptWithLLMStream, reviewScriptWithLLMStream } from '../services/llm-analysis';
import { analyzeWithTypeChat, suggestEpisodesWithTypeChat, reviewWithTypeChat } from '../services/typechat';
import { processAssetQueue, processAssetQueueForEpisode, generateAssetAudio } from '../services/asset-generator';
import { generateStoryboardsForProject, generateStoryboardsForProjectStream, generateStoryboardsForEpisode } from '../services/storyboard-generator';
import { generateKeyframes, generateKeyframesForEpisode } from '../services/keyframe-composer';
import { transitionWorkflow, setWorkflowError, getWorkflowState, resetWorkflow,
         transitionWorkflowEpisode, setWorkflowErrorEpisode, getWorkflowStateEpisode, resetWorkflowEpisode } from '../services/workflow';
import { EpisodeModel } from '../models/episode';
import { WorkflowTaskModel } from '../models/workflow-task';
import { GeneratedAssetModel } from '../models/generated-asset';
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

        for (const scene of chapter.scenes) {
          const scResult = db.prepare(
            'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
          const sceneId = scResult.lastInsertRowid;

          for (const sb of scene.storyboards) {
            db.prepare(
              'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
          }
        }
      }

      for (const char of result.characters) {
        db.prepare(
          'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(projectId, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
      }

      for (const prop of (result.props || [])) {
        GeneratedAssetModel.create({
          project_id: projectId,
          asset_type: 'prop',
          entity_type: 'project',
          entity_id: projectId,
          name: prop.name,
          description: prop.description,
          prompt: prop.image_prompt,
          image_url: 'pending',
          style_preset: stylePreset,
          status: 'pending',
        });
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
   * Stage 1: TypeChat 分析 — 自动验证 JSON
   */
  async analyzeTypeChat(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    const project = verifyOwnership(projectId, req.user!.id) as any;

    if (!project.novel_text) {
      throw createError('项目没有小说文本', 400);
    }

    const state = getWorkflowState(projectId);
    const from = state?.state || 'idle';
    if (from !== 'idle' && from !== 'failed' && from !== 'analyzing') {
      throw createError(`工作流当前状态为 ${from}，无法开始分析`, 400);
    }

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

    try {
      const db = getDatabase();
      const stylePreset = project.style_preset || 'anime';

      db.prepare('DELETE FROM chapters WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM characters WHERE project_id = ?').run(projectId);

      const result = await analyzeWithTypeChat(project.novel_text, stylePreset, llmOpts);

      for (const chapter of result.chapters) {
        const chResult = db.prepare(
          'INSERT INTO chapters (project_id, title, content, order_index) VALUES (?, ?, ?, ?)'
        ).run(projectId, chapter.title, chapter.content, chapter.order_index);
        const chapterId = chResult.lastInsertRowid;

        for (const scene of chapter.scenes) {
          const scResult = db.prepare(
            'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
          const sceneId = scResult.lastInsertRowid;

          for (const sb of scene.storyboards) {
            db.prepare(
              'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
          }
        }
      }

      for (const char of result.characters) {
        db.prepare(
          'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(projectId, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
      }

      for (const prop of (result.props || [])) {
        db.prepare(
          'INSERT INTO generated_assets (project_id, asset_type, entity_type, entity_id, name, description, prompt, image_url, style_preset, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(projectId, 'prop', 'project', projectId, prop.name, prop.description, prop.image_prompt, 'pending', stylePreset, 'pending');
      }

      if (result.script) {
        db.prepare('UPDATE projects SET script = ? WHERE id = ?').run(result.script, projectId);
      }

      transitionWorkflow(projectId, 'analyzing', 'reviewing');
      db.prepare("UPDATE projects SET status = 'in_progress' WHERE id = ?").run(projectId);

      res.json({
        success: true,
        data: {
          state: 'reviewing',
          chapters: result.chapters.length,
          characters: result.characters.length,
          script: result.script,
        },
      });
    } catch (err: any) {
      const errMsg = err.message || String(err);
      setWorkflowError(projectId, errMsg);
      throw createError(`TypeChat 分析失败: ${errMsg}`, 500);
    }
  },

  /**
   * TypeChat 审核剧本
   */
  async reviewTypeChat(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    if (!state || state.state !== 'reviewing') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法审核`, 400);
    }

    const llmOpts = getLLMOpts(req);
    const db = getDatabase();
    const project = db.prepare('SELECT novel_text FROM projects WHERE id = ?').get(projectId) as any;

    try {
      const chapters = db.prepare('SELECT * FROM chapters WHERE project_id = ?').all(projectId);
      const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId);
      const analysisJson = JSON.stringify({ chapters, characters });

      const review = await reviewWithTypeChat(analysisJson, project.novel_text, llmOpts);

      res.json({ success: true, data: review });
    } catch (err: any) {
      throw createError(`TypeChat 审核失败: ${err.message}`, 500);
    }
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
      const currentResult = buildCurrentResult(projectId);

      const revised = await reviseScriptWithLLMStream(currentResult, feedback, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      });

      sendSSE(res, 'status', { message: '正在保存修改结果...' });

      db.prepare('DELETE FROM chapters WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM characters WHERE project_id = ?').run(projectId);

      for (const chapter of revised.chapters) {
        const chResult = db.prepare(
          'INSERT INTO chapters (project_id, title, content, order_index) VALUES (?, ?, ?, ?)'
        ).run(projectId, chapter.title, chapter.content, chapter.order_index);
        const chapterId = chResult.lastInsertRowid;

        for (const scene of chapter.scenes) {
          const scResult = db.prepare(
            'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
          const sceneId = scResult.lastInsertRowid;

          for (const sb of scene.storyboards) {
            db.prepare(
              'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
          }
        }
      }

      for (const char of revised.characters) {
        db.prepare(
          'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(projectId, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
      }

      sendSSE(res, 'status', { message: '正在 AI 审核...' });

      const project = db.prepare('SELECT novel_text FROM projects WHERE id = ?').get(projectId) as any;
      const review = await reviewScriptWithLLM(revised, project.novel_text, llmOpts);

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
      const currentResult = buildCurrentResult(projectId);
      const project = db.prepare('SELECT novel_text FROM projects WHERE id = ?').get(projectId) as any;

      const review = await reviewScriptWithLLMStream(currentResult, project.novel_text, llmOpts, (chunk) => {
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
   * Stage 2: 批量生成素材
   */
  async generateAssets(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    verifyOwnership(projectId, req.user!.id);

    const state = getWorkflowState(projectId);
    const currentState = state?.state || 'idle';
    if (currentState !== 'reviewing' && currentState !== 'assets_ready') {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成剧本审核`, 400);
    }

    if (!transitionWorkflow(projectId, currentState as any, 'generating_assets')) {
      throw createError('状态转换失败', 500);
    }

    processAssetQueue(projectId)
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
    if (!state || state.state !== 'assets_ready') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，需要先完成素材生成`, 400);
    }

    if (!transitionWorkflow(projectId, 'assets_ready', 'generating_storyboards')) {
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

    generateKeyframes(projectId)
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
      const props = db.prepare("SELECT id, name, description FROM generated_assets WHERE project_id = ? AND asset_type = 'prop'").all(projectId) as any[];

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

            for (const scene of chapter.scenes) {
              const scResult = db.prepare(
                'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
              const sceneId = scResult.lastInsertRowid;

              for (const sb of scene.storyboards) {
                db.prepare(
                  'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
              }
            }
          }

          for (const char of result.characters) {
            db.prepare(
              'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(projectId, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
          }

          for (const prop of (result.props || [])) {
            GeneratedAssetModel.create({
              project_id: projectId,
              asset_type: 'prop',
              entity_type: 'project',
              entity_id: projectId,
              name: prop.name,
              description: prop.description,
              prompt: prop.image_prompt,
              image_url: 'pending',
              style_preset: project.style_preset || 'anime',
              status: 'pending',
            });
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

    const failedTasks = WorkflowTaskModel.findByProject(projectId, 'failed') as any[];
    for (const task of failedTasks) {
      WorkflowTaskModel.incrementRetry(task.id);
    }

    res.json({
      success: true,
      data: { retried: failedTasks.length, message: `已重试 ${failedTasks.length} 个失败任务` },
    });
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

        for (const scene of chapter.scenes) {
          const scResult = db.prepare(
            'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
          const sceneId = scResult.lastInsertRowid;

          for (const sb of scene.storyboards) {
            db.prepare(
              'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
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

      for (const prop of (result.props || [])) {
        GeneratedAssetModel.createWithEpisode({
          project_id: projectId,
          episode_id: episodeId,
          asset_type: 'prop',
          entity_type: 'project',
          entity_id: projectId,
          name: prop.name,
          description: prop.description,
          prompt: prop.image_prompt,
          image_url: 'pending',
          style_preset: stylePreset,
          status: 'pending',
        });
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

  /**
   * TypeChat 分析 — 自动验证 JSON
   */
  async analyzeTypeChat(req: AuthRequest, res: Response) {
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

    try {
      const db = getDatabase();
      const stylePreset = episode.style_preset || 'anime';

      db.prepare('DELETE FROM chapters WHERE episode_id = ?').run(episodeId);

      const result = await analyzeWithTypeChat(episode.novel_text_segment, stylePreset, llmOpts);

      for (const chapter of result.chapters) {
        const chResult = db.prepare(
          'INSERT INTO chapters (project_id, episode_id, title, content, order_index) VALUES (?, ?, ?, ?, ?)'
        ).run(projectId, episodeId, chapter.title, chapter.content, chapter.order_index);
        const chapterId = chResult.lastInsertRowid;

        for (const scene of chapter.scenes) {
          const scResult = db.prepare(
            'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
          const sceneId = scResult.lastInsertRowid;

          for (const sb of scene.storyboards) {
            db.prepare(
              'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
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

      if (result.script) {
        db.prepare('UPDATE episodes SET script = ? WHERE id = ?').run(result.script, episodeId);
      }

      transitionWorkflowEpisode(episodeId, 'analyzing', 'reviewing');

      res.json({
        success: true,
        data: {
          state: 'reviewing',
          chapters: result.chapters.length,
          characters: result.characters.length,
          script: result.script,
        },
      });
    } catch (err: any) {
      const errMsg = err.message || String(err);
      setWorkflowErrorEpisode(episodeId, errMsg);
      throw createError(`TypeChat 分析失败: ${errMsg}`, 500);
    }
  },

  /**
   * TypeChat 审核
   */
  async reviewTypeChat(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const state = getWorkflowStateEpisode(episodeId);
    if (!state || state.state !== 'reviewing') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，无法审核`, 400);
    }

    const llmOpts = getLLMOpts(req);
    const db = getDatabase();
    const episode = db.prepare('SELECT novel_text_segment FROM episodes WHERE id = ?').get(episodeId) as any;

    try {
      const chapters = db.prepare('SELECT * FROM chapters WHERE episode_id = ?').all(episodeId);
      const characters = db.prepare('SELECT c.* FROM characters c JOIN episodes e ON c.project_id = e.project_id WHERE e.id = ?').all(episodeId);
      const analysisJson = JSON.stringify({ chapters, characters });

      const review = await reviewWithTypeChat(analysisJson, episode.novel_text_segment, llmOpts);

      res.json({ success: true, data: review });
    } catch (err: any) {
      throw createError(`TypeChat 审核失败: ${err.message}`, 500);
    }
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
      const currentResult = buildCurrentResultForEpisode(episodeId);

      const revised = await reviseScriptWithLLMStream(currentResult, feedback, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      });

      sendSSE(res, 'status', { message: '正在保存修改结果...' });

      db.prepare('DELETE FROM chapters WHERE episode_id = ?').run(episodeId);

      for (const chapter of revised.chapters) {
        const chResult = db.prepare(
          'INSERT INTO chapters (project_id, episode_id, title, content, order_index) VALUES (?, ?, ?, ?, ?)'
        ).run(episode.project_id, episodeId, chapter.title, chapter.content, chapter.order_index);
        const chapterId = chResult.lastInsertRowid;

        for (const scene of chapter.scenes) {
          const scResult = db.prepare(
            'INSERT INTO scenes (chapter_id, title, description, location, time_of_day, mood, atmosphere, visual_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(chapterId, scene.title, scene.description, scene.location, scene.time_of_day, scene.mood, scene.atmosphere, scene.visual_description, scene.order_index);
          const sceneId = scResult.lastInsertRowid;

          for (const sb of scene.storyboards) {
            db.prepare(
              'INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, camera_movement, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(sceneId, sb.title, sb.description, sb.duration, sb.camera_angle, sb.camera_movement, sb.order_index);
          }
        }
      }

      const existingChars = db.prepare('SELECT name FROM characters WHERE project_id = ?').all(episode.project_id) as any[];
      const existingNames = new Set(existingChars.map((c: any) => c.name));
      for (const char of revised.characters) {
        if (!existingNames.has(char.name)) {
          db.prepare(
            'INSERT INTO characters (project_id, name, description, personality, appearance, clothing, distinguishing_features, age_range, build, visual_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(episode.project_id, char.name, char.description, char.personality, char.appearance, char.clothing, char.distinguishing_features, char.age_range, char.build, char.visual_prompt);
        }
      }

      sendSSE(res, 'status', { message: '正在 AI 审核...' });

      const review = await reviewScriptWithLLM(revised, episode.novel_text_segment, llmOpts);

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
      const currentResult = buildCurrentResultForEpisode(episodeId);

      const review = await reviewScriptWithLLMStream(currentResult, episode.novel_text_segment, llmOpts, (chunk) => {
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

  generateAssets(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    const episode = verifyEpisodeOwnership(episodeId, req.user!.id) as any;

    const state = getWorkflowStateEpisode(episodeId);
    const currentState = state?.state || 'idle';
    if (currentState !== 'reviewing' && currentState !== 'assets_ready') {
      throw createError(`工作流当前状态为 ${currentState}，需要先完成剧本审核`, 400);
    }

    if (!transitionWorkflowEpisode(episodeId, currentState as any, 'generating_assets')) {
      throw createError('状态转换失败', 500);
    }

    processAssetQueueForEpisode(episode.project_id, episodeId)
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
    const assets = GeneratedAssetModel.findByEpisode(episodeId, type);
    res.json({ success: true, data: assets });
  },

  async generateStoryboards(req: AuthRequest, res: Response) {
    const episodeId = Number(req.params.episodeId);
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const state = getWorkflowStateEpisode(episodeId);
    if (!state || state.state !== 'assets_ready') {
      throw createError(`工作流当前状态为 ${state?.state || 'idle'}，需要先完成素材生成`, 400);
    }

    if (!transitionWorkflowEpisode(episodeId, 'assets_ready', 'generating_storyboards')) {
      throw createError('状态转换失败', 500);
    }

    const llmOpts = getLLMOpts(req);

    initSSE(res);

    try {
      await generateStoryboardsForEpisode(episodeId, llmOpts, (chunk) => {
        sendSSE(res, 'chunk', { text: chunk });
      });

      transitionWorkflowEpisode(episodeId, 'generating_storyboards', 'storyboards_ready');
      sendSSE(res, 'done', { state: 'storyboards_ready', message: '分镜生成完成' });
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

    generateKeyframesForEpisode(episodeId)
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
      const props = db.prepare("SELECT id, name, description FROM generated_assets WHERE episode_id = ? AND asset_type = 'prop'").all(episodeId) as any[];

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
    verifyEpisodeOwnership(episodeId, req.user!.id);

    const failedTasks = WorkflowTaskModel.findByEpisode(episodeId, 'failed') as any[];
    for (const task of failedTasks) {
      WorkflowTaskModel.incrementRetry(task.id);
    }

    res.json({
      success: true,
      data: { retried: failedTasks.length, message: `已重试 ${failedTasks.length} 个失败任务` },
    });
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
