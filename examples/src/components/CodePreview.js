import Highlight, { defaultProps } from 'prism-react-renderer'
import CopyButton from './CopyButton'
import theme from 'prism-react-renderer/themes/okaidia'

export default function CodePreview({ code, ...props }) {
  return (
    <Highlight {...defaultProps} className="language-jsx" code={code} language="jsx" theme={theme}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        // define how each line is to be rendered in the code block,
        // position is set to relative so the copy button can align to bottom right
        <pre className={className} style={{ ...style, position: 'relative' }}>
          {tokens.map((line, i) => (
            <div {...getLineProps({ line, key: i })}>
              {line.map((token, key) => (
                <span {...getTokenProps({ token, key })} />
              ))}
            </div>
          ))}
          <CopyButton code={code} />
        </pre>
      )}
    </Highlight>
  )
}
