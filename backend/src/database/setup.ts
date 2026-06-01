import Database from 'better-sqlite3';
import path from 'path';
import { logger } from '../utils/logger';

const dbPath = process.env.DB_PATH || './database/app.db';

let db: Database.Database;

export const getDatabase = (): Database.Database => {
  if (!db) {
    throw new Error('Database not initialized. Call setupDatabase() first.');
  }
  return db;
};

export const setupDatabase = async (): Promise<void> => {
  try {
    // 确保数据库目录存在
    const dbDir = path.dirname(dbPath);
    const fs = require('fs');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);

    // 启用WAL模式提升并发性能
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // 创建用户表
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建项目表
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'in_progress', 'completed', 'archived')),
        cover_image TEXT,
        novel_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 创建剧集表
    db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        episode_number INTEGER NOT NULL,
        target_minutes REAL DEFAULT 3.0,
        novel_text_segment TEXT,
        workflow_state TEXT DEFAULT 'idle',
        workflow_error TEXT,
        workflow_progress REAL DEFAULT 0,
        style_preset TEXT DEFAULT 'anime',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // 创建章节表
    db.exec(`
      CREATE TABLE IF NOT EXISTS chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        order_index INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // 创建场景表
    db.exec(`
      CREATE TABLE IF NOT EXISTS scenes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chapter_id INTEGER NOT NULL,
        title TEXT,
        description TEXT,
        background_image TEXT,
        order_index INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
      )
    `);

    // 创建角色表
    db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        personality TEXT,
        appearance TEXT,
        avatar TEXT,
        style TEXT DEFAULT 'anime',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // 创建道具表
    db.exec(`
      CREATE TABLE IF NOT EXISTS props (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        image_prompt TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // 创建分镜表
    db.exec(`
      CREATE TABLE IF NOT EXISTS storyboards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scene_id INTEGER NOT NULL,
        title TEXT,
        description TEXT,
        image_url TEXT,
        duration REAL DEFAULT 5.0,
        camera_angle TEXT,
        camera_movement TEXT,
        order_index INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
      )
    `);

    // 创建对话气泡表
    db.exec(`
      CREATE TABLE IF NOT EXISTS dialogues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        storyboard_id INTEGER NOT NULL,
        character_id INTEGER,
        content TEXT NOT NULL,
        position_x REAL DEFAULT 50,
        position_y REAL DEFAULT 50,
        style TEXT DEFAULT 'speech',
        order_index INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
      )
    `);

    // 创建视频表
    db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT,
        description TEXT,
        file_path TEXT,
        thumbnail TEXT,
        duration REAL,
        resolution TEXT DEFAULT '1080p',
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // 创建资源表
    db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('character', 'scene', 'audio', 'font', 'template')),
        file_path TEXT NOT NULL,
        thumbnail TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    // 创建模板表
    db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'drama',
        structure TEXT NOT NULL,
        thumbnail TEXT,
        builtin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migrations: add new columns to existing tables
    const migrations = [
      "ALTER TABLE storyboards ADD COLUMN transition_type TEXT DEFAULT 'cut'",
      "ALTER TABLE storyboards ADD COLUMN transition_duration REAL DEFAULT 0.5",
      "ALTER TABLE videos ADD COLUMN bgm_path TEXT",
      "ALTER TABLE videos ADD COLUMN bgm_volume REAL DEFAULT 0.5",
      "ALTER TABLE dialogues ADD COLUMN audio_path TEXT",
      "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
      // Workflow state tracking
      "ALTER TABLE projects ADD COLUMN workflow_state TEXT DEFAULT 'idle'",
      "ALTER TABLE projects ADD COLUMN style_preset TEXT DEFAULT 'anime'",
      "ALTER TABLE projects ADD COLUMN style_seed TEXT",
      "ALTER TABLE projects ADD COLUMN workflow_error TEXT",
      "ALTER TABLE projects ADD COLUMN workflow_progress REAL DEFAULT 0",
      // Character rich metadata
      "ALTER TABLE characters ADD COLUMN clothing TEXT",
      "ALTER TABLE characters ADD COLUMN distinguishing_features TEXT",
      "ALTER TABLE characters ADD COLUMN age_range TEXT",
      "ALTER TABLE characters ADD COLUMN build TEXT",
      "ALTER TABLE characters ADD COLUMN visual_prompt TEXT",
      // Scene visual metadata
      "ALTER TABLE scenes ADD COLUMN location TEXT",
      "ALTER TABLE scenes ADD COLUMN time_of_day TEXT",
      "ALTER TABLE scenes ADD COLUMN mood TEXT",
      "ALTER TABLE scenes ADD COLUMN atmosphere TEXT",
      "ALTER TABLE scenes ADD COLUMN visual_description TEXT",
      // Storyboard composition tracking
      "ALTER TABLE storyboards ADD COLUMN background_asset_id INTEGER",
      "ALTER TABLE storyboards ADD COLUMN character_asset_ids TEXT",
      "ALTER TABLE storyboards ADD COLUMN composition_data TEXT",
      // Dialogue emotion/action
      "ALTER TABLE dialogues ADD COLUMN emotion TEXT",
      "ALTER TABLE dialogues ADD COLUMN action_description TEXT",
      // Asset card fields
      "ALTER TABLE generated_assets ADD COLUMN voice_prompt TEXT",
      "ALTER TABLE generated_assets ADD COLUMN audio_url TEXT",
      "ALTER TABLE generated_assets ADD COLUMN name TEXT",
      "ALTER TABLE generated_assets ADD COLUMN description TEXT",
      // Episode scoping
      "ALTER TABLE chapters ADD COLUMN episode_id INTEGER",
      "ALTER TABLE workflow_tasks ADD COLUMN episode_id INTEGER",
      "ALTER TABLE generated_assets ADD COLUMN episode_id INTEGER",
      // Seedance 2.0 format
      "ALTER TABLE storyboards ADD COLUMN seedance_prompt TEXT",
      "ALTER TABLE projects ADD COLUMN aspect_ratio TEXT DEFAULT '16:9'",
      "ALTER TABLE episodes ADD COLUMN aspect_ratio TEXT DEFAULT '16:9'",
      // Dual-version storyboards
      "ALTER TABLE storyboards ADD COLUMN version TEXT DEFAULT 'standard'",
      "ALTER TABLE storyboards ADD COLUMN sora_prompt TEXT",
      "ALTER TABLE storyboards ADD COLUMN last_frame_image TEXT",
      "ALTER TABLE episodes ADD COLUMN script TEXT",
      "ALTER TABLE videos ADD COLUMN episode_id INTEGER",
      // Fix generated_assets CHECK constraint to include video_clip
      `DROP TABLE IF EXISTS generated_assets_new;
       BEGIN;
       CREATE TABLE generated_assets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL CHECK(asset_type IN ('character_design','character_expression','character_pose','background','prop','keyframe','video_clip')),
        entity_type TEXT CHECK(entity_type IN ('character','scene','storyboard','project','prop')),
        entity_id INTEGER,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        image_url TEXT NOT NULL,
        thumbnail_url TEXT,
        style_seed TEXT,
        style_preset TEXT DEFAULT 'anime',
        width INTEGER DEFAULT 1024,
        height INTEGER DEFAULT 1024,
        metadata TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','generating','completed','failed')),
        name TEXT,
        description TEXT,
        episode_id INTEGER,
        voice_prompt TEXT,
        audio_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
       );
       INSERT OR IGNORE INTO generated_assets_new SELECT * FROM generated_assets;
       DROP TABLE generated_assets;
       ALTER TABLE generated_assets_new RENAME TO generated_assets;
       CREATE INDEX IF NOT EXISTS idx_generated_assets_project_type ON generated_assets(project_id, asset_type);
       CREATE INDEX IF NOT EXISTS idx_generated_assets_episode ON generated_assets(episode_id);
       COMMIT;`,
      // Move props from generated_assets to props table
      `INSERT OR IGNORE INTO props (project_id, name, description, image_prompt)
       SELECT DISTINCT project_id, COALESCE(name, '未知道具'), COALESCE(description, ''), COALESCE(prompt, '')
       FROM generated_assets WHERE asset_type = 'prop' AND project_id IS NOT NULL`,
      `DELETE FROM generated_assets WHERE asset_type = 'prop'`,
      // Add 'prop' to entity_type CHECK constraint
      `DROP TABLE IF EXISTS generated_assets_v2;
       BEGIN;
       CREATE TABLE generated_assets_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL CHECK(asset_type IN ('character_design','character_expression','character_pose','background','prop','keyframe','video_clip')),
        entity_type TEXT CHECK(entity_type IN ('character','scene','storyboard','project','prop')),
        entity_id INTEGER,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        image_url TEXT NOT NULL,
        thumbnail_url TEXT,
        style_seed TEXT,
        style_preset TEXT DEFAULT 'anime',
        width INTEGER DEFAULT 1024,
        height INTEGER DEFAULT 1024,
        metadata TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','generating','completed','failed')),
        name TEXT,
        description TEXT,
        episode_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
       );
       INSERT OR IGNORE INTO generated_assets_v2 SELECT * FROM generated_assets;
       DROP TABLE generated_assets;
       ALTER TABLE generated_assets_v2 RENAME TO generated_assets;
       CREATE INDEX IF NOT EXISTS idx_generated_assets_project_type ON generated_assets(project_id, asset_type);
       CREATE INDEX IF NOT EXISTS idx_generated_assets_episode ON generated_assets(episode_id);
       COMMIT;`,
    ];
    for (const sql of migrations) {
      try { db.exec(sql); } catch (err: any) {
        if (err?.code !== 'SQLITE_BUSY') {
          logger.warn(`Migration skipped (safe): ${err?.message?.slice(0, 80)}`);
        }
      }
    }

    // Ensure generated_assets entity_type constraint includes 'prop'
    try { db.exec('ROLLBACK'); } catch {}  // clear any doomed transaction from failed migrations
    const gaSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='generated_assets'").get() as any;
    if (gaSql && gaSql.sql && !gaSql.sql.includes("'prop'")) {
      logger.info('Fixing generated_assets entity_type constraint to include prop');
      db.exec(`
        DROP TABLE IF EXISTS generated_assets_fix;
        CREATE TABLE generated_assets_fix (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          asset_type TEXT NOT NULL CHECK(asset_type IN ('character_design','character_expression','character_pose','background','prop','keyframe','video_clip')),
          entity_type TEXT CHECK(entity_type IN ('character','scene','storyboard','project','prop')),
          entity_id INTEGER,
          prompt TEXT NOT NULL,
          negative_prompt TEXT,
          image_url TEXT NOT NULL,
          thumbnail_url TEXT,
          style_seed TEXT,
          style_preset TEXT DEFAULT 'anime',
          width INTEGER DEFAULT 1024,
          height INTEGER DEFAULT 1024,
          metadata TEXT,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending','generating','completed','failed')),
          name TEXT,
          description TEXT,
          episode_id INTEGER,
          voice_prompt TEXT,
          audio_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        INSERT OR IGNORE INTO generated_assets_fix SELECT * FROM generated_assets;
        DROP TABLE generated_assets;
        ALTER TABLE generated_assets_fix RENAME TO generated_assets;
        CREATE INDEX IF NOT EXISTS idx_generated_assets_project_type ON generated_assets(project_id, asset_type);
        CREATE INDEX IF NOT EXISTS idx_generated_assets_episode ON generated_assets(episode_id);
      `);
    }

    // 创建角色表情库表
    db.exec(`
      CREATE TABLE IF NOT EXISTS character_expressions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        emotion TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      )
    `);

    // 创建角色动作库表
    db.exec(`
      CREATE TABLE IF NOT EXISTS character_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        category TEXT DEFAULT 'general',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      )
    `);

    // 创建项目版本表
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        version_num INTEGER NOT NULL,
        label TEXT,
        snapshot TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Workflow: generated assets table
    db.exec(`
      CREATE TABLE IF NOT EXISTS generated_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL CHECK(asset_type IN ('character_design','character_expression','character_pose','background','prop','keyframe','video_clip')),
        entity_type TEXT CHECK(entity_type IN ('character','scene','storyboard','project','prop')),
        entity_id INTEGER,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        image_url TEXT NOT NULL,
        thumbnail_url TEXT,
        style_seed TEXT,
        style_preset TEXT DEFAULT 'anime',
        width INTEGER DEFAULT 1024,
        height INTEGER DEFAULT 1024,
        metadata TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','generating','completed','failed')),
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Workflow: task queue table
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        task_type TEXT NOT NULL CHECK(task_type IN ('analyze','generate_character','generate_background','generate_keyframe','generate_tts','compose','generate_prop','generate_asset_audio','generate_storyboard','review')),
        entity_type TEXT,
        entity_id INTEGER,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','cancelled')),
        progress REAL DEFAULT 0,
        result_data TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_project_id ON chapters(project_id);
      CREATE INDEX IF NOT EXISTS idx_scenes_chapter_id ON scenes(chapter_id);
      CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);
      CREATE INDEX IF NOT EXISTS idx_storyboards_scene_id ON storyboards(scene_id);
      CREATE INDEX IF NOT EXISTS idx_dialogues_storyboard_id ON dialogues(storyboard_id);
      CREATE INDEX IF NOT EXISTS idx_videos_project_id ON videos(project_id);
      CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
      CREATE INDEX IF NOT EXISTS idx_generated_assets_project ON generated_assets(project_id);
      CREATE INDEX IF NOT EXISTS idx_generated_assets_entity ON generated_assets(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_tasks_project ON workflow_tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON workflow_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_templates_builtin ON templates(builtin);
      CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes(project_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_episode ON chapters(episode_id);
    `);

    // Seed builtin templates
    const templateCount = db.prepare('SELECT COUNT(*) as cnt FROM templates WHERE builtin = 1').get() as any;
    if (templateCount.cnt === 0) {
      const templates = [
        {
          name: '短剧模板',
          description: '3章 × 3场景，适合1-3分钟短剧',
          category: 'drama',
          structure: JSON.stringify({
            chapters: [
              { title: '开端', scenes: [
                { title: '场景引入', description: '介绍背景和角色', storyboards: [{ title: '全景', duration: 5, camera_angle: 'wide' }, { title: '角色登场', duration: 4, camera_angle: 'medium' }] },
                { title: '事件触发', description: '引发故事的事件', storyboards: [{ title: '特写', duration: 3, camera_angle: 'close' }, { title: '反应', duration: 4, camera_angle: 'medium' }] },
                { title: '初次冲突', description: '第一次矛盾', storyboards: [{ title: '对峙', duration: 5, camera_angle: 'medium' }] },
              ]},
              { title: '发展', scenes: [
                { title: '矛盾升级', description: '冲突加剧', storyboards: [{ title: '紧张', duration: 4, camera_angle: 'close' }, { title: '全景', duration: 5, camera_angle: 'wide' }] },
                { title: '转折点', description: '故事转折', storyboards: [{ title: '特写', duration: 3, camera_angle: 'extreme_close' }] },
                { title: '高潮前', description: '铺垫高潮', storyboards: [{ title: '推进', duration: 4, camera_angle: 'medium' }, { title: '全景', duration: 5, camera_angle: 'wide' }] },
              ]},
              { title: '结局', scenes: [
                { title: '高潮', description: '故事高潮', storyboards: [{ title: '快切', duration: 3, camera_angle: 'close' }, { title: '全景', duration: 4, camera_angle: 'wide' }] },
                { title: '解决', description: '矛盾解决', storyboards: [{ title: '中景', duration: 5, camera_angle: 'medium' }] },
                { title: '尾声', description: '故事收尾', storyboards: [{ title: '远景', duration: 5, camera_angle: 'wide' }] },
              ]},
            ]
          }),
        },
        {
          name: '电影模板',
          description: '5章 × 4场景，适合5-10分钟影片',
          category: 'film',
          structure: JSON.stringify({
            chapters: [
              { title: '第一幕：建置', scenes: [
                { title: '开场', description: '建立世界', storyboards: [{ title: '航拍', duration: 6, camera_angle: 'wide' }] },
                { title: '主角日常', description: '展示主角生活', storyboards: [{ title: '中景', duration: 5, camera_angle: 'medium' }, { title: '近景', duration: 4, camera_angle: 'close' }] },
                { title: '激励事件', description: '改变一切的事件', storyboards: [{ title: '特写', duration: 3, camera_angle: 'extreme_close' }] },
                { title: '第一转折', description: '进入新世界', storyboards: [{ title: '全景', duration: 5, camera_angle: 'wide' }] },
              ]},
              { title: '第二幕上：对抗', scenes: [
                { title: '新环境', description: '适应新环境', storyboards: [{ title: '中景', duration: 5, camera_angle: 'medium' }] },
                { title: '遇到盟友', description: '结识伙伴', storyboards: [{ title: '双人', duration: 4, camera_angle: 'medium' }] },
                { title: '初次尝试', description: '第一次努力', storyboards: [{ title: '动态', duration: 4, camera_angle: 'close' }] },
                { title: '小胜利', description: '获得信心', storyboards: [{ title: '全景', duration: 5, camera_angle: 'wide' }] },
              ]},
              { title: '第二幕下：低谷', scenes: [
                { title: '挫折', description: '遭遇失败', storyboards: [{ title: '特写', duration: 4, camera_angle: 'close' }] },
                { title: '内省', description: '角色反思', storyboards: [{ title: '静止', duration: 5, camera_angle: 'medium' }] },
                { title: '盟友相助', description: '获得帮助', storyboards: [{ title: '对话', duration: 4, camera_angle: 'medium' }] },
                { title: '重新振作', description: '再次出发', storyboards: [{ title: '推进', duration: 4, camera_angle: 'close' }] },
              ]},
              { title: '第三幕：高潮', scenes: [
                { title: '最终准备', description: '备战', storyboards: [{ title: '蒙太奇', duration: 5, camera_angle: 'medium' }] },
                { title: '最终对决', description: '决战', storyboards: [{ title: '快切', duration: 3, camera_angle: 'close' }, { title: '全景', duration: 5, camera_angle: 'wide' }] },
                { title: '转折', description: '关键时刻', storyboards: [{ title: '特写', duration: 4, camera_angle: 'extreme_close' }] },
                { title: '胜利', description: '获得胜利', storyboards: [{ title: '全景', duration: 6, camera_angle: 'wide' }] },
              ]},
              { title: '尾声', scenes: [
                { title: '新平衡', description: '回归日常', storyboards: [{ title: '中景', duration: 5, camera_angle: 'medium' }] },
                { title: '余韵', description: '留下回味', storyboards: [{ title: '远景', duration: 6, camera_angle: 'wide' }] },
                { title: '彩蛋', description: '暗示续集', storyboards: [{ title: '特写', duration: 3, camera_angle: 'close' }] },
                { title: '片尾', description: '结束', storyboards: [{ title: '淡出', duration: 4, camera_angle: 'wide' }] },
              ]},
            ]
          }),
        },
        {
          name: 'MV模板',
          description: '1章 × 8场景，适合音乐视频',
          category: 'mv',
          structure: JSON.stringify({
            chapters: [
              { title: 'MV', scenes: [
                { title: '前奏', description: '音乐开场', storyboards: [{ title: '空镜', duration: 4, camera_angle: 'wide' }, { title: '特写', duration: 4, camera_angle: 'close' }] },
                { title: '主歌A', description: '第一段', storyboards: [{ title: '中景', duration: 5, camera_angle: 'medium' }, { title: '近景', duration: 5, camera_angle: 'close' }] },
                { title: '主歌B', description: '第二段', storyboards: [{ title: '动态', duration: 5, camera_angle: 'medium' }, { title: '特写', duration: 5, camera_angle: 'extreme_close' }] },
                { title: '副歌', description: '高潮段', storyboards: [{ title: '全景', duration: 4, camera_angle: 'wide' }, { title: '快切', duration: 4, camera_angle: 'close' }] },
                { title: '间奏', description: '音乐过渡', storyboards: [{ title: '空镜', duration: 6, camera_angle: 'wide' }] },
                { title: '主歌C', description: '第三段', storyboards: [{ title: '中景', duration: 5, camera_angle: 'medium' }, { title: '近景', duration: 5, camera_angle: 'close' }] },
                { title: '副歌重复', description: '再次高潮', storyboards: [{ title: '全景', duration: 4, camera_angle: 'wide' }, { title: '特写', duration: 4, camera_angle: 'extreme_close' }] },
                { title: '尾奏', description: '结束', storyboards: [{ title: '远景', duration: 6, camera_angle: 'wide' }, { title: '淡出', duration: 4, camera_angle: 'medium' }] },
              ]},
            ]
          }),
        },
      ];

      const insertStmt = db.prepare('INSERT INTO templates (name, description, category, structure, builtin) VALUES (?, ?, ?, ?, 1)');
      for (const t of templates) {
        insertStmt.run(t.name, t.description, t.category, t.structure);
      }
      logger.info('Builtin templates seeded');
    }

    logger.info('Database tables created successfully');
  } catch (error) {
    logger.error('Database setup failed:', error);
    throw error;
  }
};

// 关闭数据库连接
export const closeDatabase = (): void => {
  if (db) {
    db.close();
    logger.info('Database connection closed');
  }
};