import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { getDatabase } from '../database/setup';
import { ProjectModel } from '../models/project';
import { logger } from '../utils/logger';

export const ScriptAnalysisController = {
  analyze(req: AuthRequest, res: Response) {
    const { project_id, text } = req.body;
    if (!project_id || !text) throw createError('项目ID和文本内容不能为空', 400);
    if (!ProjectModel.verifyProjectOwnership(project_id, req.user!.id)) throw createError('项目不存在或无权访问', 404);

    const db = getDatabase();
    db.prepare('UPDATE projects SET novel_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(text, project_id);

    const analysis = analyzeScript(text);

    for (const chapter of analysis.chapters) {
      const chapterResult = db.prepare('INSERT INTO chapters (project_id, title, content, order_index) VALUES (?, ?, ?, ?)').run(project_id, chapter.title, chapter.content, chapter.order_index);
      const chapterId = chapterResult.lastInsertRowid;

      for (const scene of chapter.scenes) {
        const sceneResult = db.prepare('INSERT INTO scenes (chapter_id, title, description, order_index) VALUES (?, ?, ?, ?)').run(chapterId, scene.title, scene.description, scene.order_index);
        const sceneId = sceneResult.lastInsertRowid;

        for (const storyboard of scene.storyboards) {
          db.prepare('INSERT INTO storyboards (scene_id, title, description, duration, camera_angle, order_index) VALUES (?, ?, ?, ?, ?, ?)').run(sceneId, storyboard.title, storyboard.description, storyboard.duration, storyboard.camera_angle, storyboard.order_index);
        }
      }
    }

    for (const character of analysis.characters) {
      const existingChar = db.prepare('SELECT id FROM characters WHERE project_id = ? AND name = ?').get(project_id, character.name);
      if (!existingChar) {
        db.prepare('INSERT INTO characters (project_id, name, description, personality) VALUES (?, ?, ?, ?)').run(project_id, character.name, character.description, character.personality);
      }
    }

    logger.info(`Script analysis completed for project ${project_id}`);
    res.json({
      success: true,
      data: {
        analysis,
        chapters_count: analysis.chapters.length,
        characters_count: analysis.characters.length,
        scenes_count: analysis.chapters.reduce((sum: number, ch: any) => sum + ch.scenes.length, 0),
      },
    });
  },

  getResult(req: AuthRequest, res: Response) {
    const projectId = Number(req.params.projectId);
    if (!ProjectModel.verifyProjectOwnership(projectId, req.user!.id)) throw createError('项目不存在或无权访问', 404);

    const db = getDatabase();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    const chapters = db.prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY order_index').all(projectId) as any[];

    const chaptersWithScenes = chapters.map((chapter: any) => {
      const scenes = db.prepare('SELECT * FROM scenes WHERE chapter_id = ? ORDER BY order_index').all(chapter.id) as any[];
      const scenesWithStoryboards = scenes.map((scene: any) => {
        const storyboards = db.prepare('SELECT * FROM storyboards WHERE scene_id = ? ORDER BY order_index').all(scene.id);
        return { ...scene, storyboards };
      });
      return { ...chapter, scenes: scenesWithStoryboards };
    });

    const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId);
    res.json({ success: true, data: { project, chapters: chaptersWithScenes, characters } });
  },
};

function analyzeScript(text: string) {
  const chapters = splitChapters(text);
  const characters = extractCharacters(text);
  const sentiment = analyzeSentiment(text);
  return { chapters, characters, sentiment, total_chars: text.length, total_lines: text.split('\n').length };
}

function splitChapters(text: string) {
  const chapterPatterns = [/^第[一二三四五六七八九十百千\d]+[章节回]/m, /^Chapter\s+\d+/im, /^卷[一二三四五六七八九十百千\d]+/m];
  let splits: { index: number; title: string }[] = [];

  for (const pattern of chapterPatterns) {
    const matches = text.matchAll(new RegExp(pattern, 'gm'));
    for (const match of matches) {
      if (match.index !== undefined) splits.push({ index: match.index, title: match[0].trim() });
    }
  }

  if (splits.length === 0) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    const chunkSize = Math.max(1, Math.floor(paragraphs.length / 3));
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      splits.push({ index: i, title: `第${Math.floor(i / chunkSize) + 1}章` });
    }
    return splits.map((split, idx) => {
      const start = idx * chunkSize;
      const end = Math.min(start + chunkSize, paragraphs.length);
      const content = paragraphs.slice(start, end).join('\n\n');
      return { title: split.title, content, order_index: idx, scenes: splitIntoScenes(content) };
    });
  }

  splits.sort((a, b) => a.index - b.index);
  return splits.map((split, idx) => {
    const start = split.index;
    const end = idx < splits.length - 1 ? splits[idx + 1].index : text.length;
    const content = text.slice(start, end).trim();
    return { title: split.title, content, order_index: idx, scenes: splitIntoScenes(content) };
  });
}

function splitIntoScenes(text: string) {
  const scenePatterns = [/^[【\[](.*?)[】\]]/m, /^\s*[-—]{3,}\s*$/m, /^场景[：:]/m, /^地点[：:]/m];
  let sceneSplits: { index: number; title: string }[] = [];

  for (const pattern of scenePatterns) {
    const matches = text.matchAll(new RegExp(pattern, 'gm'));
    for (const match of matches) {
      if (match.index !== undefined) sceneSplits.push({ index: match.index, title: match[1]?.trim() || `场景 ${sceneSplits.length + 1}` });
    }
  }

  if (sceneSplits.length === 0) {
    const lines = text.split('\n');
    const chunkSize = Math.max(3, Math.floor(lines.length / 3));
    const scenes = [];
    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunk = lines.slice(i, i + chunkSize);
      scenes.push({ title: `场景 ${scenes.length + 1}`, description: chunk.slice(0, 2).join(' ').substring(0, 100), order_index: scenes.length, storyboards: generateStoryboards(chunk.join('\n')) });
    }
    return scenes;
  }

  sceneSplits.sort((a, b) => a.index - b.index);
  return sceneSplits.map((split, idx) => {
    const start = split.index;
    const end = idx < sceneSplits.length - 1 ? sceneSplits[idx + 1].index : text.length;
    const content = text.slice(start, end).trim();
    return { title: split.title, description: content.substring(0, 100), order_index: idx, storyboards: generateStoryboards(content) };
  });
}

function generateStoryboards(text: string) {
  const lines = text.split('\n').filter(line => line.trim());
  const storyboards = [];
  let frameIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const dialogueMatch = line.match(/^["「](.*?)["」]/) || line.match(/^([^：:]+)[：:](.+)/);
    if (dialogueMatch) {
      storyboards.push({ title: `分镜 ${frameIndex + 1}`, description: line.substring(0, 50), duration: 3.0, camera_angle: 'medium', order_index: frameIndex });
      frameIndex++;
    }
    if (i > 0 && i % 3 === 0) {
      storyboards.push({ title: `分镜 ${frameIndex + 1}`, description: lines.slice(Math.max(0, i - 2), i + 1).join(' ').substring(0, 50), duration: 5.0, camera_angle: 'wide', order_index: frameIndex });
      frameIndex++;
    }
  }

  if (storyboards.length === 0) {
    storyboards.push({ title: '分镜 1', description: text.substring(0, 50), duration: 5.0, camera_angle: 'medium', order_index: 0 });
  }
  return storyboards;
}

function extractCharacters(text: string) {
  const characters: { name: string; description: string; personality: string }[] = [];
  const namePatterns = [/["「](.*?)["」]/g, /^([^：:]+)[：:]/gm];
  const names = new Set<string>();

  for (const pattern of namePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1]?.trim();
      if (name && name.length <= 10 && !names.has(name)) names.add(name);
    }
  }

  names.forEach(name => {
    characters.push({ name, description: `从剧本中提取的角色：${name}`, personality: '待补充' });
  });
  return characters;
}

function analyzeSentiment(text: string) {
  const positiveWords = ['开心', '快乐', '幸福', '喜悦', '兴奋', '激动', '感动', '温暖', '美好', '希望', '爱', '喜欢', '高兴', '满意', '成功', '胜利', '祝福'];
  const negativeWords = ['悲伤', '痛苦', '难过', '伤心', '绝望', '愤怒', '生气', '失望', '担心', '害怕', '恐惧', '焦虑', '忧愁', '遗憾', '失败', '死亡', '离别'];
  const neutralWords = ['平静', '安静', '沉默', '思考', '观察', '等待', '准备', '计划', '决定', '考虑'];

  let positiveCount = 0, negativeCount = 0, neutralCount = 0;
  positiveWords.forEach(word => { const m = text.match(new RegExp(word, 'g')); if (m) positiveCount += m.length; });
  negativeWords.forEach(word => { const m = text.match(new RegExp(word, 'g')); if (m) negativeCount += m.length; });
  neutralWords.forEach(word => { const m = text.match(new RegExp(word, 'g')); if (m) neutralCount += m.length; });

  const total = positiveCount + negativeCount + neutralCount || 1;
  return {
    positive: positiveCount / total,
    negative: negativeCount / total,
    neutral: neutralCount / total,
    dominant: positiveCount > negativeCount && positiveCount > neutralCount ? 'positive' : negativeCount > positiveCount && negativeCount > neutralCount ? 'negative' : 'neutral',
  };
}
