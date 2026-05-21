/**
 * 风格一致性服务
 * 通过统一的 style prefix + character anchor 确保所有生成图片风格一致
 */

const STYLE_PRESETS: Record<string, {
  suffix: string;
  negative: string;
}> = {
  anime: {
    suffix: 'anime illustration style, cel shading, clean line art, vibrant colors, soft ambient lighting, detailed character design, 2D illustration, consistent art style',
    negative: 'western realistic style, 3D render, photorealistic, dark gritty shadows, abstract, oil painting, watercolor',
  },
  manga: {
    suffix: 'manga style, black and white ink, high contrast, dynamic panel layout, expressive character design, Japanese comic art',
    negative: 'color illustration, photorealistic, 3D render, watercolor, oil painting',
  },
  realistic: {
    suffix: 'photorealistic, cinematic photography, natural lighting, detailed textures, high resolution, professional photography',
    negative: 'cartoon, anime, illustration, painting, abstract, low quality, blurry',
  },
  watercolor: {
    suffix: 'watercolor painting style, soft washes, delicate brushstrokes, pastel palette, artistic illustration, paper texture visible',
    negative: 'photorealistic, 3D render, digital art, sharp edges, dark shadows',
  },
  pixar: {
    suffix: '3D animated style, Pixar Disney aesthetic, smooth rendering, vibrant colors, subsurface scattering, friendly character design, high quality 3D render',
    negative: '2D flat, anime, realistic photography, dark gritty, horror',
  },
  cyberpunk: {
    suffix: 'cyberpunk aesthetic, neon lights, futuristic city, holographic elements, dark atmosphere with vibrant neon accents, sci-fi illustration',
    negative: 'natural, pastoral, medieval, cartoon, watercolor',
  },
  fantasy: {
    suffix: 'fantasy art style, magical atmosphere, ethereal lighting, detailed environments, epic scale, digital painting, concept art quality',
    negative: 'modern urban, realistic photo, cartoon, minimalist',
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
    style?: string;
  },
  styleSeed?: string,
  variant?: string
): string {
  const preset = character.style || styleSeed || DEFAULT_STYLE;
  const styleSuffix = getStyleSuffix(preset);
  const negative = getStyleNegative(preset);

  // 优先使用 LLM 生成的 visual_prompt 作为 anchor
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
 * 构建场景背景 prompt
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
  },
  styleSeed?: string
): string {
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
