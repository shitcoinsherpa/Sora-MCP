export type AspectRatio = '16:9' | '9:16' | '1:1' | 'landscape' | 'portrait' | 'square';
export type Duration = '5s' | '10s' | '15s' | '20s';
export type StylePreset = 'none' | 'cinematic' | 'anime' | 'claymation' | 'comic_book' | 'digital_art' | 'film_noir' | 'hand_drawn' | 'impressionist' | 'ink_wash' | 'oil_painting' | 'origami' | 'paper_craft' | 'pixel_art' | 'pop_art' | 'stop_motion' | 'watercolor';

export interface VideoSettings {
  prompt: string;
  aspect_ratio?: AspectRatio;
  duration?: Duration;
  variations?: number;
  style_preset?: StylePreset;
}

export interface StoryboardCard {
  prompt: string;
  image_path?: string;
  duration?: Duration;
}

export interface GenerationStatus {
  state: 'idle' | 'generating' | 'completed' | 'failed' | 'unknown';
  progress?: string;
  screenshot_base64?: string;
}

export interface LibraryItem {
  index: number;
  title?: string;
  href?: string;
}

export interface ToolResult {
  success: boolean;
  message: string;
  screenshot_base64?: string;
  data?: Record<string, unknown>;
}
