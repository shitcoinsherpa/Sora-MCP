import { resolve } from 'path';

export interface BrowserConfig {
  headless: boolean;
  profileDir: string;
  navTimeout: number;
  actionTimeout: number;
  genTimeout: number;
  downloadDir: string;
}

export function loadConfig(): BrowserConfig {
  return {
    headless: process.env.SORA_HEADLESS !== 'false',
    profileDir: process.env.SORA_BROWSER_PROFILE_DIR || resolve(process.cwd(), '.browser-profile'),
    navTimeout: parseInt(process.env.SORA_NAV_TIMEOUT || '60000', 10),
    actionTimeout: parseInt(process.env.SORA_ACTION_TIMEOUT || '10000', 10),
    genTimeout: parseInt(process.env.SORA_GEN_TIMEOUT || '300000', 10),
    downloadDir: process.env.SORA_DOWNLOAD_DIR || resolve(process.cwd(), 'downloads'),
  };
}
