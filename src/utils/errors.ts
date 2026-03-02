export class SoraError extends Error {
  constructor(message: string, public readonly screenshot_base64?: string) {
    super(message);
    this.name = 'SoraError';
  }
}

export class SessionExpiredError extends SoraError {
  constructor(screenshot_base64?: string) {
    super('Session expired. Please run sora_login to re-authenticate.', screenshot_base64);
    this.name = 'SessionExpiredError';
  }
}

export class SelectorNotFoundError extends SoraError {
  constructor(selector: string, screenshot_base64?: string) {
    super(`Selector not found: ${selector}. The UI may have changed.`, screenshot_base64);
    this.name = 'SelectorNotFoundError';
  }
}

export class GenerationTimeoutError extends SoraError {
  constructor(screenshot_base64?: string) {
    super('Generation timed out. Use sora_get_status to check progress.', screenshot_base64);
    this.name = 'GenerationTimeoutError';
  }
}

export class BrowserCrashedError extends SoraError {
  constructor() {
    super('Browser crashed. It will auto-recover on the next tool call.');
    this.name = 'BrowserCrashedError';
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelay = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}
