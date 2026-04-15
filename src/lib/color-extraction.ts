export interface ExtractedColors {
  primary: string
  secondary: string
  accent: string
  vibrant: string
}

export async function extractColorsFromImage(imageUrl: string): Promise<ExtractedColors> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }
        
        const scaleFactor = 0.25
        canvas.width = img.width * scaleFactor
        canvas.height = img.height * scaleFactor
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const pixels = imageData.data
        
        const colorCounts: Map<string, { count: number; r: number; g: number; b: number; saturation: number; brightness: number }> = new Map()
        
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i]
          const g = pixels[i + 1]
          const b = pixels[i + 2]
          const a = pixels[i + 3]
          
          if (a < 128) continue
          
          const brightness = (r + g + b) / 3
          if (brightness < 20 || brightness > 240) continue
          
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const saturation = max === 0 ? 0 : (max - min) / max
          
          if (saturation < 0.2) continue
          
          const quantize = 32
          const qr = Math.floor(r / quantize) * quantize
          const qg = Math.floor(g / quantize) * quantize
          const qb = Math.floor(b / quantize) * quantize
          
          const key = `${qr},${qg},${qb}`
          
          if (colorCounts.has(key)) {
            colorCounts.get(key)!.count++
          } else {
            colorCounts.set(key, { count: 1, r: qr, g: qg, b: qb, saturation, brightness })
          }
        }
        
        const sortedColors = Array.from(colorCounts.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 10)
        
        if (sortedColors.length === 0) {
          resolve({
            primary: 'oklch(0.55 0.18 250)',
            secondary: 'oklch(0.35 0.02 260)',
            accent: 'oklch(0.75 0.14 195)',
            vibrant: 'oklch(0.65 0.20 220)'
          })
          return
        }
        
        const rgbToOklch = (r: number, g: number, b: number): string => {
          const rNorm = r / 255
          const gNorm = g / 255
          const bNorm = b / 255
          
          const l = 0.4122214708 * rNorm + 0.5363325363 * gNorm + 0.0514459929 * bNorm
          const m = 0.2119034982 * rNorm + 0.6806995451 * gNorm + 0.1073969566 * bNorm
          const s = 0.0883024619 * rNorm + 0.2817188376 * gNorm + 0.6299787005 * bNorm
          
          const lCube = Math.cbrt(l)
          const mCube = Math.cbrt(m)
          const sCube = Math.cbrt(s)
          
          const lStar = 0.2104542553 * lCube + 0.7936177850 * mCube - 0.0040720468 * sCube
          const a = 1.9779984951 * lCube - 2.4285922050 * mCube + 0.4505937099 * sCube
          const bVal = 0.0259040371 * lCube + 0.7827717662 * mCube - 0.8086757660 * sCube
          
          const chroma = Math.sqrt(a * a + bVal * bVal)
          const hue = Math.atan2(bVal, a) * (180 / Math.PI)
          
          const lightness = Math.max(0.3, Math.min(0.8, lStar))
          const chromaAdjusted = Math.max(0.05, Math.min(0.25, chroma))
          const hueNormalized = hue < 0 ? hue + 360 : hue
          
          return `oklch(${lightness.toFixed(3)} ${chromaAdjusted.toFixed(3)} ${hueNormalized.toFixed(1)})`
        }
        
        const mostVibrant = sortedColors.reduce((prev, curr) => 
          curr[1].saturation > prev[1].saturation ? curr : prev
        )
        
        const darkest = sortedColors.reduce((prev, curr) => 
          curr[1].brightness < prev[1].brightness ? curr : prev
        )
        
        const brightest = sortedColors.filter(c => c[1].saturation > 0.3)
          .reduce((prev, curr) => 
            curr[1].brightness > prev[1].brightness ? curr : prev
          , sortedColors[0])
        
        const primary = rgbToOklch(mostVibrant[1].r, mostVibrant[1].g, mostVibrant[1].b)
        const secondary = rgbToOklch(darkest[1].r, darkest[1].g, darkest[1].b)
        const accent = rgbToOklch(brightest[1].r, brightest[1].g, brightest[1].b)
        const vibrant = rgbToOklch(
          sortedColors[Math.min(1, sortedColors.length - 1)][1].r,
          sortedColors[Math.min(1, sortedColors.length - 1)][1].g,
          sortedColors[Math.min(1, sortedColors.length - 1)][1].b
        )
        
        resolve({
          primary,
          secondary,
          accent,
          vibrant
        })
      } catch (error) {
        reject(error)
      }
    }
    
    img.onerror = () => {
      reject(new Error('Failed to load image'))
    }
    
    img.src = imageUrl
  })
}
