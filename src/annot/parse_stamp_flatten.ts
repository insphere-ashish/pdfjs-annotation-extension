import { AnnotationParser } from './parse'
import { rgb } from 'pdf-lib'

/**
 * StampFlattenParser - Draws stamp images directly on page (truly flattened for printing)
 */
export class StampFlattenParser extends AnnotationParser {
    async parse() {
        const { annotation, page, pdfDoc } = this
        const pageHeight = page.getHeight()
        
        const rect = annotation.konvaClientRect
        const x = rect.x
        const y = pageHeight - rect.y - rect.height
        const width = rect.width
        const height = rect.height
        
        // If there's an image, embed and draw it
        if (annotation.contentsObj?.image) {
            try {
                const base64Str = annotation.contentsObj.image.replace(/^data:image\/png;base64,/, '')
                const pngImage = await pdfDoc.embedPng(base64Str)
                
                page.drawImage(pngImage, {
                    x: x,
                    y: y,
                    width: width,
                    height: height,
                    opacity: 0.8
                })
            } catch (error) {
                // If image fails, draw a placeholder rectangle
                page.drawRectangle({
                    x: x,
                    y: y,
                    width: width,
                    height: height,
                    color: rgb(1, 0, 0),
                    opacity: 0.3
                })
            }
        } else {
            // No image, draw placeholder
            page.drawRectangle({
                x: x,
                y: y,
                width: width,
                height: height,
                color: rgb(1, 0, 0),
                opacity: 0.3
            })
        }
    }
}
