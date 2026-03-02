/**
 * Single source of truth for all selectors on sora.chatgpt.com.
 * Derived from live DOM inspection — March 2026.
 *
 * Sora is a single-page app. The root page is the explore feed + prompt bar.
 * Sidebar: Home, Explore, Search, Activity, Drafts, Profile, Settings.
 * Bottom prompt bar: textarea, Attach media, +, Storyboard, Settings (sliders), Create video.
 *
 * Video detail page (/d/gen_...): video player + info panel with:
 *   - 3 icon buttons top-right (no aria-labels): remix-like, scissors, "..." menu
 *   - "..." menu: Open in storyboard, Copy link, Download, Create character, Delete
 *   - "Extend" and "Post" buttons
 *   - Pencil icon to edit caption
 *
 * Settings popup (from sliders icon): [role="menuitem"] for Orientation, Duration, Videos
 *   - Orientation submenu: Landscape, Portrait, Square
 *   - Duration submenu: 5s, 10s, 15s, 20s
 *
 * Storyboard mode: Scene cards with textarea "Describe this scene…"
 *   - Bottom bar: +, "Describe your video...", Portrait, 10s, Create
 *   - Undo/Redo buttons top-right
 */
export const SELECTORS = {
  auth: {
    loginButton: [
      'button:has-text("Log in")',
      'a:has-text("Log in")',
    ],
    userMenu: [
      // "Activity" button is a strong logged-in indicator
      'button[aria-label="Activity"]',
      'button:has-text("Activity")',
    ],
  },

  navigation: {
    soraUrl: 'https://sora.com',
    sidebar: {
      home: ['a[aria-label="Home"]', 'a[href="/explore"]'],
      explore: ['a[aria-label="Explore"]', 'a[href="/explore"]'],
      search: ['button[aria-label="Search"]', 'button:has-text("Search")'],
      drafts: ['a[aria-label="Drafts"]', 'a[href="/drafts"]'],
      profile: ['a[aria-label="Profile"]', 'a[href="/profile"]'],
      settings: ['button[aria-label="Settings"]'],
    },
    feedDropdown: [
      'button[aria-label="Choose a feed"]',
      'button:has-text("For you")',
    ],
  },

  prompt: {
    textInput: [
      'textarea[placeholder="Describe your video..."]',
      'textarea[placeholder*="Describe"]',
      'textarea[placeholder*="describe" i]',
      'textarea',
    ],
    generateButton: [
      'button:has-text("Create video")',
      'button[aria-label="Create video"]',
      'button[aria-label="Create"]',
      'button:has-text("Create")',
    ],
  },

  settings: {
    // The sliders icon in prompt bar — opens a popup with [role="menuitem"] items
    trigger: [
      // The Settings button near the prompt bar (not the sidebar one)
      'button[aria-label="Settings"][type="button"]:near(textarea)',
    ],
    // Settings popup uses [role="menuitem"] with submenus
    // Orientation (was "Aspect Ratio") — values: Landscape (16:9), Portrait (9:16), Square (1:1)
    orientation: {
      trigger: [
        '[role="menuitem"]:has-text("Orientation")',
        'div:has-text("Orientation"):has-text("Portrait")',
        'div:has-text("Orientation"):has-text("Landscape")',
      ],
      options: {
        'landscape': ['button:has-text("Landscape")', '[role="menuitem"]:has-text("Landscape")'],
        '16:9': ['button:has-text("Landscape")', '[role="menuitem"]:has-text("Landscape")'],
        'portrait': ['button:has-text("Portrait")', '[role="menuitem"]:has-text("Portrait")'],
        '9:16': ['button:has-text("Portrait")', '[role="menuitem"]:has-text("Portrait")'],
        'square': ['button:has-text("Square")', '[role="menuitem"]:has-text("Square")'],
        '1:1': ['button:has-text("Square")', '[role="menuitem"]:has-text("Square")'],
      },
    },
    duration: {
      trigger: [
        '[role="menuitem"]:has-text("Duration")',
        'div:has-text("Duration"):has-text("10s")',
      ],
      options: {
        '5s': ['button:has-text("5s")', '[role="menuitem"]:has-text("5s")'],
        '10s': ['button:has-text("10s")', '[role="menuitem"]:has-text("10s")'],
        '15s': ['button:has-text("15s")', '[role="menuitem"]:has-text("15s")'],
        '20s': ['button:has-text("20s")', '[role="menuitem"]:has-text("20s")'],
      },
    },
    // In storyboard mode, orientation and duration appear as combobox buttons
    storyboardOrientation: [
      'button[role="combobox"]:has-text("Portrait")',
      'button[role="combobox"]:has-text("Landscape")',
      'button[role="combobox"]:has-text("Square")',
    ],
    storyboardDuration: [
      'button[role="combobox"]:has-text("10s")',
      'button[role="combobox"]:has-text("5s")',
    ],
    stylePreset: {
      trigger: ['button:has-text("Style")'],
      options: (preset: string) => [`button:has-text("${preset}")`],
    },
  },

  generation: {
    progress: [
      '[role="progressbar"]',
      '[aria-label*="progress" i]',
      '[aria-label*="generating" i]',
    ],
    completed: [
      'video[src]',
      'video',
    ],
    failed: [
      '[role="alert"]',
      '[data-testid="generation-error"]',
    ],
  },

  upload: {
    addButton: [
      'button:has-text("Attach media")',
      'button[aria-label="Attach media"]',
    ],
    fileInput: [
      'input[type="file"]',
    ],
  },

  storyboard: {
    toggle: [
      'button:has-text("Storyboard")',
      'button[aria-label="Storyboard"]',
    ],
    // In storyboard mode, scenes are cards with placeholder text
    scenePrompt: [
      'textarea[placeholder*="Describe this scene"]',
      'textarea[placeholder*="describe this scene" i]',
    ],
    // The "+" button at the bottom of storyboard to add scenes
    addScene: [
      'button:has-text("+")',
      'button.contents',  // The "+" is a content-only button
    ],
    // Duration input per scene card
    sceneDuration: [
      'input[aria-label*="seconds"]',
      'input[type="text"]:near(textarea)',
    ],
    // Undo/Redo in storyboard
    undo: ['button[aria-label="Undo"]'],
    redo: ['button[aria-label="Redo"]'],
    // Bottom prompt bar in storyboard mode
    bottomPrompt: [
      'textarea[placeholder="Describe your video..."]',
    ],
    // Create button in storyboard mode (different from normal)
    create: [
      'button[aria-label="Create"]',
      'button:has-text("Create")',
    ],
  },

  // Video detail page (/d/gen_...)
  videoDetail: {
    // The video player itself
    video: ['video[src]', 'video'],
    // "Extend" button — extends the video duration
    extendButton: [
      'button:has-text("Extend")',
    ],
    // "Post" button — publish to community
    postButton: [
      'button:has-text("Post")',
    ],
    // The 3 icon buttons top-right of info panel (no labels, identified by position)
    // These are SVG buttons at positions ~(1125,44), (1165,44), (1205,44)
    // Button 3 (rightmost) = "..." three-dot menu
    moreMenu: [
      'button:has(svg):near(button:has-text("Extend")):nth-of-type(3)',
    ],
    // Caption/prompt edit (pencil icon)
    editCaption: [
      'textarea[placeholder="Add caption..."]',
    ],
    // The prompt text displayed on detail page
    promptText: [
      'textarea[placeholder="Add caption..."]',
    ],
  },

  // "..." menu items on video detail page (appear as [role="menuitem"])
  videoMenu: {
    openInStoryboard: ['[role="menuitem"]:has-text("Open in storyboard")'],
    copyLink: ['[role="menuitem"]:has-text("Copy link")'],
    download: ['[role="menuitem"]:has-text("Download")'],
    createCharacter: ['[role="menuitem"]:has-text("Create character")'],
    delete: ['[role="menuitem"]:has-text("Delete")'],
  },

  library: {
    // Drafts page: videos are a[href^="/d/"] links in a grid
    grid: ['main'],
    items: [
      'a[href^="/d/"]',  // Primary: each draft is a link to /d/gen_...
    ],
    selectButton: [
      'button:has-text("Select")',
      'button[aria-label="Select"]',
    ],
    searchInput: [
      'input[placeholder*="search" i]',
      'input[type="search"]',
    ],
  },

  explore: {
    feed: ['main'],
    // Explore items are a[href^="/p/"] links (public posts)
    items: [
      'a[href^="/p/"]',
      'article',
    ],
  },
} as const;

/**
 * Try multiple selectors, return the first element that matches.
 */
export async function findElement(page: import('playwright').Page, selectors: readonly string[], timeout = 5000) {
  for (const sel of selectors) {
    try {
      const el = await page.waitForSelector(sel, { timeout: Math.min(timeout, 2000) });
      if (el) return el;
    } catch {
      // Try next
    }
  }
  return null;
}

/**
 * Click the first matching selector.
 */
export async function clickElement(page: import('playwright').Page, selectors: readonly string[], timeout = 5000) {
  for (const sel of selectors) {
    try {
      await page.click(sel, { timeout: Math.min(timeout, 2000) });
      return true;
    } catch {
      // Try next
    }
  }
  return false;
}
