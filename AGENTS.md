# Агент

Проект — Music Tag Editor. Интерфейс уже собран. Дальше правь поведение, не переписывай каркас.

## Границы

- Файлы и теги живут только в `electron/`. Renderer вызывает `window.musicTagEditor`.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Не ослабляй это ради удобства.
- В запись попадают только изменённые поля. Логика в `shared/plan.ts`, проверка — `tests/plan.test.ts`.
- Обложка не больше 8 МБ. Пути и задания проходят через `electron/services/validate.ts`.
- Стили — CSS-переменные в `src/renderer/src/app/styles.css`. Не добавляй inline-стили: в проде CSP без `unsafe-inline`.

## Проверка

После правок main, preload, стора или плана:

```bash
npm run typecheck
npm test
```

После правок окна:

```bash
npm run dev
```

Проверь пустой экран, drop нескольких файлов, «Всем», разные значения при мультивыборе и «Сохранить все».
