import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPromptTools(server: McpServer) {
  server.tool(
    'sora_enhance_prompt',
    'Enhance a basic prompt following Sora best practices: front-load action, 80-150 words, cinematic camera vocabulary, specific details. Pure logic — no browser needed.',
    {
      prompt: z.string().describe('The basic prompt to enhance'),
      style: z.enum(['cinematic', 'documentary', 'music_video', 'commercial', 'abstract']).optional().default('cinematic').describe('Target visual style'),
    },
    async (params) => {
      const enhanced = enhancePrompt(params.prompt, params.style);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            original: params.prompt,
            enhanced,
            word_count: enhanced.split(/\s+/).length,
            tips: [
              'Front-load the main action in the first sentence.',
              'Specify camera movement (dolly, pan, tracking shot, crane).',
              'Include lighting details (golden hour, overcast, neon-lit).',
              'Describe textures and materials explicitly.',
              'End with mood or atmosphere.',
            ],
          }),
        }],
      };
    },
  );

  server.tool(
    'sora_build_prompt',
    'Build a structured cinematic prompt from components: style, scene, camera, actions, and sound/mood. Pure logic — no browser needed.',
    {
      style: z.string().optional().describe('Visual style (e.g., "cinematic", "hand-drawn anime", "film noir")'),
      scene: z.string().describe('Scene description (setting, environment, time of day)'),
      subject: z.string().optional().describe('Main subject/character description'),
      camera: z.string().optional().describe('Camera movement/angle (e.g., "slow dolly forward", "aerial tracking shot")'),
      action: z.string().optional().describe('What happens in the scene'),
      mood: z.string().optional().describe('Mood, atmosphere, or sound design hints'),
      details: z.string().optional().describe('Additional specific details (textures, colors, props)'),
    },
    async (params) => {
      const parts: string[] = [];

      if (params.style) parts.push(`${params.style} shot.`);
      if (params.scene) parts.push(params.scene);
      if (params.subject) parts.push(params.subject);
      if (params.camera) parts.push(`Camera: ${params.camera}.`);
      if (params.action) parts.push(params.action);
      if (params.details) parts.push(params.details);
      if (params.mood) parts.push(`Mood: ${params.mood}.`);

      const prompt = parts.join(' ');
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            prompt,
            word_count: prompt.split(/\s+/).length,
            components: {
              style: params.style || null,
              scene: params.scene,
              subject: params.subject || null,
              camera: params.camera || null,
              action: params.action || null,
              mood: params.mood || null,
              details: params.details || null,
            },
          }),
        }],
      };
    },
  );
}

function enhancePrompt(basic: string, style: string): string {
  const stylePrefix: Record<string, string> = {
    cinematic: 'Cinematic wide shot,',
    documentary: 'Documentary-style footage,',
    music_video: 'Stylized music video shot,',
    commercial: 'High-end commercial look,',
    abstract: 'Abstract visual composition,',
  };

  const cameraVocab = [
    'slow dolly forward', 'smooth tracking shot', 'gentle pan right',
    'crane shot rising', 'handheld close-up', 'aerial sweeping view',
  ];

  const lightingHints = [
    'golden hour light casting long shadows',
    'soft diffused natural light',
    'dramatic chiaroscuro lighting',
    'neon-reflected wet surfaces',
    'overcast moody atmosphere',
  ];

  const prefix = stylePrefix[style] || 'Cinematic shot,';

  // Don't over-enhance if already detailed
  const wordCount = basic.split(/\s+/).length;
  if (wordCount > 80) {
    return `${prefix} ${basic}`;
  }

  // Pick complementary camera and lighting
  const camera = cameraVocab[Math.floor(Math.random() * cameraVocab.length)];
  const lighting = lightingHints[Math.floor(Math.random() * lightingHints.length)];

  return `${prefix} ${basic}. ${camera}, ${lighting}. High detail, photorealistic textures, cinematic color grading.`;
}
