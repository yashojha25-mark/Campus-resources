
export default async function run(page, ui) {
  const result = { steps: [] };
  const FRONT = 'http://127.0.0.1:5500';

  // ---- 1. log in via the real form so localStorage gets a token ----
  await page.goto(`${FRONT}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-form input[name="email"]').fill('qa.student@example.com');
  await page.locator('#login-form input[name="password"]').fill('secret123');
  await page.locator('#login-form button[type="submit"]').click();

  // login redirects to resources.html
  await page.waitForURL(/resources\.html/, { timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#resources-container .resource-card').length > 0,
    { timeout: 15000 }
  );

  const cardCount = await page.locator('#resources-container .resource-card').count();
  const message = (await page.locator('#resource-message').innerText()).trim();
  result.steps.push({ step: 'resources list', cardCount, message });

  // status badge classes should be available/unavailable (never undefined)
  result.statusClasses = await page.$$eval(
    '#resources-container .resource-card__status',
    (els) => els.map((e) => e.className)
  );

  // image src: real remote URL or inline svg placeholder — never a 404 path
  result.imageSrcs = await page.$$eval('#resources-container .resource-card img', (els) =>
    els.map((e) => e.getAttribute('src').slice(0, 40))
  );

  // ---- 2. search filter ----
  await page.locator('#resource-search').fill('computer');
  await page.waitForTimeout(300);
  result.afterSearch = {
    term: 'computer',
    cardCount: await page.locator('#resources-container .resource-card').count(),
    message: (await page.locator('#resource-message').innerText()).trim(),
  };

  // clear it again
  await page.locator('#resource-search').fill('');
  await page.waitForTimeout(300);

  // ---- 3. details page: follow the first card's link ----
  const href = await page.locator('#resources-container .resource-card__button').first().getAttribute('href');
  await page.goto(`${FRONT}/${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const t = document.querySelector('#resource-details-title');
      return t && t.textContent && !/Loading resource/.test(t.textContent);
    },
    { timeout: 15000 }
  );

  result.details = {
    href,
    title: (await page.locator('#resource-details-title').innerText()).trim(),
    location: (await page.locator('#resource-location').innerText()).trim(),
    category: (await page.locator('#resource-category').innerText()).trim(),
    capacity: (await page.locator('#resource-capacity').innerText()).trim(),
    availability: (await page.locator('#resource-availability').innerText()).trim(),
    description: (await page.locator('#resource-description').innerText()).trim().slice(0, 80),
    imageSrcPrefix: await page.locator('#resource-image').getAttribute('src').then((s) => s.slice(0, 40)),
    imageHidden: await page.locator('#resource-image').getAttribute('hidden'),
  };

  // ---- 4. a resource with no image -> inline svg placeholder ----
  // (Seminar Hall A has image:"" in MongoDB)
  await page.goto(`${FRONT}/resources.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelectorAll('#resources-container .resource-card').length > 0,
    { timeout: 15000 }
  );

  const seminarLink = await page
    .locator('#resources-container .resource-card', { hasText: 'Seminar Hall A' })
    .locator('.resource-card__button')
    .getAttribute('href')
    .catch(() => null);

  if (seminarLink) {
    await page.goto(`${FRONT}/${seminarLink}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    result.placeholderCheck = {
      title: (await page.locator('#resource-details-title').innerText()).trim(),
      imageSrcPrefix: (await page.locator('#resource-image').getAttribute('src')).slice(0, 40),
      isPlaceholder: await page
        .locator('#resource-image')
        .getAttribute('src')
        .then((s) => s.startsWith('data:image/svg+xml')),
    };
  } else {
    result.placeholderCheck = { skipped: 'Seminar Hall A card not found' };
  }

  // ---- 5. bad id -> error state, not a crash ----
  await page.goto(`${FRONT}/resource-details.html?id=not-a-real-id`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => /Resource (Not Found|Unavailable)/.test(document.querySelector('#resource-details-title')?.textContent || ''),
    { timeout: 15000 }
  );
  result.badId = {
    title: (await page.locator('#resource-details-title').innerText()).trim(),
    description: (await page.locator('#resource-description').innerText()).trim().slice(0, 60),
  };

  return result;
}
