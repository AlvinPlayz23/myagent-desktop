import type { ReactNode } from 'react'
import { cn } from '../util'

/** Column every settings page sits in, so Providers and the rest share one measure. */
export const SETTINGS_PAGE_CLASS = 'mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 pb-12 pt-8'

export function SettingsHeader({
  title,
  description,
  leading,
  action,
  className
}: {
  title: ReactNode
  description?: ReactNode
  leading?: ReactNode
  action?: ReactNode
  className?: string
}): JSX.Element {
  return (
    <header className={cn('flex flex-col gap-2', className)}>
      {leading}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-balance text-ui-xl font-semibold text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-prose text-pretty text-ui-base text-foreground-subtle">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
    </header>
  )
}
