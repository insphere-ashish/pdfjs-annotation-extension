import { AnnotationParser } from './parse'
import { rgb } from 'pdf-lib'
import { parseColor } from './color_utils'

/**
 * LineFlattenParser - Draws arrow/line annotations directly on page (truly flattened for printing)
 */
export class LineFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page } = this
        const pageHeight = page.getHeight()
        
        const konvaGroup = JSON.parse(annotation.konvaString)
        
        console.log('[LineFlattenParser] Full konva group:', konvaGroup)
        console.log('[LineFlattenParser] Children:', konvaGroup.children.map((c: any) => ({ 
            className: c.className, 
            hasPoints: !!c.attrs.points,
            pointsLength: c.attrs.points?.length 
        })))
        
        const arrows = konvaGroup.children.filter((item: any) => item.className === 'Arrow')
        
        const groupX = konvaGroup.attrs.x || 0
        const groupY = konvaGroup.attrs.y || 0
        const scaleX = konvaGroup.attrs.scaleX || 1
        const scaleY = konvaGroup.attrs.scaleY || 1
        const groupOpacity = konvaGroup.attrs?.opacity !== undefined ? konvaGroup.attrs.opacity : 1
        
        const firstArrow = arrows[0]?.attrs || {}
        // Use average of scales for uniform properties like stroke width
        const avgScale = (scaleX + scaleY) / 2
        const strokeWidth = (firstArrow.strokeWidth ?? 2) * avgScale
        const color = firstArrow.stroke ?? annotation.color ?? 'rgb(255, 0, 0)'
        // For pointer dimensions, use the scale in the direction of the arrow
        // We'll calculate this per arrow based on its angle
        const pointerLength = (firstArrow.pointerLength ?? 10) * avgScale
        const pointerWidth = (firstArrow.pointerWidth ?? 10) * avgScale
        const opacity = firstArrow.opacity !== undefined ? firstArrow.opacity : groupOpacity
        
        // Parse color
        const { r, g, b } = parseColor(color)
        
        console.log('[LineFlattenParser] Arrow config:', {
            strokeWidth, originalStrokeWidth: firstArrow.strokeWidth,
            pointerLength, originalPointerLength: firstArrow.pointerLength,
            pointerWidth, originalPointerWidth: firstArrow.pointerWidth,
            scaleX, scaleY, groupX, groupY, opacity, color
        })
        
        // Draw each arrow
        for (const arrow of arrows) {
            const points = arrow.attrs.points as number[]
            const arrowOpacity = arrow.attrs.opacity !== undefined ? arrow.attrs.opacity : opacity
            
            if (points.length >= 4) {
                // Get start and end points with scale
                const startX = groupX + points[0] * scaleX
                const startY = groupY + points[1] * scaleY
                const endX = groupX + points[points.length - 2] * scaleX
                const endY = groupY + points[points.length - 1] * scaleY
                
                console.log('[LineFlattenParser] Arrow points:', {
                    points, startX, startY, endX, endY
                })
                
                // Draw all line segments with round caps for smooth connections
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
                        opacity: arrowOpacity,
                        lineCap: 2 // Round cap
                    })
                }
                
                // Draw arrowhead at the end point
                this.drawArrowhead(
                    page,
                    points[points.length - 4] ? groupX + points[points.length - 4] : startX,
                    points[points.length - 3] ? groupY + points[points.length - 3] : startY,
                    endX,
                    endY,
                    pageHeight,
                    pointerLength,
                    pointerWidth,
                    strokeWidth,
                    rgb(r, g, b),
                    arrowOpacity
                )
            }
        }
    }
    
    private drawArrowhead(
        page: any,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        pageHeight: number,
        pointerLength: number,
        pointerWidth: number,
        strokeWidth: number,
        color: any,
        opacity: number
    ) {
        // Calculate angle of the line
        const angle = Math.atan2(toY - fromY, toX - fromX)
        
        // Calculate arrowhead points using pointerWidth for the spread
        // pointerWidth determines how wide the arrowhead is
        const halfWidth = pointerWidth / 2
        
        // Calculate perpendicular angle for width
        const perpAngle = angle + Math.PI / 2
        
        // Base point of arrowhead (back from tip by pointerLength)
        const baseX = toX - pointerLength * Math.cos(angle)
        const baseY = toY - pointerLength * Math.sin(angle)
        
        // Left point of arrowhead (perpendicular from base)
        const leftX = baseX + halfWidth * Math.cos(perpAngle)
        const leftY = baseY + halfWidth * Math.sin(perpAngle)
        
        // Right point of arrowhead (perpendicular from base, other side)
        const rightX = baseX - halfWidth * Math.cos(perpAngle)
        const rightY = baseY - halfWidth * Math.sin(perpAngle)
        
        // Draw left side of arrowhead
        page.drawLine({
            start: { x: toX, y: pageHeight - toY },
            end: { x: leftX, y: pageHeight - leftY },
            thickness: strokeWidth,
            color: color,
            opacity: opacity,
            lineCap: 2
        })
        
        // Draw right side of arrowhead
        page.drawLine({
            start: { x: toX, y: pageHeight - toY },
            end: { x: rightX, y: pageHeight - rightY },
            thickness: strokeWidth,
            color: color,
            opacity: opacity,
            lineCap: 2
        })
    }
}
