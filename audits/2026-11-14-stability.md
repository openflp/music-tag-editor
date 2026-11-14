# Аудит стабильности — 2026-11-14

Статус: **в процессе**. Записи добавляются сразу по мере находок. Если разбор оборвётся, продолжать с раздела «Ещё не просмотрено».

Область: поведение после недавних правок. Каркас не переписывается. Исправления в этом проходе не делаются — только факты, место и почему это ломает окно.

Стек из сообщения пользователя (сжато):

```
Maximum update depth exceeded
  dispatchReducerAction
  commitHookEffectListMount
  Presence
  MenuPortal → ContextMenuPortal → ContextMenuContent
  TrackMenu → TrackSidebar → App → CrashBoundary
```

---

## Подтверждённые дефекты

### A1. Закрытое контекстное меню трека зацикливает Radix Presence

Серьёзность: **падение окна**. Это стек из сообщения.

Где:

- `src/renderer/src/widgets/track-sidebar/TrackSidebar.tsx`, `TrackMenu` (примерно строки 205–238): у каждой видимой строки свой `ContextMenu` и сразу `ContextMenuContent`.
- `src/renderer/src/components/ui/context-menu.tsx`, строки 16–23: `Content` всегда рендерит `Portal` + `Content`, даже когда меню закрыто.
- Установленный бандл `node_modules/.vite/deps/chunk-SMQAGKRA.js`, `usePresence`, строки 1370–1406. `node_modules/.vite/deps/radix-ui.js`, `MenuPortal` около строки 4612 и `MenuContent` около строки 4622: у одного меню два `Presence`.

Что происходит:

1. Меню закрыто, `present === false`, узел портала не монтируется, `node` остаётся `undefined`.
2. На mount layout-эффект всё равно вызывает `send("ANIMATION_END")` (ветка `else` на строке 1405).
3. React считает `dispatch` из `useLayoutEffect` вложенным обновлением. Лимит — 50 (`Maximum update depth exceeded`, тот же текст, что в стеке: `getRootForUpdatedFiber` → `enqueueConcurrentHookUpdate` → `dispatchReducerAction`).
4. Стартовое окно виртуального списка — `{ start: 0, end: 32 }` (`TrackSidebar.tsx`, строка 273). 32 строки × 2 `Presence` = 64 вложенных `dispatch` на первом коммите. Порог переходится примерно с 25 видимых строк.

Почему это всплыло после правок списка: контекстное меню теперь на каждой строке, а не одно на список. Пустой список не падает. Падает первый показ достаточно длинного списка и любое повторное монтирование этих строк (сортировка, фильтр окна, анимация входа).

Что проверить при починке: открыть 30+ файлов при видимом сайдбаре. Правый клик не обязателен — падение на mount закрытых меню.

Почему это именно цикл, а не «много меню за один кадр»: исключение бросает `getRootForUpdatedFiber`, когда `nestedUpdateCount` уже больше лимита. Счётчик растёт между коммитами, а стек — `commitHookEffectListMount`, то есть эффект монтируется заново, а не перезапускается. `send("ANIMATION_END")` при `node == null` на ещё не смонтированном fiber в React 19 планирует новый проход, тот снова монтирует эффект. В бандле ветка `else { send("ANIMATION_END") }` на месте; в более новых `@radix-ui/react-presence` её убрали. Пакет проекта — `radix-ui@^1.8.1`, React `^19.0.0`. Корень `src/renderer/src/main.tsx` обёрнут в `StrictMode`, он монтирует эффекты дважды и этот баг проявляет чаще.

Направление починки (не сделано): одно `ContextMenu` на список, либо не монтировать `Content`, пока меню закрыто, либо поднять `radix-ui`, где `Presence` не шлёт `ANIMATION_END` без узла. Править вендорный бандл не нужно.

### A2. `setMotion` вызывается прямо из тела рендера сайдбара

Серьёзность: **высокая**. Само по себе может не давать стек A1, но перезапускает рендер списка и заново монтирует все `Presence` из A1.

Где: `src/renderer/src/widgets/track-sidebar/TrackSidebar.tsx`, строки 485–536.

```ts
const nextPaths = visible.map((track) => track.path)
if (!motion.ready) {
  setMotion({ ... })
} else if (!samePaths(motion.paths, nextPaths)) {
  setMotion({ ... })
}
```

Это не эффект. На каждом изменении порядка путей React выбрасывает текущий рендер и начинает его заново. Внутри веток читаются `window.matchMedia`, `listRef.current` и `knownTracks` — то есть рендер зависит от DOM и от предыдущего кадра. Пока `motion.ready === false`, первый показ списка всегда делает лишний проход и только потом коммитит строки. Вместе с A1 этот проход как раз и есть момент падения.

Дополнительно: ветка `sameFiles` делает `setMotion({ ...motion, paths: nextPaths })` и тащит старый `entered`. После сортировки тех же файлов анимация «входа» может включиться повторно или не сброситься.

### A3. Подсказки тулбара рвут `asChild` у меню

Серьёзность: **средняя** (фокус, клик, второй контур Presence у dropdown). Стек пользователя — context menu, не dropdown, но тот же механизм.

Где:

- `TrackSidebar.tsx`, `ToolMenu`, строки 166–178: `Hint` оборачивает `DropdownMenuTrigger`.
- `src/renderer/src/components/ui/tooltip.tsx`, `Hint`, строки 93–99: без `pass` триггер тултипа — это `span.hint-host`, а меню оказывается внутри span.

Итог: якорь Popper — span, а не кнопка. У тултипа и у dropdown свой `Presence`. Открытие «+», сортировки или «ещё» может повторно гонять layout-эффект Presence (тот же `send` из A1), только порог 50 здесь один, поэтому само по себе реже роняет окно. Клик и клавиатура по кнопке внутри span ведут себя нестабильно.

---

## Проверено, циклом не является

- `setListOrder` (`store.ts`, около 740): не пишет стор, если порядок тот же. Эффект в сайдбаре (`orderKey`) сам по себе не зацикливается.
- `FadeText`: `data-fade` меняет только mask, не ширину. `setFade` с тем же boolean React гасит. Бесконечного ResizeObserver тут нет.
- `CommandPalette` (`Chrome.tsx`, 105–108): `setState` в рендере срабатывает один раз при смене `listKey` и останавливается.
- `Toast`: показ карточки в `useLayoutEffect`, не в теле рендера.
- `SettingsDialog`: смена секции в эффекте, зависимость `[section, sections]`, повторного `setSection` нет.

---

## Ещё не просмотрено

- Стор целиком (`store.ts` после строки 200): undo, save, apply-all, refresh, гонки загрузки.
- `shared/plan.ts`, `shared/filename.ts`, запись в `electron/services/tag-io.ts` и `validate.ts`.
- Плеер (`Player.tsx`): смена трека, `nowPlaying`, затухание, `audioSlot`.
- Форма, info-pane (второе контекстное меню), save-bar, titlebar, горячие клавиши.
- `npm run typecheck` и `npm test` в этом проходе ещё не запускались.
- Окно в браузере/Electron этим проходом ещё не открывалось: вывод A1 сделан по стеку и коду Presence.
