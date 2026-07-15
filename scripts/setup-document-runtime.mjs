import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, run } from './lib/command.mjs'

const environmentDirectory = resolve(projectRoot, '.venv-documents')
const environmentPython = resolve(
  environmentDirectory,
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
)
const bootstrapPython = process.env.DOCUMENT_BOOTSTRAP_PYTHON ?? 'python3'

if (!existsSync(environmentPython)) {
  console.log('Document runtime: creating isolated Python environment')
  run(bootstrapPython, ['-m', 'venv', environmentDirectory])
}

console.log('Document runtime: installing pinned renderer dependencies')
run(environmentPython, [
  '-m',
  'pip',
  'install',
  '--disable-pip-version-check',
  '--requirement',
  resolve(projectRoot, 'workers/documents/requirements.txt'),
])

run(environmentPython, [
  '-c',
  [
    'import importlib.metadata as metadata',
    'assert metadata.version("reportlab") == "4.4.9"',
    'assert metadata.version("pypdf") == "6.10.0"',
    'assert metadata.version("pillow") == "12.3.0"',
    'assert metadata.version("charset-normalizer") == "3.4.9"',
  ].join('; '),
])

console.log('Document runtime: PASS (isolated pinned renderer dependency set)')
