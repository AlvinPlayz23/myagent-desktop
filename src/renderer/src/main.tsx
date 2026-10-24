import React from 'react'
import ReactDOM from 'react-dom/client'
// Inter for every piece of interface and prose text; IBM Plex Mono for code,
// diffs, terminal output and shortcuts. Both are pinned to the subsets this UI
// can actually display — the default imports pull cyrillic/greek/vietnamese and
// spend ~120 KB on glyph ranges that never render here.
import './styles.css'
import App from './App'

// Loop animations — the Working orb, the shimmer sweep, the streaming caret —
// have no reason to keep painting while the window is behind something else or
// on another virtual desktop. Pausing them is one class on <html>; the CSS side
// lives beside .reduce-motion in styles.css.
const syncWindowHidden = (): void => {
  document.documentElement.classList.toggle('window-hidden', document.hidden)
}
document.addEventListener('visibilitychange', syncWindowHidden)
syncWindowHidden()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
