import Konva from 'konva'

type CreateSvgIconArgs = {
    x: number
    y: number
    /** Either the raw SVG markup string OR a URL to an .svg file */
    svg: string
    /** Size in px of the longer edge after scaling (default 18 like your old rect) */
    size?: number
    /** Override fills/strokes of paths; if omitted, uses the SVG’s own fills/strokes */
    fill?: string
    stroke?: string
    strokeWidth?: number
}

/**
 * Create a Konva Group that renders an SVG as vector paths.
 * Returns an array so it's compatible with your existing ...spread add().
 */
export async function createSvgIcon({ x, y, svg, size = 18, fill, stroke, strokeWidth }: CreateSvgIconArgs): Promise<Konva.Node[]> {
    // If "svg" looks like a URL, fetch it. Otherwise treat it as raw SVG markup.
    const isUrl = /^https?:\/\//i.test(svg) || /\.svg(\?.*)?$/i.test(svg)
    const svgText = isUrl ? await fetch(svg).then(r => r.text()) : svg

    // Parse the SVG
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgText, 'image/svg+xml')
    const svgEl = doc.documentElement

    // Figure out source dimensions
    const vbAttr = svgEl.getAttribute('viewBox')
    let vbX = 0,
        vbY = 0,
        vbW = 0,
        vbH = 0
    if (vbAttr) {
        const nums = vbAttr.trim().split(/\s+|,/).map(Number)
        ;[vbX, vbY, vbW, vbH] = nums.length === 4 ? nums : [0, 0, 0, 0]
    }
    if (!vbW || !vbH) {
        // fall back to width/height attributes if no viewBox
        vbW = Number(svgEl.getAttribute('width') || 128)
        vbH = Number(svgEl.getAttribute('height') || 128)
    }

    // Scale so the longest edge becomes `size`
    const scale = size / Math.max(vbW, vbH)

    const group = new Konva.Group({
        x,
        y,
        // align top-left like your previous icon code
        offsetX: vbX,
        offsetY: vbY,
        scaleX: scale,
        scaleY: scale
    })

    // Create Path nodes for each <path> in the SVG
    const paths = Array.from(doc.querySelectorAll('path'))
    for (const p of paths) {
        const d = p.getAttribute('d')
        if (!d) continue

        // Respect the SVG's own styling unless overrides are provided
        const pathFill = fill ?? p.getAttribute('fill') ?? undefined
        const pathStroke = stroke ?? p.getAttribute('stroke') ?? undefined
        const sw = strokeWidth ?? (p.hasAttribute('stroke-width') ? Number(p.getAttribute('stroke-width')) : undefined)

        const node = new Konva.Path({
            data: d,
            // Convert 'none' to undefined so Konva doesn't treat it as a color
            fill: pathFill && pathFill !== 'none' ? pathFill : undefined,
            stroke: pathStroke && pathStroke !== 'none' ? pathStroke : undefined,
            strokeWidth: sw
        })
        group.add(node)
    }

    return [group]
}

export function createDocumentIcon({
    x,
    y,
    fill = 'rgb(255, 222, 33)',
    stroke = '#000',
    strokeWidth = 1,
    cornerSize = 3
}: {
    x: number
    y: number
    fill?: string
    stroke?: string
    strokeWidth?: number
    cornerSize?: number
}) {
    const width = 16
    const height = 16
    const paddingTop = 4
    const paddingBottom = 4
    const textLineCount = 4
    const spacing = (height - paddingTop - paddingBottom) / (textLineCount + 1)

    // 主体矩形带阴影和渐变
    const rect = new Konva.Rect({
        x,
        y,
        width,
        height,
        fillLinearGradientStartPoint: { x: 0, y: 0 },
        fillLinearGradientEndPoint: { x: 0, y: height },
        fillLinearGradientColorStops: [0, fill, 1, '#fff'],
        stroke,
        cornerRadius: [0, cornerSize, 0, 0],
        strokeWidth,
        shadowColor: 'rgba(0,0,0,0.2)',
        shadowBlur: 2,
        shadowOffset: { x: 1, y: 1 },
        shadowOpacity: 0.3
    })

    // 模拟文字的横线
    const lines = []
    for (let i = 1; i <= textLineCount; i++) {
        const yPos = y + paddingTop + i * spacing
        const xEnd = i === 1 ? x + width - 6 : x + width - 3 // 第一行略短
        const line = new Konva.Line({
            points: [x + 3, yPos, xEnd, yPos],
            stroke: '#555',
            strokeWidth: 0.6,
            lineCap: 'round'
        })
        lines.push(line)
    }

    return [rect, ...lines]
}
