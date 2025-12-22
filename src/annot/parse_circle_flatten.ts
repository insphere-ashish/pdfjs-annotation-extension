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
        const pageWidth = page.getWidth()
        
        try {
            // Parse konva string to get ellipse data
            const konvaGroup = JSON.parse(annotation.konvaString)
            const ellipses = konvaGroup.children.filter((item: any) => item.className === 'Ellipse')
            
            console.log(`[CircleFlattenParser] Processing annotation ${annotation.name}, found ${ellipses.length} ellipse(s)`)
            
            // Group position and scale
            const groupX = konvaGroup.attrs.x || 0
            const groupY = konvaGroup.attrs.y || 0
            const scaleX = konvaGroup.attrs.scaleX || 1
            const scaleY = konvaGroup.attrs.scaleY || 1
            const groupOpacity = konvaGroup.attrs?.opacity !== undefined ? konvaGroup.attrs.opacity : 1
            
            // Extract and parse color
            const color = annotation.color || '#FF0000'
            const { r, g, b } = parseColor(color)
            
            // Draw each ellipse using drawEllipse for smooth continuous stroke
            for (let i = 0; i < ellipses.length; i++) {
                const ellipse = ellipses[i]
                const attrs = ellipse.attrs
                // Apply scale transforms to coordinates and dimensions
                const centerX = groupX + (attrs.x || 0) * scaleX
                const centerY = groupY + (attrs.y || 0) * scaleY
                const radiusX = (attrs.radiusX || 0) * scaleX
                const radiusY = (attrs.radiusY || 0) * scaleY
                const strokeWidth = (attrs.strokeWidth || 2) * Math.max(scaleX, scaleY)
                const opacity = attrs.opacity !== undefined ? attrs.opacity : groupOpacity
                
                // Convert center to PDF coordinates
                const pdfCenterY = pageHeight - centerY
                
                console.log(`[CircleFlattenParser] Drawing ellipse ${i}:`, {
                    centerX, centerY, pdfCenterY, radiusX, radiusY, 
                    strokeWidth, originalStrokeWidth: attrs.strokeWidth, scaleX, scaleY,
                    opacity, pageWidth, pageHeight,
                    inBounds: centerX >= 0 && centerX <= pageWidth && pdfCenterY >= 0 && pdfCenterY <= pageHeight
                })
                
                // Skip if ellipse is completely outside page bounds
                if (centerX < -radiusX || centerX > pageWidth + radiusX || 
                    pdfCenterY < -radiusY || pdfCenterY > pageHeight + radiusY) {
                    console.warn(`[CircleFlattenParser] Ellipse ${i} is outside page bounds, skipping`)
                    continue
                }
                
                // Ensure valid dimensions
                if (radiusX <= 0 || radiusY <= 0) {
                    console.warn(`[CircleFlattenParser] Ellipse ${i} has invalid radius (radiusX: ${radiusX}, radiusY: ${radiusY}), skipping`)
                    continue
                }
                
                try {
                    // Use drawEllipse for smooth continuous stroke
                    page.drawEllipse({
                        x: centerX,
                        y: pdfCenterY,
                        xScale: radiusX,
                        yScale: radiusY,
                        borderWidth: strokeWidth,
                        borderColor: rgb(r, g, b),
                        color: undefined, // No fill, only stroke
                        opacity: opacity // Use opacity, not borderOpacity
                    })
                    console.log(`[CircleFlattenParser] Successfully drew ellipse ${i}`)
                } catch (drawError) {
                    console.error(`[CircleFlattenParser] Error drawing ellipse ${i}:`, drawError)
                }
            }
        } catch (error) {
            console.error('[CircleFlattenParser] Error parsing annotation:', error)
            console.error('[CircleFlattenParser] Annotation data:', annotation)
        }
    }
}
