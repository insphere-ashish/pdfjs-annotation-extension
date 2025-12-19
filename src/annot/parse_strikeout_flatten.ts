import { AnnotationParser } from './parse'
import { rgb } from 'pdf-lib'
import { parseColor } from './color_utils'

/**
 * StrikeOutFlattenParser - Draws strikethrough lines directly on page (truly flattened for printing)
 */
export class StrikeOutFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page } = this
        const pageHeight = page.getHeight()
        
        const konvaGroup = JSON.parse(annotation.konvaString)
        const lines = konvaGroup.children.filter((item: any) => item.className === 'Line')
        
        // Extract color
        const color = annotation.color || '#FF0000'
        const { r, g, b } = parseColor(color)
        
        // Draw each strikethrough line with round caps for smooth appearance
        for (const line of lines) {
            const points = line.attrs.points as number[]
            
            // Draw lines between consecutive points
            for (let i = 0; i < points.length - 2; i += 2) {
                const x1 = points[i]
                const y1 = pageHeight - points[i + 1]
                const x2 = points[i + 2]
                const y2 = pageHeight - points[i + 3]
                
                page.drawLine({
                    start: { x: x1, y: y1 },
                    end: { x: x2, y: y2 },
                    thickness: 1.5,
                    color: rgb(r, g, b),
                    opacity: 0.8,
                    lineCap: 2 // Round cap
                })
            }
        }
    }
}
