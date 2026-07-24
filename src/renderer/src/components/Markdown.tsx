import { memo, useState, isValidElement, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy01, Check } from './ui/icons'

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (isValidElement(node)) return extractText(node.props.children)
  return ''
}

function CodeBlock({ children }: { children?: ReactNode }): JSX.Element {
  const [copied, setCopied] = useState(false)
  let lang = ''
  if (isValidElement(children)) {
    const cls = (children.props.className as string) || ''
    const m = cls.match(/language-(\S+)/)
    if (m) lang = m[1]
  }
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(extractText(children).replace(/\n$/, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard access can be denied by the operating system or browser shell.
    }
  }
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span className="codeblock-lang">{lang || 'code'}</span>
        <button type="button" className="codeblock-copy" onClick={() => void copy()} title="Copy code">
           {copied ? <Check size={13} strokeWidth={1.8} /> : <Copy01 size={13} strokeWidth={1.8} />}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

const Markdown = memo(function Markdown({ text }: { text: string }): JSX.Element {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="table-scroll">
              <table>{children}</table>
            </div>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})

export default Markdown
