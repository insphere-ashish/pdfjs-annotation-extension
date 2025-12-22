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
        
        const groupX = konvaGroup.attrs.x || 0
        const groupY = konvaGroup.attrs.y || 0
        const scaleX = konvaGroup.attrs.scaleX || 1
        const scaleY = konvaGroup.attrs.scaleY || 1
        const groupOpacity = konvaGroup.attrs?.opacity !== undefined ? konvaGroup.attrs.opacity : 1
        
        // Extract color
        const color = annotation.color || '#FF0000'
        const { r, g, b } = parseColor(color)
        
        // Get opacity from first line
        const firstLine = lines[0]?.attrs || {}
        const opacity = firstLine.opacity !== undefined ? firstLine.opacity : groupOpacity
        
        // Draw each strikethrough line with round caps for smooth appearance
        for (const line of lines) {
            const points = line.attrs.points as number[]
            const lineOpacity = line.attrs.opacity !== undefined ? line.attrs.opacity : opacity
            
            // Draw lines between consecutive points
            for (let i = 0; i < points.length - 2; i += 2) {
                const x1 = groupX + points[i] * scaleX
                const y1 = pageHeight - (groupY + points[i + 1] * scaleY)
                const x2 = groupX + points[i + 2] * scaleX
                const y2 = pageHeight - (groupY + points[i + 3] * scaleY)
                
                page.drawLine({
                    start: { x: x1, y: y1 },
                    end: { x: x2, y: y2 },
                    thickness: 1.5,
                    color: rgb(r, g, b),
                    opacity: lineOpacity,
                    lineCap: 2 // Round cap
                })
            }
        }
    }
}
