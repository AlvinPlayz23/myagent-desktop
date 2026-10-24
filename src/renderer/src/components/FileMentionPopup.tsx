import { useEffect, useRef } from 'react'
import type { WorkspaceFile } from '../../../shared/protocol'
import { cn } from '../util'
import { File01 } from './ui/icons'

/** Folder part of a relative path; empty for a root-level file. */
function folderOf(path: string): string {
  const at = path.lastIndexOf('/')
  return at > 0 ? path.slice(0, at) : ''
}

/**
 * The `@` picker's result list, rendered as a tab of the composer's tray so it
 * reads as one surface with the draft (the same connected panel the `/` list
 * uses) rather than a floating card. The draft keeps focus the whole time: only
 * pointer selection and the highlight live here — typing, arrows, Enter and
 * Escape are handled by the editable node in Composer.
 */
export default function FileMentionPopup({
  files,
  activeIndex,
  loading,
  onHover,
  onPick
}: {
  files: WorkspaceFile[]
  activeIndex: number
  loading: boolean
  onHover(index: number): void
  onPick(file: WorkspaceFile): void
}): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)

  // Keyboard navigation can walk below the cut; keep the active row visible.
  // Scrolled by hand rather than scrollIntoView, which would also scroll the
  // transcript this tray hides behind.
  useEffect(() => {
    const list = listRef.current
    const row = list?.children[activeIndex] as HTMLElement | undefined
    if (!list || !row) return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
  }, [activeIndex])

  return (
    <div className="flex h-full flex-col pb-3 pt-1.5">
      <div
        ref={listRef}
        className="no-scrollbar relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1.5"
        role="listbox"
        aria-label="Project files"
      >
        {files.length === 0 ? (
          <div className="px-1.5 py-1 text-ui-sm text-foreground-subtlest">
            {loading ? 'Searching…' : 'No matching files'}
          </div>
        ) : (
          files.map((file, index) => (
            <button
              key={file.path}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHover(index)}
              onClick={() => onPick(file)}
              className={cn(
                'flex h-[30px] w-full shrink-0 items-center gap-2 rounded-lg px-2 text-left text-ui-caption transition-colors',
                index === activeIndex
                  ? 'bg-selected text-foreground'
                  : 'text-muted-foreground hover:bg-hover hover:text-foreground'
              )}
            >
              <File01 size={12} strokeWidth={1.8} className="shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{file.name}</span>
              {folderOf(file.path) && (
                <span className="ml-2 max-w-[45%] shrink-0 truncate text-ui-xs text-foreground-subtlest">
                  {folderOf(file.path)}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
