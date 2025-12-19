import { AnnotationParser } from './parse'
import { rgb } from 'pdf-lib'
import { parseColor } from './color_utils'

/**
 * SquareFlattenParser - Draws rectangles directly on page (truly flattened for printing)
 * Uses actual konva rectangle data to preserve exact shape
 */
export class SquareFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page } = this
        const pageHeight = page.getHeight()
        
        // Parse konva string to get rectangle data
        const konvaGroup = JSON.parse(annotation.konvaString)
        const rects = konvaGroup.children.filter((item: any) => item.className === 'Rect')
        
        const groupX = konvaGroup.attrs.x || 0
        const groupY = konvaGroup.attrs.y || 0
        const scaleX = konvaGroup.attrs.scaleX || 1
        const scaleY = konvaGroup.attrs.scaleY || 1
        
        // Extract color
        const color = annotation.color || '#FF0000'
        const { r, g, b } = parseColor(color)
        
        // Draw each rectangle
        for (const rect of rects) {
            const attrs = rect.attrs
            const x = (attrs.x || 0) * scaleX + groupX
            const y = (attrs.y || 0) * scaleY + groupY
            const width = (attrs.width || 0) * scaleX
            const height = (attrs.height || 0) * scaleY
            const strokeWidth = attrs.strokeWidth || 2
            
            // Convert to PDF coordinates (bottom-up)
            const pdfX = x
            const pdfY = pageHeight - y - height
            
            // Draw rectangle directly on page (this will print!)
            page.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: width,
                height: height,
                borderColor: rgb(r, g, b),
                borderWidth: strokeWidth,
                opacity: 0.8
            })
        }
    }
}
