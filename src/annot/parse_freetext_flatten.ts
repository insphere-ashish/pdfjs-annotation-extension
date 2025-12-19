import { AnnotationParser } from './parse'
import { rgb } from 'pdf-lib'
import { parseColor } from './color_utils'

/**
 * FreeTextFlattenParser - Draws text annotations directly on page (truly flattened for printing)
 */
export class FreeTextFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page } = this
        const pageHeight = page.getHeight()
        
        const rect = annotation.konvaClientRect
        const x = rect.x
        const y = pageHeight - rect.y - 20 // Position for icon
        
        // Extract color
        const color = annotation.color || '#FFFF00'
        const { r, g, b } = parseColor(color)
        
        // Draw note icon (small square)
        page.drawRectangle({
            x: x,
            y: y,
            width: 20,
            height: 20,
            color: rgb(r, g, b),
            opacity: 0.8
        })
        
        // Draw "T" for text note
        try {
            page.drawText('T', {
                x: x + 6,
                y: y + 5,
                size: 12,
                color: rgb(1, 1, 1)
            })
        } catch (e) {
            // If font issues, skip text
        }
    }
}
