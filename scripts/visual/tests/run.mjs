const requested = process.argv.slice(2);
let passed = 0;
for (const group of ['catalog', 'server', 'preferences', 'documents', 'analysis', 'cli', 'state']) {
  if (requested.length && !requested.includes(group)) continue;
  try {
    const { tests } = await import(`./${group}.test.mjs`);
    for (const [name, test] of tests) {
      try { await test(); passed++; console.log(`PASS ${name}`); }
      catch (error) { console.error(`FAIL ${name}\n`, error); process.exitCode = 1; }
    }
  } catch (error) { console.error(`FAIL ${group}\n`, error); process.exitCode = 1; }
}
console.log(`${passed} passed${process.exitCode ? ', failures above' : ', 0 failures'}`);
