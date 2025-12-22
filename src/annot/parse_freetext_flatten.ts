import { AnnotationParser } from './parse'
import { rgb, StandardFonts } from 'pdf-lib'
import { parseColor } from './color_utils'

/**
 * FreeTextFlattenParser - Draws text annotations directly on page (truly flattened for printing)
 */
export class FreeTextFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page, pdfDoc } = this
        const pageHeight = page.getHeight()
        const pageWidth = page.getWidth()
        
        console.log('=== FreeText Flatten Parser ===')
        console.log('Page dimensions:', pageWidth, 'x', pageHeight)
        
        // Parse konva string to get text data
        const konvaGroup = JSON.parse(annotation.konvaString)
        console.log('Konva group:', konvaGroup)
        
        const texts = konvaGroup.children.filter((item: any) => item.className === 'Text')
        console.log('Text elements found:', texts.length)
        
        const groupX = konvaGroup.attrs.x || 0
        const groupY = konvaGroup.attrs.y || 0
        const scaleX = konvaGroup.attrs.scaleX || 1
        const scaleY = konvaGroup.attrs.scaleY || 1
        const groupOpacity = konvaGroup.attrs?.opacity !== undefined ? konvaGroup.attrs.opacity : 1
        
        console.log('Group position:', groupX, groupY)
        console.log('Group scale:', scaleX, scaleY)
        console.log('Group opacity:', groupOpacity)
        
        // Get text content from annotation
        const textContent = annotation.contentsObj?.text || annotation.contents || ''
        console.log('Text content:', textContent)
        
        if (!textContent || texts.length === 0) {
            console.log('Skipping: no text content or text elements')
            return // No text to render
        }
        
        // Extract color
        const color = annotation.color || '#000000'
        const { r, g, b } = parseColor(color)
        console.log('Text color:', color, '-> RGB:', r, g, b)
        
        // Embed a standard font
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
        
        // Draw each text element
        for (let i = 0; i < texts.length; i++) {
            const text = texts[i]
            const attrs = text.attrs
            console.log(`Text element ${i} attrs:`, attrs)
            
            // Apply scale transforms to position and size
            const x = groupX + (attrs.x || 0) * scaleX
            const y = groupY + (attrs.y || 0) * scaleY
            const fontSize = (attrs.fontSize || 12) * scaleY
            const opacity = attrs.opacity !== undefined ? attrs.opacity : groupOpacity
            
            console.log(`Drawing text at: x=${x}, y=${y} (konva) -> scaleX=${scaleX}, scaleY=${scaleY}`)
            console.log(`Font size: ${fontSize}, Opacity: ${opacity}`)
            
            try {
                // Handle multi-line text (split by \n)
                const lines = textContent.split('\n')
                const lineHeight = fontSize * 1.2 // Standard line height multiplier
                
                // Draw each line separately
                for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                    const line = lines[lineIndex]
                    if (!line) continue // Skip empty lines
                    
                    // Calculate Y position for this line (adding lineHeight for each subsequent line)
                    const lineY = y + (lineIndex * lineHeight)
                    const pdfLineY = pageHeight - lineY - fontSize
                    
                    console.log(`  Line ${lineIndex}: "${line}" at pdfY=${pdfLineY}`)
                    
                    // Draw the text
                    // Note: pdf-lib's opacity parameter doesn't work with text color
                    const textColor = opacity < 1 
                        ? { type: 'RGB' as const, red: r, green: g, blue: b }
                        : rgb(r, g, b)
                    
                    page.drawText(line, {
                        x: x,
                        y: pdfLineY,
                        size: fontSize,
                        font: font,
                        color: textColor,
                        opacity: opacity // May not work for text, but include anyway
                    })
                }
                console.log('Text drawn successfully')
            } catch (error) {
                console.error('Error drawing text:', error)
            }
        }
        
        console.log('=== End FreeText Flatten Parser ===')
    }
}
