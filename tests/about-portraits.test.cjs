const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');
const about = fs.readFileSync(path.join(dist, 'about.html'), 'utf8');
const styles = fs.readFileSync(path.join(dist, 'about.css'), 'utf8');

test('About profiles show the same approved portraits as the homepage in founder order', () => {
  const homepage = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const profiles = [...about.matchAll(/<article class="bio-card"[^>]*>([\s\S]*?)<\/article>/g)];
  assert.equal(profiles.length, 3);

  for (const [index, [name, filename]] of [
    ['Prem', 'prem-portrait.jpg'],
    ['Lincy', 'lincy.jpg'],
    ['Mos', 'mos-portrait.jpg'],
  ].entries()) {
    const profile = profiles[index][1];
    const image = profile.match(/<img\b[^>]*>/)?.[0];
    assert.ok(image, `${name} should have a portrait`);
    assert.ok(image.includes(`src="assets/team/${filename}"`));
    assert.ok(image.includes(`alt="Portrait of ${name}"`));
    assert.ok(image.includes('width="720" height="720"'));
    assert.ok(image.includes('loading="lazy" decoding="async"'));
    assert.ok(profile.includes(`${name.toUpperCase()} ·`));
    assert.ok(fs.existsSync(path.join(dist, 'assets', 'team', filename)));
    assert.ok(homepage.includes(image), `${name}'s portrait should match the homepage`);
  }

  assert.ok(!about.includes('class="bio-mark"'), 'Initials no longer replace the available photos');
});

test('About founder images retain a full square crop and constrained mobile cards', () => {
  assert.match(about, /<link rel="stylesheet" href="about\.css">/);
  assert.match(about, /class="content-section about-team" aria-labelledby="team-title"/);
  assert.match(styles, /\.about-team \.team-portrait\s*\{[^}]*aspect-ratio:\s*1;[^}]*object-fit:\s*contain;/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)\s*\{\s*\.about-team \.bio-grid\s*\{\s*max-width:\s*440px;/);
});
