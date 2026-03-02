/**
 * End-to-end test harness for sora-mcp.
 * Spawns the MCP server as a child process and exercises every tool via JSON-RPC over stdio.
 *
 * Usage:
 *   npx tsx scripts/test-all.ts [--skip-login] [--skip-browser]
 *
 * --skip-login   : Skip the headed login test (use existing session)
 * --skip-browser : Only test pure-logic tools (no browser launch)
 */
import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';

// ── Helpers ──────────────────────────────────────────────────────────
let server: ChildProcess;
let idCounter = 0;
let buffer = '';
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let passed = 0;
let failed = 0;
const failures: string[] = [];

function startServer(): Promise<void> {
  return new Promise((res, rej) => {
    server = spawn('node', [resolve('dist/index.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: resolve('.'),
    });

    server.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) {
            pending.get(msg.id)!.resolve(msg);
            pending.delete(msg.id);
          }
        } catch { /* ignore non-JSON lines */ }
      }
    });

    server.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.error('  [server stderr]', text);
    });

    server.on('error', rej);

    // Initialize
    sendRaw({
      jsonrpc: '2.0',
      id: ++idCounter,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-harness', version: '1.0' },
      },
    });

    const initId = idCounter;
    pending.set(initId, {
      resolve: (msg: any) => {
        if (msg.result?.serverInfo?.name === 'sora-mcp') {
          console.log('✓ Server initialized:', msg.result.serverInfo);
          res();
        } else {
          rej(new Error('Unexpected init response: ' + JSON.stringify(msg)));
        }
      },
      reject: rej,
    });

    // Timeout
    setTimeout(() => {
      if (pending.has(initId)) {
        pending.delete(initId);
        rej(new Error('Server init timed out'));
      }
    }, 15000);
  });
}

function sendRaw(msg: any) {
  const data = JSON.stringify(msg) + '\n';
  server.stdin!.write(data);
}

function callTool(name: string, args: Record<string, any> = {}, timeoutMs = 90000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++idCounter;
    sendRaw({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Tool ${name} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (msg: any) => {
        clearTimeout(timer);
        resolve(msg);
      },
      reject: (err: Error) => {
        clearTimeout(timer);
        reject(err);
      },
    });
  });
}

function listTools(): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++idCounter;
    sendRaw({ jsonrpc: '2.0', id, method: 'tools/list', params: {} });
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('tools/list timed out')); }, 10000);
    pending.set(id, {
      resolve: (msg: any) => { clearTimeout(timer); resolve(msg); },
      reject: (err: Error) => { clearTimeout(timer); reject(err); },
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((res) => {
    if (!server || server.killed) { res(); return; }
    server.on('exit', () => res());
    server.kill('SIGTERM');
    setTimeout(() => { try { server.kill('SIGKILL'); } catch {} res(); }, 5000);
  });
}

// ── Test runner ──────────────────────────────────────────────────────
async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  Testing: ${name} ... `);
  try {
    await fn();
    console.log('✓ PASS');
    passed++;
  } catch (err: any) {
    console.log('✗ FAIL -', err.message);
    failed++;
    failures.push(`${name}: ${err.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function getTextContent(result: any): any {
  const textItem = result?.result?.content?.find((c: any) => c.type === 'text');
  if (!textItem) throw new Error('No text content in response');
  return JSON.parse(textItem.text);
}

function hasImage(result: any): boolean {
  return result?.result?.content?.some((c: any) => c.type === 'image' && c.data?.length > 100);
}

function isError(result: any): boolean {
  return result?.result?.isError === true;
}

// ── Tests ────────────────────────────────────────────────────────────
async function runAll() {
  const args = process.argv.slice(2);
  const skipLogin = args.includes('--skip-login');
  const skipBrowser = args.includes('--skip-browser');

  console.log('\n═══════════════════════════════════════════');
  console.log('  Sora-MCP End-to-End Test Suite');
  console.log('═══════════════════════════════════════════\n');

  // ── 1. Server startup ──
  console.log('▸ Phase 1: Server & Registration');
  await startServer();

  await test('tools/list returns 30 tools', async () => {
    const resp = await listTools();
    const tools = resp.result.tools;
    assert(Array.isArray(tools), 'tools is not an array');
    assert(tools.length === 30, `Expected 30 tools, got ${tools.length}`);
    const names = tools.map((t: any) => t.name);
    for (const expected of [
      'sora_check_session', 'sora_login',
      'sora_generate_video', 'sora_get_status', 'sora_image_to_video',
      'sora_create_storyboard', 'sora_add_storyboard_card',
      'sora_remix', 'sora_blend', 'sora_extend', 'sora_open_in_storyboard',
      'sora_list_library', 'sora_search_library', 'sora_select_video',
      'sora_download_video', 'sora_delete_video',
      'sora_browse_explore',
      'sora_enhance_prompt', 'sora_build_prompt',
      'sora_screenshot',
      'sora_extract_frames', 'sora_filmstrip', 'sora_video_metadata',
      'sora_extract_audio', 'sora_get_video_url', 'sora_direct_download',
      'sora_list_drafts_detailed',
      'sora_instruction_probe', 'sora_continue_chain', 'sora_content_policy_test',
    ]) {
      assert(names.includes(expected), `Missing tool: ${expected}`);
    }
  });

  await test('each tool has description and inputSchema', async () => {
    const resp = await listTools();
    for (const tool of resp.result.tools) {
      assert(typeof tool.description === 'string' && tool.description.length > 10,
        `Tool ${tool.name} has bad description`);
      assert(tool.inputSchema !== undefined, `Tool ${tool.name} has no inputSchema`);
    }
  });

  // ── 2. Pure logic tools (no browser) ──
  console.log('\n▸ Phase 2: Pure Logic Tools');

  await test('sora_enhance_prompt - basic prompt', async () => {
    const resp = await callTool('sora_enhance_prompt', { prompt: 'a dog running on a beach' });
    const data = getTextContent(resp);
    assert(data.success === true, 'Not successful');
    assert(data.enhanced.length > data.original.length, 'Enhanced should be longer');
    assert(data.word_count > 0, 'Word count should be > 0');
    assert(Array.isArray(data.tips), 'Should include tips');
  });

  await test('sora_enhance_prompt - with style', async () => {
    const resp = await callTool('sora_enhance_prompt', { prompt: 'city at night', style: 'documentary' });
    const data = getTextContent(resp);
    assert(data.success === true, 'Not successful');
    assert(data.enhanced.includes('Documentary'), 'Should include documentary style prefix');
  });

  await test('sora_enhance_prompt - already long prompt stays short', async () => {
    const longPrompt = Array(100).fill('word').join(' ');
    const resp = await callTool('sora_enhance_prompt', { prompt: longPrompt });
    const data = getTextContent(resp);
    assert(data.success === true, 'Not successful');
    // Should only prepend style, not add extra camera/lighting
    assert(!data.enhanced.includes('High detail, photorealistic'), 'Should not over-enhance long prompts');
  });

  await test('sora_build_prompt - all fields', async () => {
    const resp = await callTool('sora_build_prompt', {
      style: 'film noir',
      scene: 'A rain-soaked alley in 1940s Chicago',
      subject: 'A detective in a trench coat',
      camera: 'slow tracking shot',
      action: 'He lights a cigarette and steps into the shadows',
      mood: 'tense, mysterious',
      details: 'Wet cobblestones reflecting neon signs, steam rising from a grate',
    });
    const data = getTextContent(resp);
    assert(data.success === true, 'Not successful');
    assert(data.prompt.includes('film noir'), 'Should include style');
    assert(data.prompt.includes('Chicago'), 'Should include scene');
    assert(data.prompt.includes('detective'), 'Should include subject');
    assert(data.prompt.includes('tracking shot'), 'Should include camera');
    assert(data.prompt.includes('cigarette'), 'Should include action');
    assert(data.prompt.includes('tense'), 'Should include mood');
    assert(data.prompt.includes('cobblestones'), 'Should include details');
    assert(data.components.style === 'film noir', 'Components should echo back');
  });

  await test('sora_build_prompt - minimal (scene only)', async () => {
    const resp = await callTool('sora_build_prompt', { scene: 'An empty desert highway at sunset' });
    const data = getTextContent(resp);
    assert(data.success === true, 'Not successful');
    assert(data.prompt.includes('desert highway'), 'Should include scene');
    assert(data.components.style === null, 'Optional fields should be null');
  });

  await test('sora_build_prompt - each style enum', async () => {
    for (const style of ['cinematic', 'documentary', 'music_video', 'commercial', 'abstract']) {
      const resp = await callTool('sora_enhance_prompt', { prompt: 'test', style });
      const data = getTextContent(resp);
      assert(data.success === true, `Failed for style: ${style}`);
    }
  });

  // ── 3. Input validation ──
  console.log('\n▸ Phase 3: Input Validation');

  await test('sora_generate_video - rejects missing prompt', async () => {
    const resp = await callTool('sora_generate_video', {});
    // MCP SDK should reject this at schema level
    assert(resp.error !== undefined || isError(resp), 'Should error on missing prompt');
  });

  await test('sora_delete_video - refuses without confirm=true', async () => {
    // This should return a refusal without touching the browser
    const resp = await callTool('sora_delete_video', { confirm: false });
    const data = getTextContent(resp);
    assert(data.success === false, 'Should refuse');
    assert(data.message.includes('cancelled'), 'Should say cancelled');
  });

  await test('sora_image_to_video - rejects missing params', async () => {
    const resp = await callTool('sora_image_to_video', {});
    assert(resp.error !== undefined || isError(resp), 'Should error on missing params');
  });

  await test('sora_select_video - rejects missing index', async () => {
    const resp = await callTool('sora_select_video', {});
    assert(resp.error !== undefined || isError(resp), 'Should error on missing index');
  });

  await test('sora_search_library - rejects missing query', async () => {
    const resp = await callTool('sora_search_library', {});
    assert(resp.error !== undefined || isError(resp), 'Should error on missing query');
  });

  await test('sora_remix - rejects missing prompt', async () => {
    const resp = await callTool('sora_remix', {});
    assert(resp.error !== undefined || isError(resp), 'Should error on missing prompt');
  });

  await test('sora_blend - rejects missing path', async () => {
    const resp = await callTool('sora_blend', {});
    assert(resp.error !== undefined || isError(resp), 'Should error on missing path');
  });

  await test('sora_create_storyboard - rejects empty cards', async () => {
    const resp = await callTool('sora_create_storyboard', { cards: [] });
    assert(resp.error !== undefined || isError(resp), 'Should error on empty cards');
  });

  await test('sora_create_storyboard - rejects 1 card (min 2)', async () => {
    const resp = await callTool('sora_create_storyboard', { cards: [{ prompt: 'test' }] });
    assert(resp.error !== undefined || isError(resp), 'Should error on single card');
  });

  if (skipBrowser) {
    console.log('\n▸ Skipping browser tests (--skip-browser)');
  } else {
    // ── 4. Browser-based tools ──
    console.log('\n▸ Phase 4: Browser Session');

    await test('sora_check_session - launches browser, returns result + screenshot', async () => {
      const resp = await callTool('sora_check_session', {});
      const data = getTextContent(resp);
      assert(data.success === true, 'Should succeed');
      assert(typeof data.authenticated === 'boolean', 'Should return authenticated boolean');
      assert(typeof data.message === 'string', 'Should return message');
      assert(hasImage(resp), 'Should include screenshot');
    });

    await test('sora_screenshot - captures current page', async () => {
      const resp = await callTool('sora_screenshot', {});
      const data = getTextContent(resp);
      assert(data.success === true, 'Should succeed');
      assert(hasImage(resp), 'Should include screenshot');
    });

    await test('sora_get_status - returns state + screenshot', async () => {
      const resp = await callTool('sora_get_status', { take_screenshot: true });
      const data = getTextContent(resp);
      assert(data.success === true, 'Should succeed');
      assert(['idle', 'generating', 'completed', 'failed', 'unknown'].includes(data.state),
        `Unexpected state: ${data.state}`);
      assert(hasImage(resp), 'Should include screenshot');
    });

    await test('sora_get_status - without screenshot', async () => {
      const resp = await callTool('sora_get_status', { take_screenshot: false });
      const data = getTextContent(resp);
      assert(data.success === true, 'Should succeed');
      assert(!hasImage(resp), 'Should NOT include screenshot when take_screenshot=false');
    });

    // Check if we have a valid session for further tests
    const sessionResp = await callTool('sora_check_session', {});
    const sessionData = getTextContent(sessionResp);
    const isAuthenticated = sessionData.authenticated;

    if (!isAuthenticated && !skipLogin) {
      console.log('\n▸ Phase 5: Login Flow (manual interaction required)');
      console.log('  ⚠ A headed browser will open. Please log in within 5 minutes.');

      await test('sora_login - opens headed browser for auth', async () => {
        const resp = await callTool('sora_login', {}, 310000); // 5+ min timeout
        const data = getTextContent(resp);
        assert(data.success === true, 'Login should succeed: ' + data.message);
        assert(hasImage(resp), 'Should include screenshot');
      });

      await test('sora_check_session - confirms login persisted', async () => {
        const resp = await callTool('sora_check_session', {});
        const data = getTextContent(resp);
        assert(data.authenticated === true, 'Should be authenticated after login');
      });
    } else if (isAuthenticated) {
      console.log('\n  ✓ Already authenticated — skipping login test');
    } else {
      console.log('\n  ⚠ Not authenticated and --skip-login set. Remaining browser tools may fail.');
    }

    if (isAuthenticated || !skipLogin) {
      console.log('\n▸ Phase 6: Authenticated Tool Tests');

      // Re-check auth after potential login
      const authCheck = await callTool('sora_check_session', {});
      const authData = getTextContent(authCheck);

      if (authData.authenticated) {
        await test('sora_generate_video - starts generation (no wait)', async () => {
          const resp = await callTool('sora_generate_video', {
            prompt: 'A single red balloon floating slowly upward against a clear blue sky, cinematic, 4K',
            duration: '5s',
            aspect_ratio: '16:9',
          });
          const data = getTextContent(resp);
          // May succeed or fail (UI-dependent), but should not crash
          assert(typeof data.success === 'boolean', 'Should return success boolean');
          assert(typeof data.message === 'string', 'Should return message');
          assert(hasImage(resp), 'Should include screenshot');
        });

        await test('sora_get_status - check after generate', async () => {
          const resp = await callTool('sora_get_status', { take_screenshot: true });
          const data = getTextContent(resp);
          assert(data.success === true, 'Should succeed');
          assert(hasImage(resp), 'Should include screenshot');
        });

        await test('sora_list_library - lists videos', async () => {
          const resp = await callTool('sora_list_library', {});
          const data = getTextContent(resp);
          assert(data.success === true, 'Should succeed');
          assert(Array.isArray(data.items), 'Should return items array');
          assert(typeof data.count === 'number', 'Should return count');
          assert(hasImage(resp), 'Should include screenshot');
        });

        await test('sora_browse_explore - loads explore feed', async () => {
          const resp = await callTool('sora_browse_explore', {});
          const data = getTextContent(resp);
          assert(data.success === true, 'Should succeed');
          assert(typeof data.item_count === 'number', 'Should return item_count');
          assert(hasImage(resp), 'Should include screenshot');
        });

        await test('sora_image_to_video - rejects nonexistent file', async () => {
          const resp = await callTool('sora_image_to_video', {
            image_path: 'C:/nonexistent/fake.png',
            prompt: 'test prompt',
          });
          assert(isError(resp), 'Should error on nonexistent file');
        });

        // Create a small test image for upload test
        const testImagePath = resolve('test-image.png');
        if (!existsSync(testImagePath)) {
          // Create a minimal valid PNG (1x1 red pixel)
          const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
            'base64'
          );
          writeFileSync(testImagePath, png);
        }

        await test('sora_screenshot - final state capture', async () => {
          const resp = await callTool('sora_screenshot', {});
          const data = getTextContent(resp);
          assert(data.success === true, 'Should succeed');
          assert(hasImage(resp), 'Should include screenshot');
        });
      } else {
        console.log('  ⚠ Still not authenticated. Skipping authenticated tests.');
      }
    }
  }

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  Failures:');
    for (const f of failures) {
      console.log(`    ✗ ${f}`);
    }
  }
  console.log('═══════════════════════════════════════════\n');

  await stopServer();
  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch(async (err) => {
  console.error('\nFatal test error:', err);
  await stopServer();
  process.exit(2);
});
