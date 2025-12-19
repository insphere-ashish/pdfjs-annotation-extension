import { AnnotationParser } from './parse'
import { rgb } from 'pdf-lib'

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
        const r = parseInt(color.slice(1, 3), 16) / 255
        const g = parseInt(color.slice(3, 5), 16) / 255
        const b = parseInt(color.slice(5, 7), 16) / 255
        
        // Draw each highlight rectangle
        for (const rect of rects) {
            const { x, y, width, height } = rect.attrs
            const pdfX = x
            const pdfY = pageHeight - y - height
            
            page.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: width,
                height: height,
                color: rgb(r, g, b),
                opacity: 0.3, // Semi-transparent for highlight effect
                borderWidth: 0
            })
        }
    }
}
