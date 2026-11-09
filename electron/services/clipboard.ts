import { execFile } from 'node:child_process'
import { clipboard } from 'electron'

let chain: Promise<void> = Promise.resolve()

function powershell(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-NonInteractive', '-Command', script],
      { windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) reject(new Error(String(stderr || error.message).trim() || 'Не удалось скопировать файл'))
        else resolve()
      }
    )
  })
}

function enqueue(job: () => Promise<void>): Promise<void> {
  const next = chain.then(job, job)
  chain = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

export function copyPlainText(text: string): Promise<void> {
  return enqueue(() => clipboard.writeText(text))
}

export function copyFileList(files: string[]): Promise<void> {
  return enqueue(async () => {
    if (!files.length) throw new Error('Не удалось скопировать файл')
    if (process.platform !== 'win32') {
      await clipboard.writeText(files.join('\n'))
      return
    }
    const payload = Buffer.from(JSON.stringify(files), 'utf8').toString('base64')
    await powershell(`
$paths = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
$list = New-Object System.Collections.Specialized.StringCollection
foreach ($path in @($paths)) { [void]$list.Add([string]$path) }
[System.Windows.Forms.Clipboard]::SetFileDropList($list)
`)
  })
}
