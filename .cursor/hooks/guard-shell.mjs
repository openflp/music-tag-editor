import { stdin } from 'node:process'

let raw = ''
for await (const chunk of stdin) raw += chunk

let command = ''
try {
  const input = raw ? JSON.parse(raw) : {}
  command = String(input.command ?? '')
} catch {
  process.stdout.write(JSON.stringify({ permission: 'allow' }))
  process.exit(0)
}

const blocked = /\bgit\s+push\b[\s\S]*(\s--force\b|\s-f\b)|\bgit\s+reset\s+--hard\b|\bgit\s+clean\b/i.test(command)

if (blocked) {
  process.stdout.write(
    JSON.stringify({
      permission: 'deny',
      user_message: 'Команда может уничтожить локальную историю или неотслеживаемые файлы.',
      agent_message: 'Запрещены force push, git reset --hard и git clean.'
    })
  )
} else {
  process.stdout.write(JSON.stringify({ permission: 'allow' }))
}
