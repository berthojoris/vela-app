import { useEffect, useRef, useState } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { LanguageDescription } from '@codemirror/language';
import { useEditorStore, type EditorDocument } from '../../stores/useEditorStore';

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: '#09090b', color: '#f4f4f6', fontSize: '13px' },
    '.cm-scroller': {
      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
      lineHeight: '1.7',
      overflow: 'auto',
    },
    '.cm-content': { padding: '12px 0', caretColor: '#3b82f6' },
    '.cm-line': { padding: '0 16px' },
    '.cm-gutters': { backgroundColor: '#09090b', color: '#8c8c9a', borderRight: '1px solid #27272f' },
    '.cm-gutterElement': { padding: '0 12px 0 16px' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#18181d' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#3b82f6' },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#1e3a5f',
    },
    '.cm-panels, .cm-tooltip': { backgroundColor: '#18181d', color: '#f4f4f6', border: '1px solid #27272f' },
    '.cm-searchMatch': { backgroundColor: '#f59e0b33', outline: '1px solid #f59e0b' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#f59e0b55' },
  },
  { dark: true }
);

export function CodeEditor({ document, active }: { document: EditorDocument; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const [languageName, setLanguageName] = useState('Plain text');
  useEffect(() => {
    const language = new Compartment();
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: document.content,
        extensions: [
          basicSetup,
          oneDark,
          theme,
          EditorState.tabSize.of(2),
          keymap.of([indentWithTab]),
          language.of([]),
          EditorView.contentAttributes.of({ 'aria-label': `Edit ${document.path}`, spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) useEditorStore.getState().updateContent(document.id, update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              setPosition({ line: line.number, column: head - line.from + 1 });
            }
          }),
        ],
      }),
    });
    view.current = editor;
    let disposed = false;
    const description = LanguageDescription.matchFilename(languages, document.path);
    if (description) {
      void description
        .load()
        .then((support) => {
          if (!disposed) {
            editor.dispatch({ effects: language.reconfigure(support) });
            setLanguageName(description.name);
          }
        })
        .catch(() => {
          /* Editing remains available if optional syntax support cannot load. */
        });
    }
    return () => {
      disposed = true;
      editor.destroy();
      view.current = null;
    };
    // Each document keeps its own view, selection, scroll, and undo history until closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id]);

  useEffect(() => {
    if (active) {
      view.current?.requestMeasure();
      view.current?.focus();
    }
  }, [active]);

  return (
    <div className={active ? 'flex-1 min-h-0 flex flex-col' : 'hidden'} aria-hidden={!active}>
      <div ref={host} className="flex-1 min-h-0 overflow-hidden select-text" />
      <div className="h-6 border-t border-orca-border px-3 flex items-center justify-end gap-4 text-[10px] text-orca-muted shrink-0">
        <span className="tabular-nums">
          Ln {position.line}, Col {position.column}
        </span>
        <span>UTF-8{document.has_bom ? ' BOM' : ''}</span>
        <span>{document.line_ending}</span>
        <span>{languageName}</span>
      </div>
    </div>
  );
}
