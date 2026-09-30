import * as THREE from 'three/webgpu'
import { stylist, type Style } from './styles'

// WebGL2 (forceWebGL): it leaves the WebGPU device to other work on the page, such as the trail, and a lost WebGPU
// device would throw where nothing can catch it. Rendered at a low resolution that CSS scales up with hard pixels.
export type Mood = 'idle' | 'happy' | 'think' | 'sulk' | 'sleep' | 'surprised' | 'confused' | 'love'
export type Trick = 'spin' | 'jump' | 'wave' | 'look' | 'stretch' | 'tap'
export const TRICKS: readonly Trick[] = ['spin', 'jump', 'wave', 'look', 'stretch', 'tap']
const TRICK_MS: Record<Trick, number> = { spin: 700, jump: 600, wave: 900, look: 1600, stretch: 900, tap: 1000 }
export type JevvieView = {
  /** Where the pointer is, relative to the character's centre, in CSS pixels. */
  look: (dx: number, dy: number) => void
  mood: (m: Mood) => void
  trick: (t: Trick) => void
  /** A squash and a stretch: landing, being dropped or poked. */
  squash: (amount?: number) => void
  dispose: () => void
}

export type Shape = 'bar' | 'block' | 'blob' | 'bubble' | 'page' | 'clip' | 'emoji' | Variant | ChessPiece | SpaceBody
export type Variant = 'chamfer' | 'capsule' | 'gumdrop' | 'sticky' | 'paperclip'
export const VARIANTS: readonly Variant[] = ['chamfer', 'capsule', 'gumdrop', 'sticky', 'paperclip']
export type ChessPiece = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'
export const CHESS_SET: readonly ChessPiece[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
export type SpaceBody = 'planet' | 'moon' | 'star' | 'rocket' | 'lander' | 'astronaut'
export const SPACE: readonly SpaceBody[] = ['planet', 'moon', 'star', 'rocket', 'lander', 'astronaut']
export const SHAPES: readonly Shape[] = ['bar', 'block', 'blob', 'bubble', 'page', 'clip', 'emoji', ...VARIANTS, ...CHESS_SET, ...SPACE]
export type Wear = 'none' | 'clip' | 'pencil' | 'pin' | 'flag' | 'antennas'

const W = 64, H = 44
/** One render pixel in scene units: the camera shows 3.5 units across W. */
const PX = 3.5 / W

/** `eyes` is also paper; `ink` the pupils, mouth and feet; `ground` the colour its light bounces from. */
export type CharacterColors = { body: string; light: string; eyes: string; ink: string; blush: string; ground: string; rule?: string; metal?: string; wood?: string; pin?: string; visor?: string }

// One renderer for all: browsers cap WebGL contexts (phones at a handful) and drop the oldest.
let shared: Promise<THREE.WebGPURenderer> | undefined, users = 0
function sharedRenderer() {
  shared ??= (async () => {
    const r = new THREE.WebGPURenderer({ antialias: false, alpha: true, forceWebGL: true })
    r.setPixelRatio(1)
    r.setSize(W, H, false)
    await r.init()
    return r
  })()
  return shared
}

export async function mountCharacter(canvas: HTMLCanvasElement, { colors, reduced = false, shape = 'bar', wear = 'none', style = 'toon' }: { colors: CharacterColors; reduced?: boolean; shape?: Shape; wear?: Wear; style?: Style }): Promise<JevvieView> {
  const renderer = await sharedRenderer()
  users++
  const frame = Object.assign(document.createElement('canvas'), { width: W, height: H }).getContext('2d', { willReadFrequently: true })!
  const draws = stylist(style, canvas.getContext('2d')!, W, H, { body: colors.body, ink: colors.ink })
  canvas.width = draws.width
  canvas.height = draws.height

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1.75, 1.75, 1.2, -1.2, 0.1, 20)
  camera.position.set(0.8, 0.9, 6)
  camera.lookAt(0, 0, 0)
  scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(colors.ground), 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(2.5, 4, 3)
  scene.add(sun)

  // three flat tones, no gradient: the pixel-art shading
  const tones = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1)
  tones.minFilter = tones.magFilter = THREE.NearestFilter
  tones.needsUpdate = true
  const toon = (c: string) => new THREE.MeshToonMaterial({ color: new THREE.Color(c), gradientMap: tones })
  const flat = (c: string, opacity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), transparent: opacity < 1, opacity })
  const skin = toon(colors.body), light = flat(colors.light), white = flat(colors.eyes), ink = flat(colors.ink), blush = flat(colors.blush)
  const shade = flat(colors.ink, 0.22)
  const paper = toon(colors.eyes), rule = flat(colors.rule ?? colors.ink), metal = toon(colors.metal ?? colors.ink), wood = toon(colors.wood ?? colors.body), pinHead = toon(colors.pin ?? colors.blush)
  const crater = toon(colors.rule ?? colors.ink), visor = toon(colors.visor ?? colors.ink)
  const materials = [skin, light, white, ink, blush, shade, paper, rule, metal, wood, pinHead, crater, visor]
  if (style === 'wire') for (const m of materials) if (m !== shade) m.wireframe = true
  const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)

  const me = new THREE.Group()
  const add = (m: THREE.Mesh, x = 0, y = 0) => { m.position.set(x, y, m.position.z); me.add(m); return m }
  // few segments, so it stays pixel-crisp
  const lathe = (pts: [number, number][]) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 12), skin)
  const BASE: [number, number][] = [[0, -0.85], [0.6, -0.85], [0.6, -0.72], [0.5, -0.66], [0.44, -0.6], [0.44, -0.54], [0.3, -0.48]]
  const dome = (x: number, y: number, r: number, ry = r): [number, number][] => Array.from({ length: 7 }, (_, i) => { const a = (-60 + i * 25) * Math.PI / 180; return [Math.max(0, x + Math.cos(a) * r), y + Math.sin(a) * ry] as [number, number] })
  const shine = (w: number, y: number) => { const m = box(w, PX * 1.2, PX, light); m.position.z = 0.401; return add(m, -0.05, y - PX) }
  // face: y, z, scale; `profile`: seen side on, an eye each side at `eye`, `z` out from the middle
  type Spec = { y: number; z: number; scale: number; feet: number[]; floor: number; top: number; whites?: boolean; profile?: { eye: [number, number]; mouth: [number, number]; z: number } }
  const bodies: Record<Shape, () => Spec> = {
    bar: () => { add(box(2.3, 0.95, 0.8, skin)); shine(2.0, 0.47); return { y: 0, z: 0.41, scale: 1, feet: [-0.7, 0.7], floor: -0.57, top: 0.48 } },
    block: () => { add(box(1.2, 1.7, 0.8, skin), 0, 0.2); shine(1.0, 1.05); return { y: 0.45, z: 0.41, scale: 0.85, feet: [-0.32, 0.32], floor: -0.75, top: 1.05 } },
    pawn: () => {
      add(lathe([...BASE, [0.26, -0.2], [0.42, -0.14], [0.42, -0.08], [0.26, -0.04], ...dome(0, 0.34, 0.48)]))
      return { y: 0.34, z: 0.46, scale: 0.62, feet: [], floor: -0.85, top: 0.82 }
    },
    bishop: () => {
      add(lathe([...BASE, [0.26, -0.2], [0.42, -0.14], [0.42, -0.08], [0.26, -0.04], ...dome(0, 0.26, 0.44, 0.62)]))
      add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skin), 0, 0.94)
      const slit = box(0.06, 0.3, 0.3, ink); slit.rotation.z = -0.6; slit.position.z = 0.2; add(slit, 0.16, 0.62)
      return { y: 0.22, z: 0.42, scale: 0.55, feet: [], floor: -0.85, top: 1.02 }
    },
    rook: () => {
      add(lathe([...BASE, [0.5, -0.4], [0.44, -0.3], [0.4, 0.4], [0.52, 0.45], [0.52, 0.55], [0, 0.55]]))
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; const c = box(0.2, 0.2, 0.2, skin); c.rotation.y = -a; c.position.z = Math.cos(a) * 0.42; add(c, Math.sin(a) * 0.42, 0.64) }
      return { y: 0.02, z: 0.42, scale: 0.62, feet: [], floor: -0.85, top: 0.74 }
    },
    queen: () => {
      add(lathe([...BASE, [0.26, -0.2], [0.42, -0.14], [0.42, -0.08], [0.3, -0.04], [0.54, 0.56], [0.44, 0.62], [0, 0.64]]))
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), skin); b.position.z = Math.cos(a) * 0.48; add(b, Math.sin(a) * 0.48, 0.66) }
      add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), skin), 0, 0.78)
      return { y: 0.24, z: 0.46, scale: 0.55, feet: [], floor: -0.85, top: 0.9 }
    },
    king: () => {
      add(lathe([...BASE, [0.26, -0.2], [0.42, -0.14], [0.42, -0.08], [0.3, -0.04], [0.54, 0.56], [0.4, 0.64], [0, 0.66]]))
      add(box(0.12, 0.4, 0.12, skin), 0, 0.84); add(box(0.34, 0.11, 0.12, skin), 0, 0.88)
      return { y: 0.24, z: 0.46, scale: 0.55, feet: [], floor: -0.85, top: 1.04 }
    },
    knight: () => {
      add(lathe([...BASE, [0.42, -0.45], [0, -0.45]]))
      // neck, head and muzzle, two ears, an ink mane
      add(box(0.66, 0.7, 0.56, skin), -0.06, -0.12)
      add(box(0.8, 0.56, 0.56, skin), 0.12, 0.34); add(box(0.34, 0.34, 0.5, skin), 0.62, 0.24)
      add(box(0.14, 0.22, 0.14, skin), -0.16, 0.7); add(box(0.14, 0.22, 0.14, skin), 0.08, 0.7)
      add(box(0.1, 0.9, 0.58, ink), -0.44, 0.14)
      for (const z of [0.26, -0.26]) { const nostril = box(0.07, 0.07, 0.02, ink); nostril.position.z = z; add(nostril, 0.72, 0.33) }
      return { y: 0, z: 0, scale: 0.5, feet: [], floor: -0.85, top: 0.8, profile: { eye: [0.04, 0.44], mouth: [0.64, 0.14], z: 0.29 } }
    },
    blob: () => {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), skin), 0, 0.05).scale.set(1.35, 0.9, 0.9)
      return { y: 0.12, z: 0.9, scale: 0.9, feet: [-0.55, 0.55], floor: -0.78, top: 0.85 }
    },
    // a round face, like an emoji
    emoji: () => {
      const coin = add(new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.36, 14), skin), 0, 0.05); coin.rotation.x = Math.PI / 2
      shine(0.7, 0.8).position.z = 0.19
      return { y: 0.12, z: 0.19, scale: 0.85, feet: [-0.36, 0.36], floor: -0.77, top: 0.87 }
    },
    bubble: () => {
      add(box(2.1, 1.25, 0.7, skin), 0, 0.2); shine(1.8, 0.82)
      // the tail, a pixel staircase
      add(box(0.36, 0.2, 0.7, skin), -0.62, -0.5); add(box(0.2, 0.2, 0.7, skin), -0.74, -0.68)
      return { y: 0.3, z: 0.36, scale: 1, feet: [], floor: -0.8, top: 0.83 }
    },
    page: () => {
      // ruled lines, the margin rule and its punch holes
      add(box(1.5, 1.5, 0.06, paper), 0, 0.1)
      for (let i = 0; i < 5; i++) { const l = box(1.4, PX * 0.8, 0.02, rule); l.position.z = 0.04; add(l, 0.02, -0.46 + i * 0.28) }
      const margin = box(PX, 1.5, 0.02, skin); margin.position.z = 0.045; add(margin, -0.42, 0.1)
      for (const y of [-0.35, 0.1, 0.55]) { const h = box(0.12, 0.12, 0.02, skin); h.position.z = 0.05; add(h, -0.6, y) }
      return { y: 0.25, z: 0.06, scale: 0.75, feet: [-0.3, 0.4], floor: -0.72, top: 0.85, whites: false }
    },
    clip: () => {
      // a binder clip
      add(box(1.9, 1.0, 0.7, metal), 0, 0)
      const handle = (x: number) => { const g = box(0.08, 0.7, 0.08, ink); g.position.z = -0.15; add(g, x, 0.75); const t = box(0.5, 0.08, 0.08, ink); t.position.z = -0.15; add(t, x + (x < 0 ? 0.21 : -0.21), 1.08) }
      handle(-0.55); handle(0.55)
      return { y: 0, z: 0.36, scale: 0.95, feet: [-0.55, 0.55], floor: -0.6, top: 0.5 }
    },
    chamfer: () => {
      const face = new THREE.Shape(); face.moveTo(-1.07, -0.395); face.lineTo(1.07, -0.395); face.lineTo(1.07, 0.395); face.lineTo(-1.07, 0.395)
      add(new THREE.Mesh(new THREE.ExtrudeGeometry(face, { depth: 0.64, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 }), skin)).position.z = -0.32
      return { y: 0, z: 0.42, scale: 1, feet: [-0.7, 0.7], floor: -0.57, top: 0.48 }
    },
    capsule: () => {
      const bar = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.36, 3, 10), skin)); bar.rotation.z = Math.PI / 2; bar.scale.set(1, 1, 0.85)
      return { y: 0, z: 0.4, scale: 0.95, feet: [-0.66, 0.66], floor: -0.56, top: 0.46 }
    },
    gumdrop: () => {
      add(lathe([[0, -0.6], [0.8, -0.6], [0.86, -0.46], [0.82, -0.1], [0.64, 0.28], [0.34, 0.54], [0, 0.62]]))
      return { y: -0.02, z: 0.8, scale: 0.8, feet: [-0.46, 0.46], floor: -0.7, top: 0.62 }
    },
    sticky: () => {
      // its bottom corner curling up
      add(box(1.5, 1.5, 0.04, skin), 0, 0.1).rotation.z = 0.04
      const curl = new THREE.Shape(); curl.moveTo(0.75, -0.25); curl.lineTo(0.25, -0.65); curl.lineTo(0.75, -0.65)
      add(new THREE.Mesh(new THREE.ShapeGeometry(curl), light)).position.z = 0.03
      return { y: 0.22, z: 0.03, scale: 0.72, feet: [-0.3, 0.3], floor: -0.72, top: 0.85 }
    },
    paperclip: () => {
      const wire = new THREE.Path()
      wire.moveTo(-0.12, -0.3); wire.lineTo(-0.12, 0.42); wire.absarc(0.02, 0.42, 0.14, Math.PI, 0, true); wire.lineTo(0.16, -0.56)
      wire.absarc(-0.08, -0.56, 0.24, 0, Math.PI, true); wire.lineTo(-0.32, 0.62); wire.absarc(0.02, 0.62, 0.34, Math.PI, 0, true); wire.lineTo(0.36, -0.42)
      const path = new THREE.CatmullRomCurve3(wire.getPoints(6).map((v) => new THREE.Vector3(v.x, v.y, 0)))
      add(new THREE.Mesh(new THREE.TubeGeometry(path, 48, 0.05, 4), metal), 0, -0.05).scale.setScalar(1.1)
      // eyebrows
      for (const x of [-0.36, 0.36]) { const brow = box(0.3, 0.07, 0.04, ink); brow.rotation.z = x < 0 ? 0.25 : -0.25; brow.position.z = 0.14; add(brow, x, 0.86) }
      return { y: 0.52, z: 0.12, scale: 0.78, feet: [], floor: -0.95, top: 1.0 }
    },
    planet: () => {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8), skin), 0, 0.02)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.07, 3, 20), paper); ring.rotation.set(Math.PI / 2 - 0.22, 0, 0.14); add(ring, 0, -0.22)
      return { y: 0.24, z: 0.66, scale: 0.62, feet: [], floor: -0.82, top: 0.74 }
    },
    moon: () => {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.78, 12, 8), paper), 0, 0)
      // craters
      for (const [x, y, r] of [[-0.5, 0.42, 0.14], [0.52, -0.3, 0.18], [-0.3, -0.5, 0.1], [0.36, 0.5, 0.09]] as const) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 8), crater); c.rotation.x = Math.PI / 2; c.lookAt(x * 3, y * 3, 3); c.rotateX(Math.PI / 2); c.position.z = Math.sqrt(Math.max(0, 0.6 - x * x - y * y)); add(c, x, y) }
      return { y: 0.08, z: 0.8, scale: 0.72, feet: [-0.35, 0.35], floor: -0.84, top: 0.78, whites: false }
    },
    star: () => {
      const outline = new THREE.Shape()
      for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.44 : 1.02; outline[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r) }
      const star = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.4, bevelEnabled: false }), skin); star.position.z = -0.2; add(star, 0, 0.02)
      return { y: 0.02, z: 0.22, scale: 0.55, feet: [-0.42, 0.42], floor: -0.9, top: 1.04 }
    },
    rocket: () => {
      // a Saturn V
      add(lathe([[0, -0.62], [0.5, -0.62], [0.5, 0.38], [0.38, 0.52], [0.38, 0.64], [0.14, 0.9], [0.03, 1.08], [0, 1.08]])).material = paper
      for (const y of [-0.42, 0.44]) add(lathe([[0.51, y - 0.05], [0.51, y + 0.05], [0, y + 0.05]])).material = ink
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { const f = box(0.08, 0.36, 0.3, pinHead); f.rotation.y = a; f.position.z = Math.cos(a) * 0.54; add(f, Math.sin(a) * 0.54, -0.5) }
      add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 6), skin), 0, -0.78).rotation.x = Math.PI
      return { y: 0.02, z: 0.5, scale: 0.5, feet: [], floor: -0.9, top: 1.08, whites: false }
    },
    lander: () => {
      // Apollo's lunar module
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 8), skin), 0, -0.22)
      add(box(0.9, 0.52, 0.66, metal), 0, 0.28)
      add(box(0.24, 0.1, 0.24, ink), 0, 0.6)
      for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
        const leg = box(0.06, 0.62, 0.06, metal); leg.rotation.set(z * -0.5, 0, x * 0.5); leg.position.z = z * 0.42; add(leg, x * 0.6, -0.5)
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8), metal); pad.position.z = z * 0.55; add(pad, x * 0.76, -0.78)
      }
      return { y: 0.3, z: 0.34, scale: 0.42, feet: [], floor: -0.8, top: 0.66 }
    },
    astronaut: () => {
      add(box(0.9, 0.7, 0.6, paper), 0, -0.34); add(box(0.7, 0.6, 0.3, paper), 0, -0.2).position.z = -0.4
      add(new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 8), paper), 0, 0.38)
      add(new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 8), visor), 0, 0.36).scale.set(1.05, 0.72, 0.62)
      me.children.at(-1)!.position.z = 0.38
      add(box(0.26, 0.26, 0.04, pinHead), 0.28, -0.26).position.z = 0.31
      return { y: 0.38, z: 0.68, scale: 0.4, feet: [-0.26, 0.26], floor: -0.74, top: 0.96 }
    },
  }
  const body = bodies[shape]()
  const face = new THREE.Group()
  face.position.set(0, body.y, body.z)
  face.scale.setScalar(body.scale)
  me.add(face)
  const eyes = [-0.46, 0.46].map((x) => {
    const eye = new THREE.Group()
    // corners cut, so it reads round at this size
    if (body.whites !== false) eye.add(box(0.46, 0.44, 0.02, white), box(0.34, 0.56, 0.02, white))
    const pupil = new THREE.Group()
    pupil.add(box(0.2, 0.28, 0.02, ink))
    const sparkle = box(PX * 1.1, PX * 1.1, 0.02, white)
    sparkle.position.set(-0.04, 0.07, 0.01)
    pupil.add(sparkle)
    pupil.position.z = 0.015
    eye.add(pupil)
    eye.position.set(x, 0.09, 0)
    face.add(eye)
    return { eye, pupil }
  })
  const mouthAt = (...parts: [number, number, number, number][]) => {
    const g = new THREE.Group()
    for (const [x, y, w, h] of parts) { const p = box(w, h, 0.02, ink); p.position.set(x, y, 0); g.add(p) }
    g.position.set(0, -0.27, 0.01)
    face.add(g)
    return g
  }
  const mouths = {
    smile: mouthAt([0, -0.02, 0.2, PX], [-0.12, 0.01, PX, PX], [0.12, 0.01, PX, PX]),
    grin: mouthAt([0, -0.04, 0.24, PX], [-0.15, 0, PX, PX * 1.6], [0.15, 0, PX, PX * 1.6]),
    open: mouthAt([0, -0.02, 0.12, 0.12]),
    flat: mouthAt([0.03, 0, 0.18, PX]),
    wonky: mouthAt([-0.06, 0.01, 0.1, PX], [0.06, -0.02, 0.1, PX]),
    frown: mouthAt([0, 0.01, 0.2, PX], [-0.12, -0.02, PX, PX], [0.12, -0.02, PX, PX]),
  }
  const MOUTH: Record<Mood, keyof typeof mouths | undefined> = {
    idle: 'smile', happy: 'grin', love: 'grin', think: 'flat', confused: 'wonky', surprised: 'open', sulk: 'frown', sleep: undefined,
  }
  const cheeks = [-0.82, 0.82].map((x) => { const c = box(0.2, PX * 1.4, 0.02, blush); c.position.set(x, -0.16, 0.01); face.add(c); return c })
  if (body.profile) {
    const { eye, mouth, z } = body.profile, s = body.scale
    eyes.forEach(({ eye: e }, i) => { e.position.set(eye[0] / s, eye[1] / s, (i ? -z : z) / s); e.rotation.y = i ? Math.PI : 0 })
    cheeks.forEach((c, i) => { c.position.set(eye[0] / s, (eye[1] - 0.14) / s, (i ? -z - 0.01 : z + 0.01) / s); c.rotation.y = i ? Math.PI : 0 })
    for (const m of Object.values(mouths)) m.position.set(mouth[0] / s, mouth[1] / s, z / s)
  }
  const feet = body.feet.map((x) => { const f = box(0.36, 0.16, 0.5, ink); f.position.set(x, body.floor, 0); me.add(f); return f })
  const onTop = (m: THREE.Mesh, x: number, y: number, z = 0, rz = 0) => { m.position.set(x, body.top + y, z); m.rotation.z = rz; me.add(m) }
  if (wear === 'clip') {
    onTop(box(0.5, 0.26, 0.5, ink), 0.35, 0.1)
    onTop(box(0.06, 0.3, 0.06, metal), 0.22, 0.34); onTop(box(0.06, 0.3, 0.06, metal), 0.48, 0.34)
  } else if (wear === 'pencil') {
    onTop(box(1.3, 0.14, 0.14, wood), 0.05, 0.12, 0.1, 0.18)
    onTop(box(0.18, 0.14, 0.14, ink), 0.74, 0.24, 0.1, 0.18)
    onTop(box(0.16, 0.16, 0.16, pinHead), -0.64, -0.01, 0.1, 0.18)
  } else if (wear === 'pin') {
    onTop(box(0.05, 0.3, 0.05, metal), -0.4, 0.12)
    onTop(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), pinHead), -0.4, 0.34)
  } else if (wear === 'flag') {
    // Apollo 11's, held out by a crossbar
    onTop(box(0.05, 0.9, 0.05, metal), -0.45, 0.45)
    onTop(box(0.56, 0.36, 0.02, paper), -0.17, 0.72)
    for (const y of [0.62, 0.78]) onTop(box(0.56, 0.06, 0.03, pinHead), -0.17, y)
  } else if (wear === 'antennas') {
    // Sputnik's
    for (const [x, z] of [[-0.25, 0.1], [0.25, 0.1], [-0.2, -0.15], [0.2, -0.15]] as const) onTop(box(0.03, 0.8, 0.03, metal), x, 0.36, z, x < 0 ? 0.5 : -0.5)
  }
  scene.add(me)
  // the shadow, which shrinks as it jumps
  const size = new THREE.Box3().setFromObject(me), [sw, sd] = [size.max.x - size.min.x + 0.2, Math.min(0.9, size.max.z - size.min.z + 0.1)]
  const ground = box(1, 0.01, 1, shade)
  ground.position.set((size.max.x + size.min.x) / 2, body.floor - 0.11, 0)
  scene.add(ground)

  let mood: Mood = 'idle', lookX = 0, lookY = 0, squashV = 0, squashT = 0, squashA = 1
  let trick: Trick | undefined, trickT = 0
  let nextBlink = performance.now() + 2500, blinking = 0, dirty = true, spun = 0, prev = 0
  const squash = (amount: number, t = performance.now()) => { if (reduced) return; squashT = t; squashA = amount; dirty = true }

  const draw = (t: number) => {
    const s = t / 1000
    // easing per frame, scaled to the frame's length, so a 120Hz screen turns no faster than a 60Hz one
    const dt = prev ? Math.min(100, t - prev) : 16.7
    prev = t
    const follow = (k: number) => (reduced ? 1 : 1 - (1 - k) ** (dt / 16.7))
    const asleep = mood === 'sleep'
    // the trick's progress, 0–1
    const k = trick ? Math.min(1, (t - trickT) / TRICK_MS[trick]) : 0
    if (trick && k >= 1) { if (trick === 'jump') squash(0.6, t); trick = undefined }
    const arc = Math.sin(k * Math.PI)
    const spin = trick === 'spin' ? k * k * (3 - 2 * k) * Math.PI * 2 : 0
    const hop = trick === 'jump' ? arc * 0.7 : 0
    const sway = trick === 'wave' ? Math.sin(k * Math.PI * 6) * 0.22 * arc : 0
    const glance = trick === 'look' ? Math.sin(k * Math.PI * 2) * 0.9 : 0
    const reach = trick === 'stretch' ? arc * 0.3 : 0
    const breathe = reduced ? 0 : Math.sin(s * (asleep ? 1.2 : 2.4)) * (asleep ? 0.05 : 0.025)
    const bounce = mood === 'happy' && !reduced ? Math.abs(Math.sin(s * 9)) * 0.22 : 0
    const turn = (mood === 'sulk' ? Math.PI * 0.85 : mood === 'think' ? Math.sin(s * 3) * 0.12 : lookX * 0.35) + glance
    me.rotation.y += (turn - me.rotation.y) * follow(glance ? 0.4 : 0.18)
    me.rotation.y += spin ? spin - spun : 0
    spun = spin
    const tilt = mood === 'confused' ? 0.18 + Math.sin(s * 2) * 0.03 : mood === 'love' ? Math.sin(s * 2.5) * 0.08 : mood === 'think' ? Math.sin(s * 5) * 0.04 : 0
    me.rotation.z = (reduced ? 0 : tilt) + sway
    // a damped spring
    if (squashT) { const k = (t - squashT) / 1000; squashV = Math.exp(-k * 7) * Math.cos(k * 22) * 0.35 * squashA; if (k > 1.2) { squashT = 0; squashV = 0 } }
    me.scale.set(1 - squashV * 0.6 - reach * 0.4, 1 + breathe + squashV + reach, 1)
    me.position.y = bounce + hop - (asleep ? 0.12 : 0)
    if (feet[1]) feet[1].position.y = body.floor + (trick === 'tap' ? Math.abs(Math.sin(k * Math.PI * 4)) * 0.18 : 0)
    const up = Math.max(0, me.position.y)
    ground.scale.set(sw * (1 - up * 0.5), 1, sd * (1 - up * 0.5))
    if (t > nextBlink) { blinking = t; nextBlink = t + 2500 + Math.random() * 4000 }
    const blink = blinking && t - blinking < 130 ? 0.12 : 1
    eyes.forEach(({ eye, pupil }, i) => {
      const open = mood === 'surprised' ? 1.25 : mood === 'love' ? 0.3 : mood === 'confused' && i === 0 ? 0.6 : 1
      eye.scale.set(mood === 'surprised' ? 1.12 : 1, asleep ? 0.1 : blink * open, 1)
      pupil.scale.setScalar(mood === 'surprised' ? 0.7 : 1)
      const lx = mood === 'confused' ? (i ? 0.1 : -0.1) : glance ? -glance * 0.12 : lookX * 0.12
      pupil.position.x = mood === 'think' ? 0.1 : Math.max(-0.12, Math.min(0.12, lx))
      pupil.position.y = mood === 'think' || mood === 'surprised' ? 0.1 : mood === 'love' ? -0.08 : Math.max(-0.1, Math.min(0.1, -lookY * 0.1))
    })
    for (const [name, m] of Object.entries(mouths)) m.visible = MOUTH[mood] === name
    for (const c of cheeks) c.visible = mood === 'happy' || mood === 'love'
    renderer.render(scene, camera)
    frame.clearRect(0, 0, W, H)
    frame.drawImage(renderer.domElement, 0, 0)
    draws.draw(frame, t)
  }

  // render only while something moves, otherwise a few frames a second
  let last = 0, raf = 0
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop)
    const busy = dirty || draws.restless || squashT || trick || (mood !== 'idle' && mood !== 'sulk' && mood !== 'sleep') || Math.abs(me.rotation.y - (mood === 'sulk' ? Math.PI * 0.85 : lookX * 0.35)) > 0.01 || (blinking && t - blinking < 160)
    if (!busy && t - last < (reduced ? 1000 : 120)) return
    last = t; dirty = false
    draw(reduced ? 0 : t)
  }
  raf = requestAnimationFrame(loop)

  return {
    look: (dx, dy) => { const n = Math.hypot(dx, dy) || 1, k = Math.min(1, n / 400); lookX = (dx / n) * k; lookY = (dy / n) * k; dirty = true },
    mood: (m) => { mood = m; dirty = true },
    trick: (t) => { if (reduced) return; trick = t; trickT = performance.now(); dirty = true },
    squash: (amount = 1) => squash(amount),
    dispose: () => {
      cancelAnimationFrame(raf)
      scene.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
      for (const m of materials) m.dispose()
      tones.dispose()
      if (--users === 0) { renderer.dispose(); shared = undefined }
    },
  }
}
