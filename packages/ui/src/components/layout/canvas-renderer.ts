type Glow = {
	glowOn: boolean;
	glowColors: string[];
	glowOpacity: number;
	glowScale: number;
	glowNoiseFreq: number;
	glowNoisePower: number;
	glowNoiseMinAlpha: number;
	glowNoiseIdle: number;
	glowNoiseStrength: number;
	glowNoiseAnim: number;
	glowNoiseActivity: number;
	glowFadeIn: number;
	glowFadeOut: number;
};

type Options = {
	scale: number;
	noise: number;
	edge: number;
	alpha: number;
	color: string;
};

const GLOW_FADE = 0.32;
const EASE_IN = [0.42, 0, 1, 1] as const;
const EASE_OUT = [0, 0, 0.58, 1] as const;

function cubic(t: number, a: number, b: number) {
	let u = 1 - t;
	return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
}

function slope(t: number, a: number, b: number) {
	let u = 1 - t;
	return 3 * u * u * a + 6 * u * t * (b - a) + 3 * t * t * (1 - b);
}

function ease(t: number, p: readonly [number, number, number, number]) {
	let x = Math.min(1, Math.max(0, t));
	let y = x;

	for (let i = 0; i < 5; i++) {
		let dx = cubic(y, p[0], p[2]) - x;
		let d = slope(y, p[0], p[2]);
		if (Math.abs(dx) < 0.0001 || d < 0.0001) break;
		y = Math.min(1, Math.max(0, y - dx / d));
	}

	return cubic(y, p[1], p[3]);
}

/** Parse hex color to normalized [r, g, b] */
function hex(value: string): [number, number, number] {
	let h = value.replace("#", "");
	if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	let n = Number.parseInt(h.slice(0, 6), 16);
	return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/** Shared uniform struct and fullscreen triangle vertex shader */
const COMMON_WGSL = `
struct Uniforms {
	size: vec4<f32>,
	color: vec4<f32>,
	data: vec4<f32>,
	pointer: vec4<f32>,
	glow_rect: vec4<f32>,
	glow_params: vec4<f32>,
	glow_noise_a: vec4<f32>,
	glow_noise_b: vec4<f32>,
	colors: array<vec4<f32>, 8>,
	points: array<vec4<f32>, 8>,
}

@group(0) @binding(0) var<uniform> uni: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
	var pts = array<vec2<f32>, 3>(
		vec2<f32>(-1.0, -1.0),
		vec2<f32>(3.0, -1.0),
		vec2<f32>(-1.0, 3.0),
	);
	return vec4<f32>(pts[i], 0.0, 1.0);
}
`;

/** Feedback shader: decay previous trail + stamp soft motion-gated brush */
const TRAIL_WGSL = COMMON_WGSL + `
@group(0) @binding(1) var prev_s: sampler;
@group(0) @binding(2) var prev_t: texture_2d<f32>;

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
	let uv = pos.xy / uni.size.xy;
	let prev = textureSampleLevel(prev_t, prev_s, uv, 0.0).r * 0.96;

	let mouse = uni.pointer.xy / uni.size.xy;
	let hover = uni.pointer.z;
	let aspect = uni.size.x / uni.size.y;
	let delta = (uv - mouse) * vec2<f32>(aspect, 1.0);
	let d = length(delta);
	let motion = uni.pointer.w;
	let radius = 80.0 / uni.size.y;
	let soft = smoothstep(radius, 0.0, d);
	let brush = soft * soft * soft * hover * motion * 0.4;

	let raw = prev + brush;
	let val = select(clamp(raw, 0.0, 1.0), 0.0, raw < 0.05);
	return vec4<f32>(val, val, val, 1.0);
}
`;

/** Main shader: dither bands with trail-driven flicker, composited with rounded-rect glow */
const MAIN_WGSL = COMMON_WGSL + `
@group(0) @binding(1) var map_s: sampler;
@group(0) @binding(2) var map_t: texture_2d<f32>;

const BAYER = array<f32, 16>(
	0.0625, 0.5625, 0.1875, 0.6875,
	0.8125, 0.3125, 0.9375, 0.4375,
	0.25,   0.75,   0.125,  0.625,
	1.0,    0.5,    0.875,  0.375,
);

fn hash(x: u32, y: u32) -> f32 {
	var h = x * 374761393u + y * 668265263u;
	h = (h ^ (h >> 13u)) * 1274126177u;
	return f32(h ^ (h >> 16u)) / 4294967295.0;
}

fn trail(x: f32, y: f32) -> f32 {
	let uv = vec2<f32>(x / uni.size.x, y / uni.size.y);
	return textureSampleLevel(map_t, map_s, uv, 0.0).r;
}

fn dither(x: f32, y: f32, brightness: f32) -> f32 {
	let cell = uni.data.y;
	let noise = uni.data.z;
	let cx = u32(floor(x / cell));
	let cy = u32(floor(y / cell));
	let idx = ((cy & 3u) << 2u) | (cx & 3u);
	let jitter = select(0.0, noise * (hash(cx, cy) - 0.5), noise > 0.0);
	let threshold = BAYER[idx] + jitter;
	return select(0.0, 1.0, brightness > threshold);
}

fn hash31(p: vec3<f32>) -> f32 {
	var q = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
	q += dot(q, q.yzx + 33.33);
	return fract((q.x + q.y) * q.z);
}

fn value_noise3(p: vec3<f32>) -> f32 {
	let i = floor(p);
	let f = fract(p);
	let u = f * f * (3.0 - 2.0 * f);
	let c000 = hash31(i);
	let c100 = hash31(i + vec3<f32>(1.0, 0.0, 0.0));
	let c010 = hash31(i + vec3<f32>(0.0, 1.0, 0.0));
	let c110 = hash31(i + vec3<f32>(1.0, 1.0, 0.0));
	let c001 = hash31(i + vec3<f32>(0.0, 0.0, 1.0));
	let c101 = hash31(i + vec3<f32>(1.0, 0.0, 1.0));
	let c011 = hash31(i + vec3<f32>(0.0, 1.0, 1.0));
	let c111 = hash31(i + vec3<f32>(1.0, 1.0, 1.0));
	let x00 = mix(c000, c100, u.x);
	let x10 = mix(c010, c110, u.x);
	let x01 = mix(c001, c101, u.x);
	let x11 = mix(c011, c111, u.x);
	let y0 = mix(x00, x10, u.y);
	let y1 = mix(x01, x11, u.y);
	return mix(y0, y1, u.z);
}

fn fractal_noise3(p: vec3<f32>) -> f32 {
	var sum = 0.0;
	var norm = 0.0;
	var amp = 0.5;
	var freq = 1.0;
	for (var i = 0; i < 3; i++) {
		sum += value_noise3(p * freq) * amp;
		norm += amp;
		amp *= 0.5;
		freq *= 2.0;
	}
	return sum / norm;
}

fn sdf_rounded_rect(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
	let q = abs(p) - b + vec2<f32>(r);
	return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0))) - r;
}

fn sample_border_color(pt: vec2<f32>) -> vec3<f32> {
	var total = vec3<f32>(0.0);
	var weight = 0.0;
	let count = u32(uni.glow_params.w);
	let scale = 1.0 / max(uni.glow_rect.z, uni.glow_rect.w);
	let a = pt * scale;
	for (var i: u32 = 0u; i < count; i++) {
		let b = uni.points[i].xy * scale;
		let d = distance(a, b);
		let c = 1.0 / (0.008 + pow(d, 3.6));
		total += uni.colors[i].rgb * c;
		weight += c;
	}
	return total / max(weight, 0.0001);
}

fn glow(pos: vec2<f32>) -> vec4<f32> {
	let size = uni.glow_rect.zw;
	if (size.x < 1.0 || size.y < 1.0) { return vec4<f32>(0.0); }

	let progress = uni.glow_params.z;
	if (progress <= 0.001) { return vec4<f32>(0.0); }

	let center = uni.glow_rect.xy + size * 0.5;
	let half_size = size * 0.5;
	let p = pos - center;
	let corner = uni.glow_params.x;
	let glow_scale = uni.glow_params.y;

	let sdf = sdf_rounded_rect(p, half_size, corner);
	let inside = max(0.0, -sdf);

	let core_width = max(0.25, glow_scale * 0.5);
	let glow_radius = max(1.0, glow_scale * 5.0);

	let core = 1.0 - smoothstep(0.0, core_width, inside);
	let inner = exp(-max(inside - core_width, 0.0) / glow_radius);
	let base = max(core, inner * 0.95);

	let mask = smoothstep(0.5, -0.5, sdf);
	let visible = progress;
	let strength = base * mask * visible;
	if (strength < 0.001) { return vec4<f32>(0.0); }

	let freq = uni.glow_noise_a.x;
	let power = uni.glow_noise_a.y;
	let min_alpha = uni.glow_noise_a.z;
	let idle_value = uni.glow_noise_a.w;
	let strength_k = uni.glow_noise_b.x;
	let anim = uni.glow_noise_b.y;
	let activity = uni.glow_noise_b.z;

	let np = vec3<f32>(pos * freq, uni.data.w * anim * max(activity, 0.0001));
	var n = fractal_noise3(np);
	n = pow(clamp(n, 0.0, 1.0), power);

	let noise_mask = mix(min_alpha, 1.0, n);
	let mod_val = mix(idle_value, 1.0, n * strength_k);
	let col = sample_border_color(pos);
	let a = clamp(strength * noise_mask * mod_val, 0.0, 1.0);
	return vec4<f32>(col * a, a);
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
	let edge = uni.data.x;
	let alpha = uni.size.w;
	let x = pos.x - 0.5;
	let y = pos.y - 0.5;
	let lift = trail(x, y);

	// Rounded-rect SDF for the canvas outline so the effect follows the
	// window's corner shape and fades along the curve instead of getting
	// hard-cropped at the corners. uni.glow_params.x carries the canvas's
	// computed border-radius (set via CSS so it tracks --r-window).
	let half = uni.size.xy * 0.5;
	let p = vec2<f32>(x, y) - half;
	let outline = sdf_rounded_rect(p, half, uni.glow_params.x);
	let shape = smoothstep(0.5, -0.5, outline);

	let top = max(0.0, 1.0 - y / edge);
	let bot = max(0.0, 1.0 - (uni.size.y - y) / edge);
	let grad = max(top, bot) * shape;

	var dither_rgb = vec3<f32>(0.0);
	var dither_a = 0.0;
	if (grad > 0.001) {
		let d = dither(x, y, grad);
		if (d >= 0.5) {
			var shade = alpha * shape;
			if (lift > 0.01) {
				let cell = uni.data.y;
				let time = uni.data.w;
				let cx = u32(floor(x / cell));
				let cy = u32(floor(y / cell));
				let rate = 3.0 + hash(cx + 509u, cy + 643u) * 5.0;
				let phase = hash(cx + 719u, cy + 811u) * 6.2831855;
				let wave = sin(time * rate + phase) * 0.5 + 0.5;
				shade += wave * lift * grad * 0.3;
			}
			dither_rgb = uni.color.rgb * shade;
			dither_a = shade;
		}
	}

	let g = glow(vec2<f32>(x, y));
	let out_rgb = g.rgb + dither_rgb * (1.0 - g.a);
	let out_a = g.a + dither_a * (1.0 - g.a);
	return vec4<f32>(out_rgb, out_a);
}
`;

type Speckle = { x: number; y: number; tx: number; ty: number };

function seed(): Speckle[] {
	let out: Speckle[] = [];
	for (let i = 0; i < 8; i++) out.push({ x: 0, y: 0, tx: 0, ty: 0 });
	return out;
}

function pick(sp: Speckle, ox: number, oy: number, w: number, h: number) {
	let perim = 2 * (w + h);
	let t = Math.random() * perim;
	if (t < w) {
		sp.tx = ox + t;
		sp.ty = oy;
	} else if (t < w + h) {
		sp.tx = ox + w;
		sp.ty = oy + (t - w);
	} else if (t < 2 * w + h) {
		sp.tx = ox + w - (t - w - h);
		sp.ty = oy + h;
	} else {
		sp.tx = ox;
		sp.ty = oy + h - (t - 2 * w - h);
	}
}

/** Own the GPU resources, listeners, and animation loop for one canvas. */
export function render(
	canvas: HTMLCanvasElement,
	{ scale, noise, edge, alpha, color }: Options,
	params: () => Glow,
) {
	let gpu = navigator.gpu;
	let live = true;
	let events = new AbortController();
	let raf = 0;
	let ro: ResizeObserver | null = null;
	let root = canvas.parentElement;
	let dev: GPUDevice;
	let ctx: GPUCanvasContext;
	let buf: GPUBuffer;
	let sam: GPUSampler;
	let mainPipe: GPURenderPipeline;
	let trailPipe: GPURenderPipeline;
	let trailLayout: GPUBindGroupLayout;
	let mainLayout: GPUBindGroupLayout;
	let mainBind: [GPUBindGroup | null, GPUBindGroup | null] = [null, null];
	let trailBind: [GPUBindGroup | null, GPUBindGroup | null] = [null, null];
	let trail: [GPUTexture | null, GPUTexture | null] = [null, null];
	let views: [GPUTextureView | null, GPUTextureView | null] = [null, null];
	let side = 0;
	let fmt: GPUTextureFormat;
	let off = false;
	let time = 0;
	let last = 0;
	let idle = 0;
	let tw = 0;
	let th = 0;
	let ptr = { x: 0, y: 0, tx: 0, ty: 0, hover: 0 };
	let rgb = hex(color);
	let rect = canvas.getBoundingClientRect();
	let data = new Float32Array(96);
	data[4] = rgb[0];
	data[5] = rgb[1];
	data[6] = rgb[2];
	data[7] = 1;
	let speckles = seed();
	let inited = false;
	let progress = 0;
	let target = 0;
	let from = 0;
	let start = 0;
	let glowRect = { x: 0, y: 0, w: 0, h: 0, r: 0 };
	let cornerRadius = 0;
	let colorsRef: string[] | null = null;
	let dprMql: MediaQueryList | null = null;
	let dirty = true;
	let trailDesc: GPURenderPassDescriptor = {
		colorAttachments: [{
			clearValue: { r: 0, g: 0, b: 0, a: 1 },
			loadOp: "clear",
			storeOp: "store",
			view: null!,
		}],
	};
	let mainDesc: GPURenderPassDescriptor = {
		colorAttachments: [{
			clearValue: { r: 0, g: 0, b: 0, a: 0 },
			loadOp: "clear",
			storeOp: "store",
			view: null!,
		}],
	};

	function resize(w: number, h: number) {
		if (tw === w && th === h && trail[0]) return;
		for (let i = 0; i < 2; i++) {
			trail[i]?.destroy();
			trail[i] = dev.createTexture({
				format: "rgba8unorm",
				size: [w, h],
				usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
			});
			views[i] = trail[i]!.createView();
		}
		tw = w;
		th = h;
		bind();
	}

	function bind() {
		if (!buf || !sam || !views[0] || !views[1]) return;
		for (let i = 0; i < 2; i++) {
			trailBind[i] = dev.createBindGroup({
				layout: trailLayout,
				entries: [
					{ binding: 0, resource: { buffer: buf } },
					{ binding: 1, resource: sam },
					{ binding: 2, resource: views[i]! },
				],
			});
			mainBind[i] = dev.createBindGroup({
				layout: mainLayout,
				entries: [
					{ binding: 0, resource: { buffer: buf } },
					{ binding: 1, resource: sam },
					{ binding: 2, resource: views[i]! },
				],
			});
		}
	}

	function queue() {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame((now) => draw(off ? 0 : now));
	}

	function move(event: PointerEvent) {
		if (off) return;
		let x = event.clientX - rect.left;
		let y = event.clientY - rect.top;
		if (ptr.hover <= 0.001) {
			ptr.x = x;
			ptr.y = y;
		}
		ptr.tx = x;
		ptr.ty = y;
		ptr.hover = 1;
		queue();
	}

	function leave() {
		if (off) return;
		ptr.hover = 0;
		idle = 0;
		queue();
	}

	function measure() {
		let dpr = devicePixelRatio;
		let radius = Number.parseFloat(getComputedStyle(canvas).borderTopLeftRadius);
		let squircle = canvas.classList.contains("squircle")
			&& CSS.supports("corner-shape: squircle");
		cornerRadius = squircle ? Math.max(0, radius * (22 / 39) - 2) : radius;
		glowRect.x = 0;
		glowRect.y = 0;
		glowRect.w = rect.width * dpr;
		glowRect.h = rect.height * dpr;
		glowRect.r = cornerRadius * dpr;
	}

	function fit() {
		rect = canvas.getBoundingClientRect();
		measure();

		let dpr = devicePixelRatio;
		let w = Math.round(rect.width * dpr);
		let h = Math.round(rect.height * dpr);
		if (!w || !h) return false;

		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
			ctx.configure({ alphaMode: "premultiplied", device: dev, format: fmt });
		}
		resize(w, h);
		dirty = false;
		return true;
	}

	function mark() {
		dirty = true;
		queue();
	}

	function onDpr() {
		dprMql?.removeEventListener("change", onDpr);
		dprMql = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
		dprMql.addEventListener("change", onDpr, { signal: events.signal });
		mark();
	}

	function draw(now = 0) {
		if (!live || !dev || !ctx || !buf) return;

		let p = params();
		if (dirty && !fit()) return;
		if (!trailBind[0]) return;

		let dpr = devicePixelRatio;
		let w = tw;
		let h = th;
		let dx = ptr.tx - ptr.x;
		let dy = ptr.ty - ptr.y;
		let motion = Math.min(1, Math.hypot(dx, dy) / 8);
		ptr.x += dx * 0.3;
		ptr.y += dy * 0.3;
		let hover = ptr.hover;

		if (hover <= 0.001) idle++;
		else idle = 0;

		time = now * 0.001;
		let delta = last ? Math.min(0.1, time - last) : 0.016;
		last = time;

		let cell = Math.max(1, Math.round(scale * dpr));
		let band = Math.round(edge * dpr);

		// Match the native CAMediaTimingFunction control points.
		let goal = p.glowOn && glowRect.w > 0 ? 1 : 0;
		if (goal !== target) {
			from = progress;
			target = goal;
			start = time;
		}
		let direction = target > from ? p.glowFadeIn : p.glowFadeOut;
		let duration = direction > 0 ? direction : GLOW_FADE;
		let fade = Math.min(1, (time - start) / duration);
		let curve = target > from ? EASE_OUT : EASE_IN;
		progress = from + (target - from) * ease(fade, curve);
		if (fade >= 1) progress = target;

		if (p.glowOn && glowRect.w > 0) {
			if (!inited) {
				for (let sp of speckles) {
					pick(sp, glowRect.x, glowRect.y, glowRect.w, glowRect.h);
					sp.x = sp.tx;
					sp.y = sp.ty;
				}
				inited = true;
			}
			let blend = 1 - Math.exp(-delta * 1.9);
			let snap = Math.max(glowRect.w, glowRect.h) * 0.03;
			let snap2 = snap * snap;
			for (let sp of speckles) {
				sp.x += (sp.tx - sp.x) * blend;
				sp.y += (sp.ty - sp.y) * blend;
				let ex = sp.tx - sp.x;
				let ey = sp.ty - sp.y;
				if (ex * ex + ey * ey < snap2) pick(sp, glowRect.x, glowRect.y, glowRect.w, glowRect.h);
			}
		} else if (!p.glowOn) {
			inited = false;
		}

		data[0] = w;
		data[1] = h;
		data[2] = 0;
		data[3] = Math.min(1, alpha);
		data[8] = band;
		data[9] = cell;
		data[10] = noise;
		data[11] = time;
		data[12] = ptr.x * dpr;
		data[13] = ptr.y * dpr;
		data[14] = hover;
		data[15] = motion;

		if (p.glowOn || progress > 0.001) {
			let count = Math.min(8, p.glowColors.length);
			data[16] = glowRect.x;
			data[17] = glowRect.y;
			data[18] = glowRect.w;
			data[19] = glowRect.h;
			data[20] = glowRect.r;
			data[21] = p.glowScale * dpr;
			data[22] = progress * p.glowOpacity;
			data[23] = count;
			data[24] = p.glowNoiseFreq / dpr;
			data[25] = p.glowNoisePower;
			data[26] = p.glowNoiseMinAlpha;
			data[27] = p.glowNoiseIdle;
			data[28] = p.glowNoiseStrength;
			data[29] = p.glowNoiseAnim;
			data[30] = p.glowNoiseActivity;

			if (p.glowColors !== colorsRef) {
				colorsRef = p.glowColors;
				for (let i = 0; i < 8; i++) {
					let c = i < count ? hex(p.glowColors[i]!) : [0, 0, 0];
					let o = 32 + i * 4;
					data[o] = c[0];
					data[o + 1] = c[1];
					data[o + 2] = c[2];
					data[o + 3] = 1;
				}
			}
			for (let i = 0; i < 8; i++) {
				let sp = speckles[i]!;
				let o = 64 + i * 4;
				data[o] = sp.x;
				data[o + 1] = sp.y;
			}
		} else {
			data[22] = 0;
		}
		dev.queue.writeBuffer(buf, 0, data);

		let cmd = dev.createCommandEncoder();
		let next = 1 - side;

		// Pass 1: trail feedback — read trail[side], write trail[next]
		(trailDesc.colorAttachments as GPURenderPassColorAttachment[])[0].view = views[next]!;
		let tp = cmd.beginRenderPass(trailDesc);
		tp.setPipeline(trailPipe);
		tp.setBindGroup(0, trailBind[side]!);
		tp.draw(3);
		tp.end();

		// Pass 2: main render — read trail[next], draw to screen
		(mainDesc.colorAttachments as GPURenderPassColorAttachment[])[0].view = ctx
			.getCurrentTexture().createView();
		let mp = cmd.beginRenderPass(mainDesc);
		mp.setPipeline(mainPipe);
		mp.setBindGroup(0, mainBind[next]!);
		mp.draw(3);
		mp.end();

		dev.queue.submit([cmd.finish()]);
		side = next;

		let active = p.glowOn || progress > 0.001;
		if (hover > 0.001 || idle <= 60 || active) {
			raf = requestAnimationFrame(draw);
		}
	}

	void (async () => {
		try {
			let adp = await gpu.requestAdapter();
			if (!live || !adp) return;

			dev = await adp.requestDevice();
			if (!live) {
				dev.destroy();
				return;
			}

			ctx = canvas.getContext("webgpu")!;
			if (!ctx) return;

			fmt = gpu.getPreferredCanvasFormat();
			ctx.configure({ alphaMode: "premultiplied", device: dev, format: fmt });

			let trailMod = dev.createShaderModule({ code: TRAIL_WGSL });
			trailPipe = dev.createRenderPipeline({
				layout: "auto",
				vertex: { entryPoint: "vs", module: trailMod },
				fragment: { entryPoint: "fs", module: trailMod, targets: [{ format: "rgba8unorm" }] },
			});
			trailLayout = trailPipe.getBindGroupLayout(0);

			let mainMod = dev.createShaderModule({ code: MAIN_WGSL });
			mainPipe = dev.createRenderPipeline({
				layout: "auto",
				vertex: { entryPoint: "vs", module: mainMod },
				fragment: { entryPoint: "fs", module: mainMod, targets: [{ format: fmt }] },
			});
			mainLayout = mainPipe.getBindGroupLayout(0);

			buf = dev.createBuffer({
				size: data.byteLength,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			});
			sam = dev.createSampler({ magFilter: "linear", minFilter: "linear" });

			off = matchMedia("(prefers-reduced-motion: reduce)").matches;
			root?.addEventListener("pointerleave", leave, { signal: events.signal });
			root?.addEventListener("pointermove", move, { passive: true, signal: events.signal });

			ro = new ResizeObserver(mark);
			ro.observe(canvas);
			dprMql = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
			dprMql.addEventListener("change", onDpr, { signal: events.signal });
			draw(off ? 0 : performance.now());
		} catch (err) {
			console.warn("[LayoutCanvas] WebGPU init failed:", err);
		}
	})();

	function dispose() {
		live = false;
		events.abort();
		cancelAnimationFrame(raf);
		ro?.disconnect();
		buf?.destroy();
		trail[0]?.destroy();
		trail[1]?.destroy();
		ctx?.unconfigure();
		dev?.destroy();
	}

	return { kick: mark, dispose };
}
