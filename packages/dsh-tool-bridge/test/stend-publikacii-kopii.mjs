// RU: B-N-2061: реальные файлы и настоящий CLI стенда, без запуска платформы.
// EN: Real filesystem fixtures exercise the publication stand CLI, not a copy of its predicate.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const stand = fileURLToPath(new URL('./stend-publikacii.mjs', import.meta.url))
const basicFiles = ['src/index.js', 'README.md', 'SAMOPROBUZHDENIE.md']
function fixture(t, copy, files = basicFiles, prepare = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'bridge-publication-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (name, text) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    writeFileSync(path.join(root, name), text)
  }
  put('package.json', JSON.stringify({ name: 'publication-probe', version: '1.0.0', files }))
  put('src/index.js', "const SERVER_NAME_DEFAULT = 'probe-server'\n")
  put('README.md', '## Переход с частной сборки\nУмолчание `probe-server`, приставка mcp__, настройка serverName.\n')
  put('SAMOPROBUZHDENIE.md', 'умолчание и границы механизма.\n'.repeat(160))
  put('test/kept/plain.js', 'export const plain = true\n')
  const names = path.join(root, 'private-names.txt')
  writeFileSync(names, 'PRIVATE_SENTINEL_NEVER_USED_2061\n')
  if (copy) put(copy, 'edit backup\n')
  prepare(root)
  const result = spawnSync(process.execPath, [stand], {
    env: { ...process.env, MOST_KORNI: root, SPISOK_IMYON: names },
    encoding: 'utf8', timeout: 20000,
  })
  assert.ifError(result.error)
  assert.equal(result.signal, null)
  assert.equal(result.stderr, '', result.stderr)
  return result
}

for (const copy of ['src/index.js.bak-pre-edit', 'test/change.orig', 'src/nested/change.tmp', 'test/nested/change.limits']) {
  test(`unpublished edit copy is judged green: ${copy}`, (t) => {
    const result = fixture(t, copy)
    assert.equal(result.status, 0, result.stdout)
    assert.doesNotMatch(result.stdout, /НЕ ПРИМЕНИМО состав против диска/)
  })
}

test('an edit copy explicitly named in files is rejected with its path', (t) => {
  const copy = 'src/index.js.bak-pre-edit'
  const result = fixture(t, copy, [...basicFiles, copy])
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /FAIL/)
  assert.ok(result.stdout.includes(copy), result.stdout)
})

test('a directory in files also covers its nested edit copy', (t) => {
  const copy = 'src/nested/change.orig'
  const result = fixture(t, copy, ['src', 'README.md', 'SAMOPROBUZHDENIE.md'])
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /FAIL/)
  assert.ok(result.stdout.includes(copy), result.stdout)
})

test('a sibling directory does not cover the copy by a common string prefix', (t) => {
  const result = fixture(t, 'test/kept-other/change.tmp', [...basicFiles, 'test/kept'])
  assert.equal(result.status, 0, result.stdout)
  assert.doesNotMatch(result.stdout, /НЕ ПРИМЕНИМО состав против диска/)
})

test('an assembled copy without edit copies is not applicable', (t) => {
  const result = fixture(t)
  assert.equal(result.status, 0, result.stdout)
  assert.match(result.stdout, /НЕ ПРИМЕНИМО состав против диска/)
})

for (const kind of ['parent directory', 'file symlink']) {
  test(`directory expansion refuses an outside ${kind} before reading its content`, (t) => {
    const outside = mkdtempSync(path.join(tmpdir(), 'publication-outside-'))
    t.after(() => rmSync(outside, { recursive: true, force: true }))
    writeFileSync(path.join(outside, 'foreign.txt'), 'PRIVATE_SENTINEL_NEVER_USED_2061\n')
    const result = fixture(t, null, basicFiles, (root) => {
      const extra = kind === 'parent directory' ? path.relative(root, outside) : 'test'
      if (kind === 'file symlink') {
        symlinkSync(path.join(outside, 'foreign.txt'), path.join(root, 'test/external.txt'))
      }
      writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        name: 'publication-probe', version: '1.0.0', files: [...basicFiles, extra],
      }))
    })
    assert.equal(result.status, 2, result.stdout)
    assert.match(result.stdout, /СЛЕПОТА/)
    assert.doesNotMatch(result.stdout, /PRIVATE_SENTINEL_NEVER_USED_2061/)
  })
}
