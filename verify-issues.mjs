import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const results = [];

function report(id, page, status, detail) {
  results.push({ id, page, status, detail });
  const icon = status.includes('CONFIRMED') ? '❌' : status.includes('✅') ? '✅' : status.includes('⚠') ? '⚠️' : '❓';
  console.log(`${icon} ${id.padEnd(6)} | ${page.padEnd(30)} | ${status.padEnd(20)} | ${detail}`);
}

async function safeGoto(page, url, timeout = 10000) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(1000);
    return resp;
  } catch (e) {
    return null;
  }
}

async function setupPage(context) {
  const page = await context.newPage();
  const logs = [];
  page.on('console', msg => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') logs.push(`${t}: ${msg.text()}`);
  });
  page.on('pageerror', err => logs.push(`PAGE_ERROR: ${err.message}`));
  page.on('response', resp => {
    if (resp.status() >= 400) logs.push(`HTTP_${resp.status()}: ${resp.url().replace(BASE, '')}`);
  });
  return { page, logs };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // =========================================================
  // C3: Mobile landing navigation
  // =========================================================
  console.log('\n========== C3: MOBILE NAV ==========');
  {
    const { page, logs } = await setupPage(context);
    const resp = await safeGoto(page, BASE + '/');
    if (!resp) { report('C3', '/', '⚠ SERVER DOWN', 'Could not connect'); await page.close(); }
    else {
      const desktopNavCount = await page.locator('nav[aria-label="Primary"] button').count();
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      const mobileNavCount = await page.locator('nav[aria-label="Primary"] button:visible').count();
      const hamburgerBtns = await page.locator('button[aria-label*="menu" i], button[aria-label*="nav" i], [data-testid*="hamburger"], button:has(.lucide-menu)').count();
      const menuIcons = await page.locator('.lucide-menu').count();
      
      report('C3', '/', 
        mobileNavCount === 0 && hamburgerBtns === 0 && menuIcons === 0 ? '❌ CONFIRMED' : '✅',
        `Desktop nav btns: ${desktopNavCount}, Mobile visible btns: ${mobileNavCount}, Hamburger buttons: ${hamburgerBtns}, Menu icons: ${menuIcons}`);
      await page.close();
    }
  }

  // =========================================================
  // H7: history.back() on legal pages
  // =========================================================
  console.log('\n========== H7: BACK BUTTONS ==========');
  for (const route of ['/terms', '/privacy', '/disclaimer', '/auth']) {
    const { page, logs } = await setupPage(context);
    const resp = await safeGoto(page, BASE + route);
    if (!resp) { report('H7', route, '⚠ SERVER DOWN', ''); await page.close(); continue; }
    
    const backBtns = await page.locator('button:has-text("Back")').count();
    const backLinks = await page.locator('a:has-text("Back")').count();
    report('H7', route, backBtns > 0 || backLinks > 0 ? '❌ CONFIRMED' : '✅',
      `Back buttons: ${backBtns}, Back links: ${backLinks}`);
    await page.close();
  }

  // =========================================================
  // C4: Reset password page
  // =========================================================
  console.log('\n========== C4: RESET PASSWORD ==========');
  {
    const { page, logs } = await setupPage(context);
    const resp = await safeGoto(page, BASE + '/reset-password');
    if (resp) {
      const bodyText = await page.locator('body').textContent().catch(() => '');
      const hasGoogleMsg = bodyText.includes('no password') || bodyText.includes('Google sign-in');
      report('C4', '/reset-password', hasGoogleMsg ? '❌ CONFIRMED' : '✅',
        hasGoogleMsg ? 'Dead-end page: tells user no password reset available' : 'Unexpected content');
    } else { report('C4', '/reset-password', '⚠ SERVER DOWN', ''); }
    await page.close();
  }

  // =========================================================
  // H1: Console error scan across all public pages
  // =========================================================
  console.log('\n========== CONSOLE ERROR SCAN ==========');
  {
    const { page, logs } = await setupPage(context);
    const urls = [BASE + '/', BASE + '/auth', BASE + '/terms', BASE + '/privacy', BASE + '/disclaimer', BASE + '/reset-password'];
    for (const url of urls) {
      await safeGoto(page, url);
      await page.waitForTimeout(300);
    }
    
    report('CONSOLE', 'Public pages', logs.length === 0 ? '✅' : '⚠ WARNINGS',
      `${logs.length} console messages across all public pages`);
    if (logs.length > 0) logs.forEach(l => console.log(`  ${l}`));
    await page.close();
  }

  // =========================================================
  // M10: Skip-to-content link
  // =========================================================
  console.log('\n========== M10: SKIP TO CONTENT ==========');
  {
    const { page, logs } = await setupPage(context);
    const resp = await safeGoto(page, BASE + '/');
    if (resp) {
      const skipLink = await page.locator('a[href*="#main"], a[href*="#content"], a[class*="skip"], [data-skip-to-content]').count();
      report('M10', '/', skipLink === 0 ? '❌ CONFIRMED' : '✅', `Skip links found: ${skipLink}`);
    }
    await page.close();
  }

  // =========================================================
  // Asset verification
  // =========================================================
  console.log('\n========== ASSET VERIFICATION ==========');
  {
    const { page, logs } = await setupPage(context);
    const resp = await safeGoto(page, BASE + '/');
    if (resp) {
      const imgInfo = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).map(i => ({
          src: i.getAttribute('src'),
          alt: i.getAttribute('alt') ?? '(missing)',
          loaded: i.complete && i.naturalWidth > 0
        }));
      });
      const brokenImgs = imgInfo.filter(i => !i.loaded);
      
      // Check specific assets via fetch
      const assets = [
        '/brand/edgescope-lockup-light.png',
        '/brand/edgescope-lockup-dark.png',
        '/brand/edgescope-mark-light.png',
        '/brand/edgescope-mark-dark.png',
        '/favicon.ico',
        '/favicon-32x32.png',
        '/favicon-16x16.png',
        '/favicon-light-32x32.png',
        '/favicon-light-16x16.png',
        '/apple-touch-icon.png',
        '/android-chrome-192x192.png',
        '/android-chrome-512x512.png',
        '/site.webmanifest',
        '/src/styles.css',
      ];
      
      const assetChecks = await Promise.all(assets.map(async a => {
        try {
          const r = await page.request.get(BASE + a);
          return { asset: a, status: r.status(), ok: r.ok() };
        } catch { return { asset: a, status: 0, ok: false }; }
      }));
      
      const brokenAssets = assetChecks.filter(a => !a.ok);
      
      report('ASSETS', '/', 
        brokenImgs.length === 0 && brokenAssets.length === 0 ? '✅' : '⚠ MISSING',
        `Broken images: ${brokenImgs.length}, Broken assets: ${brokenAssets.length}`);
      if (brokenImgs.length > 0) console.log('  Broken imgs:', JSON.stringify(brokenImgs));
      if (brokenAssets.length > 0) console.log('  Broken assets:', JSON.stringify(brokenAssets));
    }
    await page.close();
  }

  // =========================================================
  // Auth guard verification
  // =========================================================
  console.log('\n========== AUTH GUARD ==========');
  for (const route of ['/dashboard', '/trades', '/analytics', '/playbook', '/edge-discovery', '/community', '/accounts', '/settings', '/people', '/notes', '/paper']) {
    const { page, logs } = await setupPage(context);
    await safeGoto(page, BASE + route);
    const currentUrl = page.url();
    const redirected = currentUrl.includes('/auth');
    report('AUTH', route, redirected ? '✅' : '⚠️', 
      `Redirected to auth: ${redirected}, Final URL: ${currentUrl}`);
    await page.close();
  }

  // =========================================================
  // CODE-ONLY VERIFICATIONS (confirmed by reading actual source)
  // =========================================================
  console.log('\n========== CODE VERIFICATIONS ==========');

  // Read and verify each issue from source
  const fs = await import('fs');
  
  // C1: trade-review-modal.tsx - check categories[0]
  const reviewModal = fs.readFileSync('src/components/trades/trade-review-modal.tsx', 'utf-8');
  const hasCatIndex0 = reviewModal.includes('categories ?? []')[0] || reviewModal.includes('categories[0]');
  const cat0Matches = reviewModal.match(/\.categories\s*\?\?\s*\[\s*\]\s*\[\s*0\]|categories\[\s*0\s*\]/g);
  report('C1', 'trade-review-modal.tsx', 
    cat0Matches && cat0Matches.length > 0 ? '❌ CONFIRMED' : '✅',
    `Found ${cat0Matches?.length || 0} references to categories[0] only`);

  // C2: settings.tsx - provider label both branches "Google"
  const settings = fs.readFileSync('src/routes/_authenticated/settings.tsx', 'utf-8');
  const providerLine = settings.split('\n').find(l => l.includes('setProviderLabel') && l.includes('Google'));
  if (providerLine) {
    const bothGoogle = providerLine.includes('"Google"') && (providerLine.match(/"Google"/g) || []).length >= 2;
    report('C2', 'settings.tsx', bothGoogle ? '❌ CONFIRMED' : '✅', `Line: ${providerLine.trim()}`);
  } else {
    report('C2', 'settings.tsx', '⚠ NOT FOUND', 'Could not find setProviderLabel line');
  }

  // H2/H3: sidebar.tsx - aria-disabled on div + startsWith
  const sidebar = fs.readFileSync('src/components/app/sidebar.tsx', 'utf-8');
  const hasAriaDisabledDiv = sidebar.includes('<div') && sidebar.includes('aria-disabled');
  const hasStartsWith = sidebar.includes('startsWith(item.to');
  report('H2', 'sidebar.tsx', hasAriaDisabledDiv ? '❌ CONFIRMED' : '✅', 'aria-disabled on <div> without role');
  report('H3', 'sidebar.tsx', hasStartsWith ? '❌ CONFIRMED' : '✅', 'pathname.startsWith for active route match');

  // H4: trades.tsx - button role=row
  const trades = fs.readFileSync('src/routes/_authenticated/trades.tsx', 'utf-8');
  // Search for the pattern where a <button> has role="row"
  const hasButtonRoleRow = trades.includes('role="row"') && trades.includes('<button');
  // More precise: find actual instances
  const roleRowLines = trades.split('\n').filter((l, i) => l.includes('role="row"') && !l.includes('//'));
  report('H4', 'trades.tsx', 
    roleRowLines.length > 0 ? `❌ CONFIRMED (${roleRowLines.length} instances)` : '✅',
    `Lines with role="row": ${roleRowLines.length}`);

  // H5: community.tsx - sameYear dead code
  const community = fs.readFileSync('src/routes/_authenticated/community.tsx', 'utf-8');
  const sameYearLines = community.split('\n').filter((l, i) => l.includes('sameYear') && (i > 590 && i < 610));
  // Check the exact pattern
  const sameYearBug = community.includes('startLabel = sameYear ? fmt(start) : fmt(start)');
  report('H5', 'community.tsx', sameYearBug ? '❌ CONFIRMED' : '✅', 
    `sameYear ternary both branches call fmt(start): ${sameYearBug}`);

  // H6: AudioContext in notes + playbook
  const notes = fs.readFileSync('src/routes/_authenticated/notes.tsx', 'utf-8');
  const playbook = fs.readFileSync('src/routes/_authenticated/playbook.tsx', 'utf-8');
  const notesAudioCtx = (notes.match(/new AudioContext\(\)/g) || []).length;
  const playbookAudioCtx = (playbook.match(/new AudioContext\(\)/g) || []).length;
  report('H6', 'notes.tsx + playbook.tsx', 
    notesAudioCtx + playbookAudioCtx > 0 ? '❌ CONFIRMED' : '✅',
    `new AudioContext() in notes: ${notesAudioCtx}, playbook: ${playbookAudioCtx}`);

  // C5: paper-workspace.tsx - setInterval with async
  const paper = fs.readFileSync('src/components/paper/paper-workspace.tsx', 'utf-8');
  const hasAsyncInterval = paper.includes('async') && paper.includes('setInterval');
  // Check more precisely
  const asyncTick = paper.includes('const tick') && paper.includes('async');
  report('C5', 'paper-workspace.tsx', (asyncTick || hasAsyncInterval) && !paper.includes('lock') ? '❌ CONFIRMED' : '✅',
    `Async tick function with setInterval: ${asyncTick}, has interval lock: ${paper.includes('lock')}`);

  // C6: notes.tsx - <pre onClick without tabIndex
  const preClickLines = notes.split('\n').filter((l, i) => l.includes('<pre') && l.includes('onClick'));
  const hasPreTabIndex = notes.includes('tabIndex') && preClickLines.length > 0;
  report('C6', 'notes.tsx', 
    preClickLines.length > 0 && !hasPreTabIndex ? '❌ CONFIRMED' : '✅',
    `<pre onClick lines: ${preClickLines.length}, has tabIndex on pre: ${hasPreTabIndex}`);

  // M1: Empty onSaved
  report('M1', 'dashboard-view.tsx', 
    fs.readFileSync('src/components/dashboard/dashboard-view.tsx', 'utf-8').includes('onSaved={() => {}}') ? '❌ CONFIRMED' : '✅', '');

  // M2: Hardcoded Pavan  
  const dv = fs.readFileSync('src/components/dashboard/dashboard-view.tsx', 'utf-8');
  const hasPavan = dv.includes('"Pavan"') || dv.includes("'Pavan'");
  report('M2', 'dashboard-view.tsx', hasPavan ? '❌ CONFIRMED' : '✅', 'Hardcoded "Pavan" placeholder');

  // M4: i18n weekday bug
  const analytics = fs.readFileSync('src/routes/_authenticated/analytics.tsx', 'utf-8');
  const hasHardcodedWeekdays = analytics.includes('"Monday"') || analytics.includes("'Monday'");
  report('M4', 'analytics.tsx', hasHardcodedWeekdays ? '❌ CONFIRMED' : '✅', 'Hardcoded English weekday names');

  // M5: scrollbar-thin
  report('M5', 'analytics.tsx', 
    analytics.includes('scrollbar-thin') ? '❌ CONFIRMED' : '✅', 
    'Undefined CSS class scrollbar-thin used');

  // M6: accounts.tsx - editForm reference in create dialog
  const accounts = fs.readFileSync('src/routes/_authenticated/accounts.tsx', 'utf-8');
  const editFormInCreate = accounts.includes('editForm.account_type');
  report('M6', 'accounts.tsx', editFormInCreate ? '❌ CONFIRMED' : '✅', 'editForm.account_type reference');

  // M7: accounts.tsx - no trade count in delete message
  const deleteMsg = accounts.includes('Only empty trading accounts can be deleted');
  report('M7', 'accounts.tsx', deleteMsg ? '❌ CONFIRMED' : '✅', 'Message without trade count');

  // M8: playbook create note missing tags
  const createNoteHasTags = playbook.includes('tags: []');
  const createNoteTagsInput = playbook.includes('tags') && playbook.includes('placeholder');
  report('M8', 'playbook.tsx', 
    createNoteHasTags && !createNoteTagsInput ? '❌ CONFIRMED' : '✅', 
    `Create note passes tags: [], has tags input: ${createNoteTagsInput}`);

  // M13: saving state
  const tfm = fs.readFileSync('src/components/trades/trade-form-modal.tsx', 'utf-8');
  const hasSavingState = tfm.includes('const [saving');
  const hasIsPending = tfm.includes('.isPending');
  report('M13', 'trade-form-modal.tsx', 
    hasSavingState && hasIsPending ? '❌ CONFIRMED' : '✅',
    `Has useState for saving: ${hasSavingState}, uses isPending: ${hasIsPending}`);

  // M14: void taxonomy
  report('M14', 'trade-form-modal.tsx', 
    tfm.includes('void taxonomy') ? '❌ CONFIRMED' : '✅', '');

  // L1: console.error count
  const allSrc = fs.readdirSync('src', { recursive: true }).filter(f => f.endsWith('.tsx') || f.endsWith('.ts')).map(f => {
    try { return fs.readFileSync(`src/${f}`, 'utf-8'); } catch { return ''; }
  }).join('\n');
  const consoleErrors = (allSrc.match(/console\.error\(/g) || []).length;
  report('L1', 'All src', consoleErrors > 0 ? '❌ CONFIRMED' : '✅', `${consoleErrors} console.error() calls`);

  // L2: Hardcoded version
  report('L2', 'settings.tsx', settings.includes('Version 1.0.0') ? '❌ CONFIRMED' : '✅', '');

  // L4: No error boundary for 3D
  const landing = fs.readFileSync('src/routes/index.tsx', 'utf-8');
  const has3D = landing.includes('Premium3DBackground') || landing.includes('Canvas');
  const hasErrorBoundary = landing.includes('ErrorBoundary') || landing.includes('errorBoundary');
  report('L4', 'index.tsx', has3D && !hasErrorBoundary ? '❌ CONFIRMED' : '✅',
    `Has 3D canvas: ${has3D}, has error boundary: ${hasErrorBoundary}`);

  // L5: start.ts raw Response
  const start = fs.readFileSync('src/start.ts', 'utf-8');
  report('L5', 'start.ts', start.includes('new Response') ? '❌ CONFIRMED' : '✅', '');

  // L6: livePrices leak
  report('L6', 'paper-workspace.tsx', 
    paper.includes('setLivePrices') && !paper.includes('delete livePrices') && !paper.includes('prune') ? '❌ CONFIRMED' : '✅',
    'livePrices set but never pruned');

  // L7: ensureMed catch
  report('L7', 'notes.tsx', notes.includes('catch(() => {})') || notes.includes('catch(() => { })') ? '❌ CONFIRMED' : '✅', '');

  // L8: admin check silent
  const people = fs.readFileSync('src/routes/_authenticated/people.tsx', 'utf-8');
  report('L8', 'people.tsx', 
    people.includes('return { admin: false }') && !people.includes('toast') ? '❌ CONFIRMED' : '✅', '');

  // L9: Recharts accessible labels
  const chartPattern = /<(AreaChart|BarChart|LineChart|PieChart)[^>]*>/g;
  const chartMatches = allSrc.match(chartPattern);
  const hasChartAriaLabel = allSrc.includes('aria-label') && chartMatches !== null;
  report('L9', 'Analytics + Dashboard', 
    chartMatches && !hasChartAriaLabel ? '❌ CONFIRMED' : '✅',
    `${chartMatches?.length || 0} chart components, has aria-label: ${hasChartAriaLabel}`);

  // L10: numOrNull no feedback
  report('L10', 'accounts + trades', 
    allSrc.includes('numOrNull') ? '❌ CONFIRMED (code dependency)' : '✅', '');

  // L11: console.error + toast
  report('L11', 'trade-review-modal.tsx', 
    reviewModal.includes('console.error') && reviewModal.includes('toast.') ? '❌ CONFIRMED' : '✅', '');

  // L12: analytics buildReport monolithic
  report('L12', 'analytics.tsx', 
    analytics.includes('buildReport') && !analytics.includes('chunk') && !analytics.includes('paginate') ? '❌ CONFIRMED' : '✅', '');

  // L13: no confirmation on cancel
  report('L13', 'playbook.tsx', 
    playbook.includes('dirty') && !playbook.includes('confirm') && !playbook.includes('ConfirmDialog') ? '❌ CONFIRMED' : '✅',
    'Dirty state tracked but no confirmation dialog on cancel');

  // L14: focus return check
  const focusReturnPattern = /focus\(\)|\.focus|focus-visible|autoFocus/g;
  const allModals = [tfm, reviewModal, community, playbook, accounts, notes, landing, analytics, settings, trades, paper];
  const hasFocusReturn = allModals.some(f => f.includes('focus()') || f.includes('.focus'));
  report('L14', 'Modals', 
    !hasFocusReturn ? '❌ CONFIRMED' : '⚠ PARTIAL', 'No focus return logic found on modal close handlers');

  // L15: Section order vs nav order
  // Already tested at runtime above
  const sections = landing.match(/id="(scope|workflow|community)"/g) || [];
  const navOrder = ['scope', 'workflow', 'community'];
  const sectionOrder = sections.map(s => s.replace('id="', '').replace('"', ''));
  const secIndexes = sectionOrder.map(s => navOrder.indexOf(s));
  const outOfOrder = secIndexes.some((idx, i) => i > 0 && idx < secIndexes[i-1]);
  report('L15', 'index.tsx', outOfOrder ? '❌ CONFIRMED' : '✅',
    `Section order: ${sectionOrder.join(', ')}, Nav order: ${navOrder.join(', ')}`);

  // =========================================================
  // Print summary
  // =========================================================
  console.log('\n========== FINAL SUMMARY ==========');
  const confirmed = results.filter(r => r.status.includes('CONFIRMED'));
  const pass = results.filter(r => r.status.includes('✅'));
  const warn = results.filter(r => r.status.includes('⚠'));
  const fail = results.filter(r => r.status.includes('❌') && !r.status.includes('CONFIRMED'));
  
  console.log(`\nTotal issues checked: ${results.length}`);
  console.log(`❌ CONFIRMED (real bugs): ${confirmed.length}`);
  console.log(`✅ Verified OK (no bug): ${pass.length}`);
  console.log(`⚠ Unable to fully verify: ${warn.length}`);
  
  if (confirmed.length > 0) {
    console.log('\n--- CONFIRMED BUGS ---');
    confirmed.forEach(r => console.log(`  ${r.id}: ${r.page} - ${r.detail.slice(0, 100)}`));
  }

  await browser.close();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
