import { AnnotationParser } from './parse'
import { rgb } from 'pdf-lib'
import { parseColor } from './color_utils'

/**
 * HighlightFlattenParser - Draws highlight rectangles directly on page (truly flattened for printing)
 */
export class HighlightFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page } = this
        const pageHeight = page.getHeight()
        
        // Parse konva string to get individual highlight rects
        const konvaGroup = JSON.parse(annotation.konvaString)
        const rects = konvaGroup.children.filter((item: any) => item.className === 'Rect')
        
        // Extract color
        const color = annotation.color || '#FFFF00'
        const { r, g, b } = parseColor(color)
        
        // Get default opacity from group or use 0.3 for highlights
        const groupOpacity = konvaGroup.attrs?.opacity !== undefined ? konvaGroup.attrs.opacity : 0.3
        
        // Draw each highlight rectangle
        for (const rect of rects) {
            const { x, y, width, height } = rect.attrs
            const rectOpacity = rect.attrs.opacity !== undefined ? rect.attrs.opacity : groupOpacity
            const pdfX = x
            const pdfY = pageHeight - y - height
            
            page.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: width,
                height: height,
                color: rgb(r, g, b),
                opacity: rectOpacity,
                borderWidth: 0
            })
        }
    }
}
