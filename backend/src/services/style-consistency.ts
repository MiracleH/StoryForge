/**
 * 风格一致性服务
 * 通过统一的 style prefix + character anchor 确保所有生成图片风格一致
 */

const STYLE_PRESETS: Record<string, {
  suffix: string;
  negative: string;
  label: string;
}> = {
  anime: {
    suffix: 'anime illustration style, cel shading, clean line art, vibrant colors, soft ambient lighting, detailed character design, 2D illustration, consistent art style',
    negative: 'western realistic style, 3D render, photorealistic, dark gritty shadows, abstract, oil painting, watercolor',
    label: '日式动漫',
  },
  realistic: {
    suffix: 'photorealistic, cinematic photography, natural lighting, detailed textures, high resolution, professional photography',
    negative: 'cartoon, anime, illustration, painting, abstract, low quality, blurry',
    label: '写实风格',
  },
  chinese_ink: {
    suffix: 'Chinese ink wash painting style, traditional brush strokes, black and white with subtle color accents, flowing ink textures, artistic composition, classical Chinese art',
    negative: 'photorealistic, 3D render, digital art, neon colors, cartoon, anime',
    label: '中国水墨',
  },
  cartoon: {
    suffix: 'cartoon style, bold outlines, flat colors, exaggerated expressions, playful character design, 2D animation style',
    negative: 'photorealistic, 3D render, dark gritty, oil painting, watercolor',
    label: '卡通风格',
  },
  illustration: {
    suffix: 'digital illustration style, painterly textures, rich colors, detailed fantasy art, concept art quality, artistic composition',
    negative: 'photorealistic, 3D render, cartoon, flat vector art, low quality',
    label: '插画风格',
  },
  '3d_render': {
    suffix: '3D rendered style, Pixar Disney aesthetic, smooth rendering, subsurface scattering, vibrant colors, high quality 3D animation look',
    negative: '2D flat, anime, realistic photography, dark gritty, horror',
    label: '3D 渲染',
  },
  oil_painting: {
    suffix: 'oil painting style, thick brushstrokes, rich impasto texture, classical composition, warm lighting, fine art quality',
    negative: 'photorealistic, 3D render, digital art, cartoon, anime, watercolor',
    label: '油画风格',
  },
  watercolor: {
    suffix: 'watercolor painting style, soft washes, delicate brushstrokes, pastel palette, artistic illustration, paper texture visible',
    negative: 'photorealistic, 3D render, digital art, sharp edges, dark shadows',
    label: '水彩风格',
  },
  sketch: {
    suffix: 'pencil sketch style, hand-drawn, graphite texture, crosshatching, artistic line work, monochrome with subtle color accents, illustration art',
    negative: 'photorealistic, 3D render, digital painting, neon colors, cartoon',
    label: '素描风格',
  },
  cyberpunk: {
    suffix: 'cyberpunk aesthetic, neon lights, futuristic city, holographic elements, dark atmosphere with vibrant neon accents, sci-fi illustration',
    negative: 'natural, pastoral, medieval, cartoon, watercolor',
    label: '赛博朋克',
  },
};

const DEFAULT_STYLE = 'anime';

export function getStyleSuffix(preset: string): string {
  return (STYLE_PRESETS[preset] || STYLE_PRESETS[DEFAULT_STYLE]).suffix;
}

export function getStyleNegative(preset: string): string {
  return (STYLE_PRESETS[preset] || STYLE_PRESETS[DEFAULT_STYLE]).negative;
}

export function getAvailablePresets(): string[] {
  return Object.keys(STYLE_PRESETS);
}

export function getPresetOptions(): Array<{ value: string; label: string }> {
  return Object.entries(STYLE_PRESETS).map(([value, preset]) => ({ value, label: preset.label }));
}

/**
 * 构建角色 prompt — 以 visual_prompt 为 anchor，确保所有变体一致
 */
export function buildCharacterPrompt(
  character: {
    name: string;
    description?: string;
    personality?: string;
    appearance?: string;
    clothing?: string;
    visual_prompt?: string;
    image_prompt?: string;
    style?: string;
  },
  styleSeed?: string,
  variant?: string
): string {
  // 优先使用 LLM 生成的 image_prompt（已包含风格前缀）
  if (character.image_prompt) {
    const parts = [character.image_prompt];
    if (variant) parts.push(variant);
    return parts.join(', ');
  }

  const preset = styleSeed || character.style || DEFAULT_STYLE;
  const styleSuffix = getStyleSuffix(preset);
  const negative = getStyleNegative(preset);

  const anchor = character.visual_prompt || [
    character.appearance,
    character.clothing ? `wearing ${character.clothing}` : '',
    character.description,
  ].filter(Boolean).join(', ');

  const parts = [styleSuffix, anchor];
  if (variant) parts.push(variant);
  parts.push('high quality, detailed, full body, character design sheet');
  if (negative) parts.push(`avoid: ${negative}`);

  return parts.join(', ');
}

/**
 * 构建角色设定图 prompt — 结构化参考图表格式
 * 三面图 + 服装细节 + 发型特写 + 发色渐变 + 眼睛特写 + 配色色卡 + 表情集
 */
export function buildCharacterSheetPrompt(
  character: {
    name: string;
    description?: string;
    personality?: string;
    appearance?: string;
    clothing?: string;
    visual_prompt?: string;
    image_prompt?: string;
    style?: string;
  },
  styleSeed?: string
): string {
  const preset = styleSeed || character.style || DEFAULT_STYLE;
  const styleSuffix = getStyleSuffix(preset);
  const negative = getStyleNegative(preset);

  // 只用原始属性拼视觉描述，不用 LLM 生成的字段（可能带风格前缀）
  const visualAnchor = [
    character.appearance,
    character.clothing ? `wearing ${character.clothing}` : '',
    character.description,
    character.personality,
  ].filter(Boolean).join(', ');

  const sections = [
    'character design reference sheet, structured layout, clean composition',
    `featuring ${character.name}: ${visualAnchor}`,
    '',
    'layout sections:',
    '- left column: three vertical full-body views (front, side, back) with height scale 0-160cm',
    '- bottom left: 6-panel clothing detail grid showing individual items with fabric texture',
    '- top right: hair style feature panel with multi-angle close-ups and ribbon/bow details',
    '- middle right: horizontal hair color gradient bar (shadow, base, highlight, strong highlight)',
    '- middle right: eye close-up detail with pupil structure',
    '- middle right: 9-color circular palette swatches for full character color scheme',
    '- bottom right: 3 expression close-ups (gentle smile, angry, smug/proud)',
    '',
    'high quality, detailed reference sheet, animation character design document',
  ].join(', ');

  const parts = [styleSuffix, sections];
  if (negative) parts.push(`avoid: ${negative}`);

  return parts.join(', ');
}

/**
 * 构建场景背景 prompt — 环境设定图格式
 * 全景定场 + 光影氛围 + 空间层次 + 关键元素标注
 */
export function buildSceneSheetPrompt(
  scene: {
    title?: string;
    description?: string;
    location?: string;
    time_of_day?: string;
    mood?: string;
    atmosphere?: string;
    visual_description?: string;
    image_prompt?: string;
  },
  styleSeed?: string
): string {
  const preset = styleSeed || DEFAULT_STYLE;
  const styleSuffix = getStyleSuffix(preset);
  const negative = getStyleNegative(preset);

  // 只用原始属性拼视觉描述，不用 LLM 生成的字段（可能带风格前缀）
  const visualAnchor = [
    scene.location,
    scene.description,
    scene.title,
  ].filter(Boolean).join(', ');

  const timeLighting = scene.time_of_day || '';
  const moodInfo = [scene.mood, scene.atmosphere].filter(Boolean).join(', ');

  const sections = [
    'environment design sheet, establishing shot, cinematic composition',
    `${scene.title || 'scene'}: ${visualAnchor}`,
    timeLighting ? `time and lighting: ${timeLighting}` : '',
    moodInfo ? `atmosphere: ${moodInfo}` : '',
    '',
    'layout sections:',
    '- main panel: wide establishing shot showing full environment with depth layering (foreground, midground, background)',
    '- top insets: lighting reference showing light source direction and shadow pattern',
    '- bottom strip: color script with 5-key-color palette for this scene mood',
    '- corners: architectural detail or environment texture close-ups',
    '- optional: day/night variant thumbnail in corner',
    '',
    'no characters, pure environment art, cinematic lighting, high quality detailed background',
  ].filter(Boolean).join(', ');

  const parts = [styleSuffix, sections];
  if (negative) parts.push(`avoid: ${negative}`);

  return parts.join(', ');
}

/**
 * 构建道具 prompt — 道具设定图格式
 * 多角度视图 + 材质细节 + 比例参考
 */
export function buildPropSheetPrompt(
  prop: {
    name: string;
    description?: string;
    image_prompt?: string;
    visual_prompt?: string;
  },
  styleSeed?: string
): string {
  const preset = styleSeed || DEFAULT_STYLE;
  const styleSuffix = getStyleSuffix(preset);
  const negative = getStyleNegative(preset);

  // 只用原始属性拼视觉描述，不用 LLM 生成的字段（可能带风格前缀）
  const visualAnchor = [
    prop.name,
    prop.description,
  ].filter(Boolean).join(', ');

  const sections = [
    'prop design sheet, item reference, clean presentation layout',
    `${prop.name}: ${visualAnchor}`,
    '',
    'layout sections:',
    '- center: main large view of the prop in 3/4 angle with neutral lighting',
    '- left column: front view and side view orthographic',
    '- top right: close-up detail shot showing material texture and surface finish',
    '- bottom right: scale reference with hand silhouette or common object for size comparison',
    '- color swatches: 3-5 key material colors with finish notes (matte, glossy, metallic, worn)',
    '',
    'isolated on neutral background, product photography lighting, high quality detailed prop reference',
  ].join(', ');

  const parts = [styleSuffix, sections];
  if (negative) parts.push(`avoid: ${negative}`);

  return parts.join(', ');
}

/**
 * 构建场景背景 prompt (旧版，保留兼容)
 */
export function buildBackgroundPrompt(
  scene: {
    title?: string;
    description?: string;
    location?: string;
    time_of_day?: string;
    mood?: string;
    atmosphere?: string;
    visual_description?: string;
    image_prompt?: string;
  },
  styleSeed?: string
): string {
  // 优先使用 LLM 生成的 image_prompt（已包含风格前缀）
  if (scene.image_prompt) {
    return scene.image_prompt;
  }

  const preset = styleSeed || DEFAULT_STYLE;
  const styleSuffix = getStyleSuffix(preset);
  const negative = getStyleNegative(preset);

  const description = scene.visual_description || [
    scene.location,
    scene.description,
    scene.time_of_day ? `${scene.time_of_day} lighting` : '',
    scene.atmosphere,
    scene.mood ? `${scene.mood} mood` : '',
  ].filter(Boolean).join(', ');

  const parts = [
    styleSuffix,
    description,
    'cinematic lighting, high quality, detailed environment, no characters',
  ];
  if (negative) parts.push(`avoid: ${negative}`);

  return parts.join(', ');
}

/**
 * 构建关键帧合成 prompt — 组合角色+背景+镜头信息
 */
export function buildKeyframePrompt(
  storyboard: {
    title?: string;
    description?: string;
    camera_angle?: string;
    camera_movement?: string;
  },
  characters: Array<{
    visual_prompt?: string;
    appearance?: string;
    name?: string;
  }>,
  backgroundDescription: string,
  styleSeed?: string
): string {
  const preset = styleSeed || DEFAULT_STYLE;
  const styleSuffix = getStyleSuffix(preset);
  const negative = getStyleNegative(preset);

  const characterDescriptions = characters.map((c, i) => {
    const anchor = c.visual_prompt || c.appearance || c.name || '';
    return `character ${i + 1}: ${anchor}`;
  }).join(', ');

  const cameraInfo = [
    storyboard.camera_angle ? `${storyboard.camera_angle} shot` : '',
    storyboard.camera_movement || '',
  ].filter(Boolean).join(', ');

  const parts = [
    styleSuffix,
    backgroundDescription,
    characterDescriptions,
    storyboard.description || '',
    cameraInfo,
    'cinematic, high quality, detailed',
  ].filter(Boolean);
  if (negative) parts.push(`avoid: ${negative}`);

  return parts.join(', ');
}
