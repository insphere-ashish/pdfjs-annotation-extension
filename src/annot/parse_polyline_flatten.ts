import { AnnotationParser } from './parse'
import { rgb } from 'pdf-lib'
import { parseColor } from './color_utils'

/**
 * PolylineFlattenParser - Draws polyline/cloud shapes directly on page (truly flattened for printing)
 */
export class PolylineFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page } = this
        const pageHeight = page.getHeight()
        
        const konvaGroup = JSON.parse(annotation.konvaString)
        const paths = konvaGroup.children.filter((item: any) => item.className === 'Path')
        
        const groupX = konvaGroup.attrs.x || 0
        const groupY = konvaGroup.attrs.y || 0
        const scaleX = konvaGroup.attrs.scaleX || 1
        const scaleY = konvaGroup.attrs.scaleY || 1
        
        const firstPath = paths[0]?.attrs || {}
        const strokeWidth = firstPath.strokeWidth ?? 2
        const color = firstPath.stroke ?? annotation.color ?? 'rgb(255, 0, 0)'
        
        // Parse color
        const { r, g, b } = parseColor(color)
        
        // Draw polyline/cloud by parsing SVG path and drawing lines with round caps
        for (const path of paths) {
            const pathData = path.attrs.data as string
            const points = this.parseSvgPathToPoints(pathData)
            
            // Draw lines between consecutive points
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
        }
    }
    
    private parseSvgPathToPoints(data: string): number[] {
        const commands = data.match(/[a-zA-Z][^a-zA-Z]*/g) || []
        const points: number[] = []
        
        for (const cmd of commands) {
            const type = cmd[0]
            const nums = cmd
                .slice(1)
                .trim()
                .split(/[\s,]+/)
                .map(parseFloat)

            if (type === 'M' || type === 'L') {
                for (let i = 0; i < nums.length; i += 2) {
                    points.push(nums[i], nums[i + 1])
                }
            } else if (type === 'Q' && nums.length >= 4) {
                points.push(nums[2], nums[3])
            } else if (type === 'C' && nums.length >= 6) {
                points.push(nums[4], nums[5])
            }
        }
        return points
    }
}
