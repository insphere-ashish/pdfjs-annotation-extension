/**
 * Utility function to parse color strings into RGB values (0-1 range)
 * Handles hex colors (#RGB, #RRGGBB) and rgb/rgba formats
 */
export function parseColor(color: string): { r: number; g: number; b: number } {
    let r = 1, g = 0, b = 0
    
    if (!color) {
        return { r: 1, g: 0, b: 0 }
    }
    
    if (color.startsWith('#')) {
        // Handle hex color
        const hex = color.slice(1)
        if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16) / 255
            g = parseInt(hex.slice(2, 4), 16) / 255
            b = parseInt(hex.slice(4, 6), 16) / 255
        } else if (hex.length === 3) {
            // Short form: #RGB -> #RRGGBB
            r = parseInt(hex[0] + hex[0], 16) / 255
            g = parseInt(hex[1] + hex[1], 16) / 255
            b = parseInt(hex[2] + hex[2], 16) / 255
        }
    } else if (color.startsWith('rgb')) {
        // Handle rgb(r, g, b) or rgba(r, g, b, a)
        const match = color.match(/\d+/g)
        if (match && match.length >= 3) {
            r = parseInt(match[0]) / 255
            g = parseInt(match[1]) / 255
            b = parseInt(match[2]) / 255
        }
    }
    
    // Ensure values are valid numbers between 0 and 1
    r = isNaN(r) ? 1 : Math.max(0, Math.min(1, r))
    g = isNaN(g) ? 0 : Math.max(0, Math.min(1, g))
    b = isNaN(b) ? 0 : Math.max(0, Math.min(1, b))
    
    return { r, g, b }
}
