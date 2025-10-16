import React, { useState, useRef, useLayoutEffect } from 'react'

interface ExpandableParagraphProps {
    text: string
    rows?: number
    moreLabel?: string
    lessLabel?: string
}

const ExpandableParagraph: React.FC<ExpandableParagraphProps> = ({ text, rows = 3, moreLabel = 'More', lessLabel = 'Less' }) => {
    const [expanded, setExpanded] = useState(false)
    const [isOverflowing, setIsOverflowing] = useState(false)
    const textRef = useRef<HTMLDivElement>(null)

    // Use ResizeObserver to detect width/height changes accurately
    useLayoutEffect(() => {
        const el = textRef.current
        if (!el) return

        const resizeObserver = new ResizeObserver(() => {
            measureOverflow()
        })

        resizeObserver.observe(el)
        measureOverflow() // initial check

        return () => resizeObserver.disconnect()
    }, [text, rows])

    const measureOverflow = () => {
        const el = textRef.current
        if (!el) return

        const computedStyle = getComputedStyle(el)
        const lineHeight = parseFloat(computedStyle.lineHeight || '22')
        const maxHeight = lineHeight * rows

        const isOver = el.scrollHeight > maxHeight + 1
        setIsOverflowing(isOver)
    }

    const toggleExpanded = () => setExpanded(prev => !prev)

    return (
        <div style={{ margin: '8px 15px' }} className="ant-typography ant-typography-ellipsis">
            <div
                ref={textRef}
                style={{
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: !expanded && isOverflowing ? rows : 'unset',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: '22px',
                    fontSize: '14px'
                }}
            >
                {text}
            </div>

            {/* Toggle More/Less only if overflowed */}
            {isOverflowing && (
                <a className="ant-typography-expand" onClick={toggleExpanded} style={{ display: 'inline-block', marginTop: 4, marginLeft: 2, cursor: 'pointer' }}>
                    {!expanded ? `${moreLabel}` : lessLabel}
                </a>
            )}
        </div>
    )
}

export default ExpandableParagraph
