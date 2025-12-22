import { AnnotationParser } from './parse'
import { rgb, PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { parseColor } from './color_utils'

/**
 * TextFlattenParser - Draws note icons/markers directly on page (truly flattened for printing)
 */
export class TextFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page, pdfDoc } = this
        const pageHeight = page.getHeight()
        
        const rect = annotation.konvaClientRect
        const x = rect.x
        const y = pageHeight - rect.y - rect.height
        
        // Parse konva string to get opacity from group if available
        const konvaGroup = JSON.parse(annotation.konvaString)
        const groupOpacity = konvaGroup.attrs?.opacity !== undefined ? konvaGroup.attrs.opacity : 0.8
        
        // Extract color
        const color = annotation.color || '#FFFF00'
        const { r, g, b } = parseColor(color)
        
        // Draw a small filled circle/square to represent the note
        page.drawCircle({
            x: x + 10,
            y: y + 10,
            size: 10,
            color: rgb(r, g, b),
            opacity: groupOpacity
        })
        
        // Draw "N" text to indicate it's a note
        try {
            page.drawText('N', {
                x: x + 7,
                y: y + 6,
                size: 10,
                color: rgb(1, 1, 1) // White text
            })
        } catch (e) {
            // If font issues, skip text
        }
    }
}
