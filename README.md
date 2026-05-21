# AI 短漫剧一站式生产平台

将小说文本转化为动态视频的 AI 创作平台，打通剧本分析、角色定制、分镜绘制、AI 生成、视频合成的完整链路。

## 技术栈

### 前端
- React 19 + TypeScript
- Vite 8 构建工具
- Ant Design 6.x 组件库
- Tailwind CSS 4.x
- React Router 7.x
- Zustand 5.x 状态管理
- Axios HTTP 客户端

### 后端
- Express 5 + TypeScript
- SQLite (better-sqlite3)
- JWT 认证 + helmet 安全头
- Zod 输入校验
- express-rate-limit 限流
- compression gzip
- Winston 日志
- FFmpeg 视频合成
- OpenAI 兼容 API（图片/TTS/视频）

### 测试
- Vitest
- Supertest（后端 API 集成测试）
- @testing-library/react（前端组件测试）

## 项目结构

```
story-video/
├── frontend/
│   ├── src/
│   │   ├── components/    # 通用组件
│   │   ├── pages/         # 页面（Dashboard/Projects/Characters/Scenes/StoryboardEditor/Videos）
│   │   ├── services/      # API 封装（api.ts）
│   │   ├── stores/        # Zustand stores（project/character/storyboard/video/ai/template/version）
│   │   ├── hooks/         # 自定义 hooks
│   │   ├── types/         # TypeScript 类型
│   │   └── __tests__/     # 前端测试
│   └── vite.config.ts
├── backend/
│   ├── src/
│   │   ├── controllers/   # 业务逻辑层（12 个模块）
│   │   ├── models/        # 数据访问层（12 个模块）
│   │   ├── routes/        # 路由层（薄 HTTP 处理）
│   │   ├── middleware/     # 中间件（auth/validate/rateLimit/errorHandler/requestLogger）
│   │   ├── validators/    # Zod 校验 schema
│   │   ├── services/      # 服务（AI/视频渲染）
│   │   ├── database/      # 数据库初始化 + 迁移
│   │   ├── utils/         # 工具（logger）
│   │   └── __tests__/     # 后端测试（28 个用例）
│   └── uploads/           # 上传文件
└── docs/                  # 文档 + todolist
```

## 快速开始

### 环境要求
- Node.js >= 18

### 安装

```bash
# 后端
cd backend && npm install

# 前端
cd frontend && npm install
```

### 配置

`backend/.env`：

```env
PORT=3000
NODE_ENV=development

# JWT（必须 >= 32 字符）
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# 数据库
DB_PATH=./database/app.db

# AI 配置（OpenAI 兼容，可选）
AI_API_KEY=
AI_BASE_URL=
AI_IMAGE_MODEL=dall-e-3
AI_TTS_MODEL=tts-1
AI_TTS_VOICE=alloy

# 各模块可独立配置 URL/KEY/Model
# AI_TEXT_API_KEY / AI_TEXT_BASE_URL / AI_TEXT_MODEL
# AI_IMAGE_API_KEY / AI_IMAGE_BASE_URL / AI_IMAGE_MODEL
# AI_VIDEO_API_KEY / AI_VIDEO_BASE_URL / AI_VIDEO_MODEL
# AI_TTS_API_KEY / AI_TTS_BASE_URL / AI_TTS_MODEL
```

### 启动

```bash
# 后端
cd backend && npm run dev

# 前端（新终端）
cd frontend && npm run dev
```

访问 http://localhost:5173

### 测试

```bash
# 后端测试（28 个用例）
cd backend && npm test

# 前端测试
cd frontend && npm test
```

## 核心功能

| 模块 | 功能 |
|------|------|
| 用户管理 | 注册/登录、个人信息、JWT 认证 |
| 项目管理 | CRUD、状态流转、版本控制、导出 |
| 剧本分析 | AI 分章分节、场景识别、角色对话提取、情感分析 |
| 角色定制 | 角色 CRUD、外观 AI 生成、表情库、动作库、风格定制 |
| 场景管理 | 场景 CRUD、背景 AI 生成、按章节组织 |
| 分镜编辑 | 时间轴、拖拽排序、镜头语言、对话气泡、分镜图 AI 生成 |
| 视频合成 | FFmpeg 渲染、转场效果、BGM、字幕叠加、TTS 语音合成 |
| 资源管理 | 角色/场景/音效/字体/模板库、文件上传 |
| AI 生成 | 角色外观、场景背景、分镜图、表情图、TTS 语音（OpenAI 兼容） |

## 安全特性

- helmet HTTP 安全头
- 登录/注册限流（5 分钟 10 次）
- 全 API 限流（1 分钟 100 次）
- Zod 输入校验
- JWT issuer/audience 绑定
- 路径遍历防护
- 文件类型白名单
- SQL 参数化查询

## 开发进度

详见 [todolist.md](docs/todolist.md)

## 许可证

MIT License
