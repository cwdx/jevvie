// Post-processing on a 2D canvas, so the one WebGL context is left alone. `wire` is done in the materials.
export type Style = 'toon' | 'wire' | 'ascii' | 'dither' | 'halftone' | 'sketch' | 'glitch' | 'echo'
export const STYLES: readonly Style[] = ['toon', 'wire', 'ascii', 'dither', 'halftone', 'sketch', 'glitch', 'echo']

export type StyleColors = { body: string; ink: string }
export type Stylist = {
  /** Larger than the frame where the style draws glyphs or dots into each pixel block. */
  width: number
  height: number
  /** Always redraw (the glitch flickers even at rest). */
  restless: boolean
  draw: (frame: CanvasRenderingContext2D, t: number) => void
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
const RAMP = ' .:-=+*#%@'
const rgb = (hex: string): [number, number, number] => { const n = Number.parseInt(hex.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
const lum = (d: Uint8ClampedArray, i: number) => (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / 255

/** Size `out`'s canvas by the result's width and height. */
export function stylist(style: Style, out: CanvasRenderingContext2D, w: number, h: number, colors: StyleColors): Stylist {
  const body = rgb(colors.body), ink = rgb(colors.ink)
  const plain = (restless = false): Stylist => ({ width: w, height: h, restless, draw: (f) => { out.clearRect(0, 0, w, h); out.drawImage(f.canvas, 0, 0) } })
  const pixels = (fn: (d: Uint8ClampedArray, o: Uint8ClampedArray, x: number, y: number, i: number) => void, restless = false): Stylist => ({
    width: w, height: h, restless,
    draw: (f) => {
      const src = f.getImageData(0, 0, w, h), dst = out.createImageData(w, h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fn(src.data, dst.data, x, y, (y * w + x) * 4)
      out.clearRect(0, 0, w, h)
      out.putImageData(dst, 0, 0)
    },
  })
  const put = (o: Uint8ClampedArray, i: number, c: [number, number, number], a = 255) => { o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = a }
  const S = 4
  switch (style) {
    case 'dither': return pixels((d, o, x, y, i) => { if (d[i + 3]! > 40) put(o, i, lum(d, i) > BAYER[(y % 4) * 4 + (x % 4)]! ? body : ink) })
    case 'sketch': return pixels((d, o, x, y, i) => {
      if (d[i + 3]! < 40) return
      const at = (dx: number, dy: number) => { const xx = x + dx, yy = y + dy; return xx < 0 || yy < 0 || xx >= w || yy >= h ? -1 : (yy * w + xx) * 4 }
      const edge = [at(1, 0), at(-1, 0), at(0, 1), at(0, -1)].some((j) => j < 0 || d[j + 3]! < 40 || Math.abs(lum(d, j) - lum(d, i)) > 0.28)
      if (edge) put(o, i, ink)
    })
    case 'glitch': return {
      ...plain(true),
      draw: (f, t) => {
        out.clearRect(0, 0, w, h)
        const burst = Math.sin(t / 97) > 0.93 || Math.sin(t / 211) > 0.97
        if (!burst) { out.drawImage(f.canvas, 0, 0); return }
        for (let y = 0; y < h; y += 3) out.drawImage(f.canvas, 0, y, w, 3, (Math.random() - 0.5) * 6, y, w, 3)
        out.globalCompositeOperation = 'lighter'; out.globalAlpha = 0.35
        out.drawImage(f.canvas, 2, 0)
        out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1
      },
    }
    case 'echo': return {
      ...plain(),
      draw: (f) => {
        out.globalCompositeOperation = 'destination-out'; out.globalAlpha = 0.28
        out.fillRect(0, 0, w, h)
        out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1
        out.drawImage(f.canvas, 0, 0)
      },
    }
    case 'ascii':
    case 'halftone': {
      const block = style === 'ascii' ? 3 : 2, cell = block * S
      const font = `${cell}px ${getComputedStyle(out.canvas).fontFamily}`
      return {
        width: w * S, height: h * S, restless: false,
        draw: (f) => {
          const d = f.getImageData(0, 0, w, h).data
          out.clearRect(0, 0, w * S, h * S)
          out.font = font
          out.textBaseline = 'top'
          for (let y = 0; y < h; y += block) for (let x = 0; x < w; x += block) {
            const i = ((y + (block >> 1)) * w + x + (block >> 1)) * 4
            if (d[i + 3]! < 60) continue
            const l = lum(d, i)
            out.fillStyle = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`
            if (style === 'ascii') { out.fillText(RAMP[Math.max(1, Math.round(l * (RAMP.length - 1)))]!, x * S, y * S); continue }
            out.beginPath(); out.arc(x * S + cell / 2, y * S + cell / 2, (cell / 2) * Math.sqrt(1 - l * 0.55), 0, Math.PI * 2); out.fill()
          }
        },
      }
    }
    default: return plain()
  }
}
