import { AnnotationParser } from './parse'
import { rgb } from 'pdf-lib'
import { parseColor } from './color_utils'

/**
 * InkFlattenParser - Draws freehand ink paths directly on page (truly flattened for printing)
 */
export class InkFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page } = this
        const pageHeight = page.getHeight()
        
        const konvaGroup = JSON.parse(annotation.konvaString)
        const lines = konvaGroup.children.filter((item: any) => item.className === 'Line')
        
        const groupX = konvaGroup.attrs.x || 0
        const groupY = konvaGroup.attrs.y || 0
        const scaleX = konvaGroup.attrs.scaleX || 1
        const scaleY = konvaGroup.attrs.scaleY || 1
        
        const firstLine = lines[0]?.attrs || {}
        const strokeWidth = firstLine.strokeWidth ?? 2
        const color = firstLine.stroke ?? annotation.color ?? 'rgb(255, 0, 0)'
        
        // Parse color
        const { r, g, b } = parseColor(color)
        
        // Draw each line using multiple drawLine calls with round caps for smooth appearance
        for (const line of lines) {
            const points = line.attrs.points as number[]
            
            // Draw lines between consecutive points with round caps for smoothness
            for (let i = 0; i < points.length - 2; i += 2) {
                const x1 = groupX + points[i] * scaleX
                const y1 = groupY + points[i + 1] * scaleY
                const x2 = groupX + points[i + 2] * scaleX
                const y2 = groupY + points[i + 3] * scaleY
                
                page.drawLine({
                    start: { x: x1, y: pageHeight - y1 },
                    end: { x: x2, y: pageHeight - y2 },
                    thickness: strokeWidth,
                    color: rgb(r, g, b),
                    opacity: 0.8,
                    lineCap: 2 // Round cap for smooth connections
                })
            }
        }
    }
}
