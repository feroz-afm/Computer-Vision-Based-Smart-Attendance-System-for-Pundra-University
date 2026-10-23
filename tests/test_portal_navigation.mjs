import assert from 'node:assert';

async function testNavigation() {
  console.log('--- Verifying PUB AttendEye Portal Navigation ---');
  
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  const portalUrls = [
    { name: 'Student Portal', url: `${BASE_URL}/login?role=student` },
    { name: 'Teacher Portal', url: `${BASE_URL}/login?role=teacher` },
    { name: 'Admin Portal', url: `${BASE_URL}/login?role=admin` },
  ];

  const expectedNavItems = [
    { label: 'Overview', href: '/#overview' },
    { label: 'Portals', href: '/#portals' },
    { label: 'How It Works', href: '/#how-it-works' },
    { label: 'Team', href: '/#team' },
    { label: 'University', href: '/#university' },
  ];

  for (const portal of portalUrls) {
    console.log(`Checking ${portal.name} (${portal.url})...`);
    const res = await fetch(portal.url);
    assert.strictEqual(res.status, 200, `Expected 200 OK for ${portal.url}, got ${res.status}`);
    const html = await res.text();

    for (const item of expectedNavItems) {
      const hrefPattern = `href="${item.href}"`;
      const found = html.includes(hrefPattern);
      assert.ok(found, `Navigation link ${item.label} (${item.href}) not found in ${portal.name}`);
      console.log(`  [PASS] ${item.label} -> ${item.href} present`);
    }
  }

  console.log('\nChecking Homepage Section Target IDs...');
  const homeRes = await fetch(`${BASE_URL}/`);
  assert.strictEqual(homeRes.status, 200, 'Expected 200 OK for homepage');
  const homeHtml = await homeRes.text();

  const expectedIds = ['overview', 'portals', 'how-it-works', 'team', 'university'];
  for (const id of expectedIds) {
    const idPattern = `id="${id}"`;
    const found = homeHtml.includes(idPattern);
    assert.ok(found, `Homepage missing section target with id="${id}"`);
    console.log(`  [PASS] Target section id="${id}" verified on homepage`);
  }

  console.log('\nAll navigation checks passed successfully!');
}

testNavigation().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
