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
        const arrows = konvaGroup.children.filter((item: any) => item.className === 'Arrow')
        
        const groupX = konvaGroup.attrs.x || 0
        const groupY = konvaGroup.attrs.y || 0
        const scaleX = konvaGroup.attrs.scaleX || 1
        const scaleY = konvaGroup.attrs.scaleY || 1
        
        const firstArrow = arrows[0]?.attrs || {}
        const strokeWidth = firstArrow.strokeWidth ?? 2
        const color = firstArrow.stroke ?? annotation.color ?? 'rgb(255, 0, 0)'
        const pointerLength = firstArrow.pointerLength ?? 10
        const pointerWidth = firstArrow.pointerWidth ?? 10
        
        // Parse color
        const { r, g, b } = parseColor(color)
        
        // Draw each arrow
        for (const arrow of arrows) {
            const points = arrow.attrs.points as number[]
            
            if (points.length >= 4) {
                // Get start and end points
                const startX = groupX + points[0] * scaleX
                const startY = groupY + points[1] * scaleY
                const endX = groupX + points[points.length - 2] * scaleX
                const endY = groupY + points[points.length - 1] * scaleY
                
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
                        opacity: 0.8,
                        lineCap: 2 // Round cap
                    })
                }
                
                // Draw arrowhead at the end point
                this.drawArrowhead(
                    page,
                    points[points.length - 4] ? groupX + points[points.length - 4] * scaleX : startX,
                    points[points.length - 3] ? groupY + points[points.length - 3] * scaleY : startY,
                    endX,
                    endY,
                    pageHeight,
                    pointerLength * Math.max(scaleX, scaleY),
                    pointerWidth * Math.max(scaleX, scaleY),
                    strokeWidth,
                    rgb(r, g, b)
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
        color: any
    ) {
        // Calculate angle of the line
        const angle = Math.atan2(toY - fromY, toX - fromX)
        
        // Calculate arrowhead points
        const arrowAngle = Math.PI / 6 // 30 degrees
        
        // Left point of arrowhead
        const leftX = toX - pointerLength * Math.cos(angle - arrowAngle)
        const leftY = toY - pointerLength * Math.sin(angle - arrowAngle)
        
        // Right point of arrowhead
        const rightX = toX - pointerLength * Math.cos(angle + arrowAngle)
        const rightY = toY - pointerLength * Math.sin(angle + arrowAngle)
        
        // Draw left side of arrowhead
        page.drawLine({
            start: { x: toX, y: pageHeight - toY },
            end: { x: leftX, y: pageHeight - leftY },
            thickness: strokeWidth,
            color: color,
            opacity: 0.8,
            lineCap: 2
        })
        
        // Draw right side of arrowhead
        page.drawLine({
            start: { x: toX, y: pageHeight - toY },
            end: { x: rightX, y: pageHeight - rightY },
            thickness: strokeWidth,
            color: color,
            opacity: 0.8,
            lineCap: 2
        })
    }
}
