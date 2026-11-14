import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import { registerEditHost, type EditActions } from '@/shared/lib/edit-actions'
import { getPack, useI18n } from '@/shared/i18n'

const THEME = 'mte-comment'

function ensureMonaco(): void {
  const scope = globalThis as typeof globalThis & { MonacoEnvironment?: { getWorker: () => Worker } }
  if (!scope.MonacoEnvironment) {
    scope.MonacoEnvironment = {
      getWorker: () => new EditorWorker()
    }
    monaco.editor.defineTheme(THEME, {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#141414',
        'editor.foreground': '#f5f5f7',
        'editorGutter.background': '#141414',
        'editorLineNumber.foreground': '#6a6a6a',
        'editorLineNumber.activeForeground': '#b5b5b8',
        'editor.lineHighlightBackground': '#1c1c1c',
        'editorCursor.foreground': '#f5f5f7',
        'editor.selectionBackground': '#0a74e6',
        'editor.inactiveSelectionBackground': '#0a74e666',
        'editorPlaceholder.foreground': '#8e8e93',
        'scrollbarSlider.background': '#ffffff22',
        'scrollbarSlider.hoverBackground': '#ffffff33',
        'scrollbarSlider.activeBackground': '#ffffff44'
      }
    })
  }
}

function monacoActions(editor: monaco.editor.IStandaloneCodeEditor): EditActions {
  const readOnly = Boolean(editor.getRawOptions().readOnly)
  const selection = editor.getSelection()
  const picked = Boolean(selection && !selection.isEmpty())
  const focus = () => {
    editor.focus()
    if (selection) editor.setSelection(selection)
  }
  const run = (id: string) => {
    focus()
    editor.trigger('edit-menu', id, null)
  }
  return {
    canUndo: !readOnly,
    canRedo: !readOnly,
    canCut: picked && !readOnly,
    canCopy: picked,
    canPaste: !readOnly,
    canRemove: picked && !readOnly,
    canSelectAll: editor.getValue().length > 0,
    undo: () => run('undo'),
    redo: () => run('redo'),
    cut: () => run('editor.action.clipboardCutAction'),
    copy: () => run('editor.action.clipboardCopyAction'),
    paste: () => run('editor.action.clipboardPasteAction'),
    remove: () => {
      focus()
      const range = editor.getSelection()
      if (!range || range.isEmpty()) return
      editor.executeEdits('edit-menu', [{ range, text: '' }])
    },
    selectAll: () => run('editor.action.selectAll')
  }
}

export function CommentEditor({
  value,
  mixed,
  disabled,
  label,
  onChange
}: {
  value: string
  mixed: boolean
  disabled?: boolean
  label?: string
  onChange: (value: string) => void
}) {
  const { locale } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const applying = useRef(false)
  onChangeRef.current = onChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    ensureMonaco()
    const editor = monaco.editor.create(host, {
      value: mixed ? '' : value,
      language: 'plaintext',
      theme: THEME,
      readOnly: Boolean(disabled),
      placeholder: mixed ? getPack().mixed : '',
      automaticLayout: true,
      minimap: { enabled: false },
      wordWrap: 'on',
      fontFamily: 'Inter, Segoe UI, sans-serif',
      fontSize: 13,
      lineHeight: 20,
      padding: { top: 8, bottom: 8 },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      folding: false,
      glyphMargin: false,
      lineNumbersMinChars: 3,
      tabSize: 2,
      fixedOverflowWidgets: true,
      contextmenu: false,
      ariaLabel: label || getPack().comment,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }
    })
    editorRef.current = editor
    const stopEdit = registerEditHost(host, () => monacoActions(editor))
    const sub = editor.onDidChangeModelContent(() => {
      if (applying.current) return
      onChangeRef.current(editor.getValue())
    })
    return () => {
      stopEdit()
      sub.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const next = mixed ? '' : value
    if (editor.getValue() !== next) {
      applying.current = true
      editor.setValue(next)
      applying.current = false
    }
    editor.updateOptions({
      readOnly: Boolean(disabled),
      placeholder: mixed ? getPack().mixed : '',
      ariaLabel: label || getPack().comment
    })
  }, [value, mixed, disabled, locale, label])

  return (
    <div className="note-editor" data-no-track-nav="">
      <div ref={hostRef} className="note-monaco" />
    </div>
  )
}
