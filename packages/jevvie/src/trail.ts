import { draw, frame, init, storage, surface } from 'vgpu'

export type Trail = { add: (x: number, y: number) => void; dispose: () => void }

const MAX = 128, LIFE = 900, RADIUS = 14, PIXEL = 2

export async function mountTrail(canvas: HTMLCanvasElement, color: readonly [number, number, number]): Promise<Trail | null> {
  if (!('gpu' in navigator)) return null
  const gpu = await init().catch(() => null)
  if (!gpu) return null
  const view = surface(gpu, canvas, { dpr: [1, 2], clearColor: [0, 0, 0, 0] })
  const buffer = storage(gpu, MAX * 16, 'read')
  const data = new Float32Array(MAX * 4)
  const dots = draw(gpu, { shader: SHADER, entry: { vertex: 'dot_vs', fragment: 'dot_fs' }, vertices: 6, blend: 'alpha', label: 'jevvie trail', set: { dots: buffer } })
  const points: { x: number; y: number; t: number }[] = []
  let raf = 0

  const tick = () => {
    const now = performance.now()
    while (points.length && now - points[0]!.t > LIFE) points.shift()
    points.forEach((p, i) => { const age = (now - p.t) / LIFE; data.set([p.x, p.y, 0.9 * (1 - age), RADIUS * (1 - age * 0.5)], i * 4) })
    if (points.length) buffer.write(data.subarray(0, points.length * 4))
    dots.set({ params: { resolution: [canvas.clientWidth, canvas.clientHeight, view.dpr, PIXEL], color: [...color, 1] } })
    frame(gpu, (f) => f.pass(view, (pass) => { if (points.length) pass.draw(dots, { instances: points.length }) }))
    raf = points.length ? requestAnimationFrame(tick) : 0
  }

  return {
    add(x, y) {
      points.push({ x, y, t: performance.now() })
      if (points.length > MAX) points.shift()
      if (!raf) raf = requestAnimationFrame(tick)
    },
    dispose() { cancelAnimationFrame(raf); view.dispose(); gpu.dispose() },
  }
}

const SHADER = /* wgsl */ `
struct Params {
  resolution: vec4f, // width, height (CSS px), device pixel ratio, dither cell (CSS px)
  color: vec4f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> dots: array<vec4f>;

struct V {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) strength: f32,
}

@vertex fn dot_vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> V {
  var corners = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let d = dots[ii];
  let corner = corners[vi];
  let css = d.xy + corner * d.w;
  var o: V;
  o.pos = vec4f(css.x / params.resolution.x * 2.0 - 1.0, 1.0 - css.y / params.resolution.y * 2.0, 0.0, 1.0);
  o.local = corner;
  o.strength = d.z;
  return o;
}

fn bayer(p: vec2u) -> f32 {
  var m = array<f32, 16>(0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (m[(p.y % 4u) * 4u + (p.x % 4u)] + 0.5) / 16.0;
}

@fragment fn dot_fs(v: V) -> @location(0) vec4f {
  let r = length(v.local);
  if (r > 1.0) { discard; }
  let level = v.strength * (1.0 - r * r);
  let cell = vec2u(floor(v.pos.xy / (params.resolution.z * params.resolution.w)));
  if (level <= bayer(cell)) { discard; }
  return params.color;
}
`
