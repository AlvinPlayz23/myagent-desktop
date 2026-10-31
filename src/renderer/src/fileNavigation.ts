import { createContext, useContext } from 'react'

/** Opens a project file in the right dock. */
export type OpenFileHandler = (path: string) => void

const FileNavigationContext = createContext<OpenFileHandler | null>(null)

export const FileNavigationProvider = FileNavigationContext.Provider

export function useFileNavigation(): OpenFileHandler | null {
  return useContext(FileNavigationContext)
}
