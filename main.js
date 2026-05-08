import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createNoise2D } from 'simplex-noise'

// ── Offline sentiment (no model download needed) ──
const POSITIVE_WORDS = ['happy','joy','love','amazing','great','wonderful','excited','fantastic','good','best','beautiful','laugh','smile','celebrate','blessed','grateful','awesome','perfect','brilliant','hope','fun','enjoy','peace','proud','kind','pleasure','delightful','cheerful','positive','lucky']
const NEGATIVE_WORDS = ['sad','cry','hate','terrible','awful','depressed','angry','lonely','hurt','pain','miss','lost','fear','anxious','worried','stress','dark','empty','broken','fail','regret','sorry','sick','tired','hopeless','nightmare','miserable','devastated','disappointed','frustrated']

function analyzeSentiment(text) {
  const words = text.toLowerCase().split(/\W+/)
  let score = 0
  words.forEach(word => {
    if (POSITIVE_WORDS.includes(word)) score += 1
    if (NEGATIVE_WORDS.includes(word)) score -= 1
  })
  const maxScore = Math.max(words.length * 0.1, 1)
  return Math.max(-1, Math.min(1, score / maxScore))
}

// ── Styles ──
document.body.style.cssText = 'margin:0;padding:0;background:#000;overflow:hidden;font-family:sans-serif'

// ── UI ──
const ui = document.createElement('div')
ui.style.cssText = 'position:fixed;top:20px;left:20px;z-index:999;display:flex;flex-direction:column;gap:10px;'
ui.innerHTML = `
  <div id="upload-zone" style="border:2px dashed #fff;padding:16px 20px;cursor:pointer;text-align:center;border-radius:8px;width:260px;background:rgba(0,0,0,0.7);font-size:14px;color:white;">
    📂 Drop your chat or journal file here<br/>
    <span style="font-size:11px;color:#aaa;">click to browse (.txt .md)</span>
  </div>
  <input type="range" id="timeline" min="0" max="100" value="0" style="width:260px;cursor:pointer;" />
  <div id="status" style="font-size:13px;color:#aaa;background:rgba(0,0,0,0.6);padding:6px 10px;border-radius:6px;width:260px;">
    ⏳ Waiting for file...
  </div>
  <div id="legend" style="font-size:12px;line-height:2;background:rgba(0,0,0,0.6);padding:8px 12px;border-radius:6px;width:260px;color:white;">
    🟡 Joy &nbsp; 🟢 Happy &nbsp; 🟤 Neutral<br/>
    🔵 Sad &nbsp; 🌑 Grief / Lake
  </div>
`
document.body.appendChild(ui)

// ── Three.js ──
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;z-index:1;'
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x111122, 0.012)
scene.background = new THREE.Color(0x0a0a1a)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0, 30, 70)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
dirLight.position.set(50, 80, 30)
scene.add(dirLight)
scene.add(new THREE.AmbientLight(0x334455, 0.8))

function animate() {
  requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}
animate()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ── Parser ──
function parseText(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 4)
  return lines.map((line, i) => {
    const match = line.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}).+?:\s*(.+)/)
    return {
      date: match ? match[1] : 'entry-' + i,
      text: match ? match[2] : line
    }
  })
}

// ── Score all entries instantly (no internet needed) ──
function scoreEntries(entries) {
  const status = document.getElementById('status')
  status.textContent = '🔍 Analysing sentiment...'
  return entries.map(entry => ({
    ...entry,
    sentiment: analyzeSentiment(entry.text)
  }))
}

// ── Terrain ──
function buildTerrain(scored) {
  const old = scene.getObjectByName('terrain')
  if (old) scene.remove(old)

  const noise2D = createNoise2D()
  const SIZE = 128
  const geo = new THREE.PlaneGeometry(120, 120, SIZE - 1, SIZE - 1)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  const colors = []

  for (let i = 0; i < pos.count; i++) {
    const col = Math.floor((i % SIZE) / SIZE * scored.length)
    const s = scored[Math.min(col, scored.length - 1)].sentiment
    const noise = noise2D(i % SIZE * 0.05, Math.floor(i / SIZE) * 0.05)
    pos.setY(i, s * 12 + noise * 4)

    let r, g, b
    if      (s >  0.7) { r=0.95; g=0.85; b=0.3  }
    else if (s >  0.3) { r=0.3;  g=0.75; b=0.3  }
    else if (s >  0.0) { r=0.7;  g=0.65; b=0.45 }
    else if (s > -0.4) { r=0.35; g=0.35; b=0.5  }
    else if (s > -0.7) { r=0.1;  g=0.15; b=0.45 }
    else               { r=0.04; g=0.04; b=0.18 }
    colors.push(r, g, b)
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  )
  mesh.name = 'terrain'
  scene.add(mesh)
}

// ── Timeline ──
document.getElementById('timeline').addEventListener('input', e => {
  const x = (e.target.value / 100 - 0.5) * 120
  camera.position.set(x, 25, 50)
  camera.lookAt(x, 0, 0)
})

// ── File handler ──
async function handleFile(file) {
  const text = await file.text()
  const entries = parseText(text)
  if (entries.length === 0) {
    document.getElementById('status').textContent = '❌ No entries found in file'
    return
  }
  const scored = scoreEntries(entries)
  buildTerrain(scored)
  document.getElementById('status').textContent =
    '✅ ' + entries.length + ' entries mapped! Drag slider to explore.'
}

// ── Uploader ──
const zone = document.getElementById('upload-zone')
zone.addEventListener('dragover', e => e.preventDefault())
zone.addEventListener('drop', e => {
  e.preventDefault()
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
})
zone.addEventListener('click', () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.txt,.md,.json'
  input.onchange = e => handleFile(e.target.files[0])
  input.click()
})