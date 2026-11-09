---
name: music-tag-editor
description: >-
  Продолжает Music Tag Editor (Electron, React, FSD): теги, обложки, IPC и окно.
  Используй, когда пользователь просит правки редактора метаданных, drag-and-drop,
  «Всем», сохранение тегов или сборку electron-builder.
---

# Music Tag Editor

## Инструкции

1. Прочитай `AGENTS.md` и `docs/architecture.md`, если правка затрагивает запись или IPC.
2. Меняй черновики в Zustand (`src/renderer/src/features/editor/model/store.ts`). Сравнение с оригиналом оставляй в `shared/plan.ts`.
3. Новый тег добавь в `TrackTags`, `APPLY_FIELDS` или `SOLO_FIELDS`, форму и `applyPatch` в `electron/services/tag-io.ts`.
4. Обложку ограничь 8 МБ и типами PNG, JPEG, WebP, GIF.
5. После правки логики запусти `npm run typecheck` и `npm test`. После правки окна запусти `npm run dev`.

## Примеры

- Поле «Композитор» для всех треков: это apply-поле, у него есть сегмент «Всем» и оно не пишется, если значение не менялось.
- Ошибка «файл занят» остаётся в списке `writeErrors` и предлагает `saveCopy`, остальные файлы сохраняются.
