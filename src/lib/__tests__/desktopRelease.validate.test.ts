import { describe, it, expect } from 'vitest'
import { isAllowedReleaseFilename, validateLatestYml } from '@/lib/desktopRelease/validate'

describe('isAllowedReleaseFilename', () => {
  it('accepts electron-builder outputs', () => {
    expect(isAllowedReleaseFilename('latest.yml')).toBe(true)
    expect(isAllowedReleaseFilename('Renovo Pro Setup 0.2.0.exe')).toBe(true)
    expect(isAllowedReleaseFilename('Renovo Pro Setup 0.2.0.exe.blockmap')).toBe(true)
    expect(isAllowedReleaseFilename('Renovo-Pro-Setup-1.10.3.exe')).toBe(true)
  })
  it('rejects anything else', () => {
    for (const bad of ['../latest.yml', 'a/b.exe', 'a\\b.exe', 'evil.js', 'evil.exe.sh', 'x.yml', 'latest.yaml', '', '.exe', 'notes.txt', 'a..b.exe']) {
      expect(isAllowedReleaseFilename(bad)).toBe(false)
    }
  })
})

const GOOD = `version: 0.2.0
files:
  - url: Renovo-Pro-Setup-0.2.0.exe
    sha512: abc123==
    size: 123456
path: Renovo-Pro-Setup-0.2.0.exe
sha512: abc123==
releaseDate: '2026-11-13T10:00:00.000Z'
`

describe('validateLatestYml', () => {
  it('accepts a normal latest.yml', () => {
    expect(validateLatestYml(GOOD)).toEqual({ ok: true })
  })
  it('accepts names with spaces / encoded spaces', () => {
    expect(validateLatestYml('files:\n  - url: Renovo Pro Setup 0.2.0.exe\npath: Renovo%20Pro%20Setup%200.2.0.exe\n').ok).toBe(true)
  })
  it('rejects an absolute URL (would redirect every till to an attacker-hosted file)', () => {
    expect(validateLatestYml(GOOD.replace('url: Renovo-Pro-Setup-0.2.0.exe', 'url: https://evil.example/x.exe')).ok).toBe(false)
    expect(validateLatestYml(GOOD.replace('path: Renovo-Pro-Setup-0.2.0.exe', 'path: //evil.example/x.exe')).ok).toBe(false)
  })
  it('rejects paths, traversal, wrong extensions and quoted absolute URLs', () => {
    expect(validateLatestYml('path: ../x.exe\n').ok).toBe(false)
    expect(validateLatestYml('path: sub/x.exe\n').ok).toBe(false)
    expect(validateLatestYml('path: x.msi\n').ok).toBe(false)
    expect(validateLatestYml('path: "http://evil.example/x.exe"\n').ok).toBe(false)
  })
  it('rejects a file that references nothing, or is oversized', () => {
    expect(validateLatestYml('version: 1.0.0\n').ok).toBe(false)
    expect(validateLatestYml('path: a.exe\n' + 'x'.repeat(70 * 1024)).ok).toBe(false)
  })
})
