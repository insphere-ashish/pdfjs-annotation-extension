import { AnnotationParser } from './parse'
import { rgb } from 'pdf-lib'
import { parseColor } from './color_utils'

/**
 * CircleFlattenParser - Draws ellipses/circles directly on page (truly flattened for printing)
 * Preserves the exact shape including ovals and irregular circular shapes
 */
export class CircleFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page, pdfDoc } = this
        const pageHeight = page.getHeight()
        
        // Parse konva string to get ellipse data
        const konvaGroup = JSON.parse(annotation.konvaString)
        const ellipses = konvaGroup.children.filter((item: any) => item.className === 'Ellipse')
        
        const groupX = konvaGroup.attrs.x || 0
        const groupY = konvaGroup.attrs.y || 0
        const scaleX = konvaGroup.attrs.scaleX || 1
        const scaleY = konvaGroup.attrs.scaleY || 1
        
        // Extract and parse color
        const color = annotation.color || '#FF0000'
        const { r, g, b } = parseColor(color)
        
        // Draw each ellipse using drawEllipse for smooth continuous stroke
        for (const ellipse of ellipses) {
            const attrs = ellipse.attrs
            const centerX = (attrs.x || 0) * scaleX + groupX
            const centerY = (attrs.y || 0) * scaleY + groupY
            const radiusX = (attrs.radiusX || 0) * scaleX
            const radiusY = (attrs.radiusY || 0) * scaleY
            const strokeWidth = attrs.strokeWidth || 2
            
            // Convert center to PDF coordinates
            const pdfCenterY = pageHeight - centerY
            
            // Use drawEllipse for smooth continuous stroke
            page.drawEllipse({
                x: centerX,
                y: pdfCenterY,
                xScale: radiusX,
                yScale: radiusY,
                borderWidth: strokeWidth,
                borderColor: rgb(r, g, b),
                color: undefined, // No fill, only stroke
                borderOpacity: 0.8
            })
        }
    }
}
