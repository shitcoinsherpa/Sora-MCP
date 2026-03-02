import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from './browser/manager.js';
import { registerSessionTools } from './tools/session-tools.js';
import { registerGenerateTools } from './tools/generate-tools.js';
import { registerImageToVideoTools } from './tools/image-to-video-tools.js';
import { registerStoryboardTools } from './tools/storyboard-tools.js';
import { registerEditTools } from './tools/edit-tools.js';
import { registerLibraryTools } from './tools/library-tools.js';
import { registerExploreTools } from './tools/explore-tools.js';
import { registerPromptTools } from './tools/prompt-tools.js';
import { registerScreenshotTools } from './tools/screenshot-tools.js';
import { registerAnalysisTools } from './tools/analysis-tools.js';
import { registerProbeTools } from './tools/probe-tools.js';

export function createServer(): { server: McpServer; browser: BrowserManager } {
  const server = new McpServer({
    name: 'sora-mcp',
    version: '1.0.0',
  });

  const browser = new BrowserManager();

  // Register all tool groups
  registerSessionTools(server, browser);
  registerGenerateTools(server, browser);
  registerImageToVideoTools(server, browser);
  registerStoryboardTools(server, browser);
  registerEditTools(server, browser);
  registerLibraryTools(server, browser);
  registerExploreTools(server, browser);
  registerPromptTools(server);
  registerScreenshotTools(server, browser);
  registerAnalysisTools(server, browser);
  registerProbeTools(server, browser);

  return { server, browser };
}
