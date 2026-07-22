// ---------- Scroll reveal ----------
const observer = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ================= PNG FLOWER MAGIC FOUNTAIN (replaces procedural petals) =================
const canvas = document.getElementById('petal-canvas');
const ctx = canvas.getContext('2d');

let W = 0;
let H = 0;
let DPR = 1;

function resize() {
  DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  W = canvas.width = Math.floor(window.innerWidth * DPR);
  H = canvas.height = Math.floor(window.innerHeight * DPR);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
}

window.addEventListener('resize', resize);
resize();

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// PNG sources (filenames can be swapped later)
const flowerFiles = [
  'flowers/rose.png',
  'flowers/tulip.png',
  'flowers/daisy.png',
  'flowers/lily.png',
  'flowers/sakura.png',
  'flowers/gerbera.png',
  'flowers/marigolds.png'
];

// Automatically load all images.
const flowerImages = [];
const flowerImageByIndex = [];
let imagesReady = false;
let imagesRequested = false;

function preloadFlowers() {
  if (imagesRequested) return;
  imagesRequested = true;

  flowerFiles.forEach((src, i) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      flowerImages[i] = img;
      flowerImageByIndex[i] = img;
      if (flowerImages.filter(Boolean).length === flowerFiles.length) {
        imagesReady = true;
      }
    };
    img.onerror = () => {
      // Keep going; the animation will skip missing images.
      flowerImages[i] = img;
      flowerImageByIndex[i] = img;
      if (flowerImages.filter(Boolean).length === flowerFiles.length) {
        imagesReady = true;
      }
    };
    img.src = src;
  });
}

preloadFlowers();

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function nowMs() {
  return performance.now();
}

// -------- Flower stream pool (no per-frame allocations) --------
const flowerCapacity = reduceMotion ? 0 : (window.innerWidth < 700 ? 320 : 420);
const flowerPool = new Array(flowerCapacity).fill(0).map(() => createFlowerParticle());

function createFlowerParticle() {
  return {
    alive: false,
    imgIndex: 0,
    u: 0,
    pathOffset: 0,
    strand: 0,
    depth: 0,
    size: 0,
    baseSize: 0,
    worldRot: 0,
    rotSpeed: 0,
    initialAngle: 0,
    alpha: 1,
    x: 0,
    y: 0,
    burstVx: 0,
    burstVy: 0,
  };
}

const sparkleCapacity = reduceMotion ? 0 : (window.innerWidth < 700 ? 140 : 220);
const sparklePool = new Array(sparkleCapacity).fill(0).map(() => createSparkleParticle());

function createSparkleParticle() {
  return {
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    alpha: 0,
    tw: 0,
    bornAt: 0,
    life: 0,
    size: 1,
  };
}

function acquireDeadSparkleParticle() {
  for (let i = 0; i < sparklePool.length; i++) {
    if (!sparklePool[i].alive) return sparklePool[i];
  }
  return null;
}

function stepAndDrawSparkles() {
  if (!cycle) return;

  const t = nowMs();
  const elapsed = t - cycle.t0;
  const rng = cycle.rng;

  // Spawn new sparkles during the initial phase
  if (elapsed < cycle.phaseA + cycle.phaseB && rng() > 0.65) {
    const s = acquireDeadSparkleParticle();
    if (s) {
      s.alive = true;
      s.x = cycle.originX + (rng() - 0.5) * 30;
      s.y = cycle.originY + (rng() - 0.5) * 30;
      const angle = rng() * Math.PI * 2;
      const speed = 1 + rng() * 2.5;
      s.vx = Math.cos(angle) * speed;
      s.vy = Math.sin(angle) * speed - 1.8; // Slight upward thrust
      s.alpha = 0;
      s.bornAt = t;
      s.life = 700 + rng() * 600;
      s.size = 1 + rng() * 1.8;
      s.tw = rng() * Math.PI * 2;
    }
  }

  // Update and draw existing sparkles
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  sparklePool.forEach(s => {
    if (!s.alive) return;
    const age = t - s.bornAt;
    if (age > s.life) { s.alive = false; return; }
    s.x += s.vx; s.y += s.vy; s.vy += 0.06; // Gravity
    const lifeProgress = age / s.life;
    const baseAlpha = Math.sin(lifeProgress * Math.PI); // Fade in and out
    const twinkle = (Math.sin(s.tw + t * 0.01) + 1) / 2 * 0.8 + 0.2;
    s.alpha = baseAlpha * twinkle;
    ctx.fillStyle = `rgba(255, 220, 150, ${s.alpha})`;
    ctx.beginPath();
    ctx.arc(s.x * DPR, s.y * DPR, s.size * DPR, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function pickFlowerImageIndex(rng) {
  const n = flowerFiles.length;
  return Math.floor(rng() * n);
}

function drawImageWithRotation(img, x, y, sizePx, rotRad, alpha) {
  if (!img || !img.complete || img.naturalWidth === 0) return;
  ctx.save();
  ctx.translate(x * DPR, y * DPR);
  ctx.rotate(rotRad);
  ctx.globalAlpha = alpha;

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const scale = sizePx / Math.max(w, h);

  ctx.scale(scale * DPR, scale * DPR);
  ctx.drawImage(img, -w / 2, -h / 2);

  ctx.restore();
}

// -------- Flower stream timeline + glow --------
const mysteryBox = document.getElementById('mystery-box');
let boxBusy = false;
let cycle = null;

function createCycle(originX, originY) {
  const t0 = nowMs();
  const seed = Math.floor(t0) ^ (originX * 31 | 0) ^ (originY * 17 | 0);
  const rng = mulberry32(seed);
  const maxScreen = Math.min(window.innerWidth, window.innerHeight);

  return {
    t0,
    originX,
    originY,
    active: true,
    rng,
    baseAngle: -Math.PI * 0.72,
    baseTurns: 2.8, // More turns for a tighter "spinning top" vortex
    baseRadius: 18,
    expandRadius: maxScreen * 0.52, // Larger expansion to fill the screen
    minRadius: 18,
    heightRise: 150, // Higher rise for a more dramatic fountain
    phaseA: 2500, // Duration of initial tight stream
    phaseB: 1700, // Duration of expansion into vortex
    phaseC: 2800, // Duration of curtain exit
    spinOffset: rng() * Math.PI * 2,
  };
}

function drawGlow() {
  if (!cycle) return;

  const t = nowMs();
  const glowProgress = clamp((t - (cycle.t0 + 100)) / 400, 0, 1); // Lasts ~400ms
  if (glowProgress <= 0) return;

  const fade = 1 - Math.pow(1 - glowProgress, 2);
  const r = 140 + fade * 90;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const gx = cycle.originX * DPR;
  const gy = cycle.originY * DPR;
  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * DPR);
  grad.addColorStop(0, `rgba(255, 244, 214, ${0.45 * fade})`);
  grad.addColorStop(0.24, `rgba(255, 220, 160, ${0.34 * fade})`);
  grad.addColorStop(0.6, `rgba(232, 200, 119, ${0.18 * fade})`);
  grad.addColorStop(1, `rgba(232, 200, 119, 0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(gx, gy, r * DPR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.9 * fade;
  ctx.lineWidth = 2 * DPR;
  ctx.strokeStyle = `rgba(255, 218, 170, ${0.26 * fade})`;
  ctx.beginPath();
  ctx.arc(gx, gy, (r * 0.58) * DPR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function initFlowerParticle(f, idx) {
  const rng = cycle.rng;
  const depthRoll = rng();
  const depth = 0.24 + Math.pow(depthRoll, 1.62) * 0.76;

  f.alive = true;
  f.imgIndex = pickFlowerImageIndex(rng);
  f.u = clamp(idx / Math.max(1, flowerPool.length - 1) + (rng() - 0.5) * 0.02, 0, 1);
  f.pathOffset = (rng() - 0.5) * 0.04;
  f.depth = depth;
  f.baseSize = 28 + 66 * depth;
  f.size = f.baseSize * (0.94 + rng() * 0.18);
  f.strand = (f.u - 0.5) * (16 + 64 * depth);
  f.worldRot = rng() * Math.PI * 2;
  f.rotSpeed = (rng() * 2 - 1) * (0.012 + 0.019 * depth) * 1.8;
  f.initialAngle = rng() * Math.PI * 2;
  f.alpha = 0.84 + rng() * 0.16;

  // Add a random burst velocity for the scattering phase (phaseB)
  const burstAngle = rng() * Math.PI * 2;
  const burstSpeed = (60 + rng() * 240) * (0.4 + f.depth);
  f.burstVx = Math.cos(burstAngle) * burstSpeed;
  f.burstVy = Math.sin(burstAngle) * burstSpeed;
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutQuart(x) {
  return x < 0.5 ? 8 * x * x * x * x : 1 - 8 * Math.pow(1 - x, 4);
}

function stepFlowers() {
  if (!cycle) return;

  const t = nowMs();
  const elapsed = t - cycle.t0;
  const phaseA = clamp(elapsed / cycle.phaseA, 0, 1);
  const phaseB = clamp((elapsed - cycle.phaseA) / cycle.phaseB, 0, 1);
  const phaseC = clamp((elapsed - cycle.phaseA - cycle.phaseB) / cycle.phaseC, 0, 1);

  // Add a large-scale wobble to the entire stream for a more organic, flowing feel
  const streamWobbleX = Math.sin(elapsed * 0.0007 + cycle.spinOffset) * 80 * easeOutCubic(phaseA) * (1 - phaseB);
  const streamWobbleY = Math.cos(elapsed * 0.0006 + cycle.spinOffset) * 50 * easeOutCubic(phaseA) * (1 - phaseB);

  const streamSpin = cycle.spinOffset + elapsed * 0.00042;
  const streamSpread = 0.04 + easeOutCubic(phaseB) * 0.92;
  const spiralTurns = cycle.baseTurns + easeOutCubic(phaseB) * 0.86;
  const streamRadius = cycle.baseRadius + easeOutCubic(phaseB) * cycle.expandRadius;
  const riseAmount = cycle.heightRise + easeOutCubic(phaseB) * 94;

  const renderQueue = [];

  for (let i = 0; i < flowerPool.length; i++) {
    const f = flowerPool[i];
    if (!f.alive) continue;

    const localU = clamp(f.u * streamSpread + f.pathOffset * (1 - phaseA), 0, 1);
    const pathT = clamp(localU * (0.92 + phaseA * 0.08), 0, 1);
    const angle = cycle.baseAngle + pathT * Math.PI * 2 * spiralTurns + streamSpin * 0.76;
    let radius = cycle.minRadius + Math.pow(pathT, 0.96) * streamRadius;

    // Deform the radius to make the spiral less of a perfect circle, more like a vortex
    radius *= (1 + Math.sin(angle * 2.5 + streamSpin) * 0.12 * phaseB);

    const baseX = cycle.originX + streamWobbleX + Math.cos(angle) * radius;
    const baseY = cycle.originY + streamWobbleY + Math.sin(angle) * radius * 0.72 - pathT * riseAmount;

    const perp = angle + Math.PI / 2;
    const widthOffset = f.strand * (0.22 + phaseB * 0.42);
    const wobble = Math.sin(pathT * 5.6 + streamSpin * 1.6 + f.initialAngle) * (10 + 24 * f.depth) * (1 - phaseB * 0.24);

    let x = baseX + Math.cos(perp) * (widthOffset + wobble);
    let y = baseY + Math.sin(perp) * (widthOffset * 0.55 + wobble * 0.43);

    // Apply burst effect during phase B to scatter flowers and fill the screen
    const burstFactor = easeOutCubic(phaseB);
    x += f.burstVx * burstFactor;
    y += f.burstVy * burstFactor;

    const exitProgress = easeInOutQuart(phaseC);
    const exitShift = (f.u - 0.5) * (Math.max(window.innerWidth, window.innerHeight) * 0.72) * exitProgress;

    // Add a gentle swaying motion as flowers fall during the exit phase
    const swayX = Math.sin(elapsed * 0.0018 + f.initialAngle) * (25 + f.depth * 30) * exitProgress;
    x += exitShift + swayX;
    y += exitProgress * 46 * (f.depth - 0.45);

    const bloomScale = 1 + phaseB * 0.18 + f.depth * 0.18;
    const alpha = clamp(f.alpha * (0.96 - phaseC * 0.24) * (0.76 + phaseA * 0.24), 0, 1);

    renderQueue.push({ f, x, y, angle, size: f.size * bloomScale, alpha, z: f.depth + pathT * 0.18 });
  }

  renderQueue.sort((a, b) => a.z - b.z);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < renderQueue.length; i++) {
    const { f, x, y, angle, size, alpha } = renderQueue[i];
    const img = flowerImageByIndex[f.imgIndex];

    ctx.save();
    ctx.globalAlpha = alpha * 0.34;
    ctx.filter = 'blur(2px)';
    drawImageWithRotation(img, x, y, size * 1.06, f.worldRot + angle * 0.1, alpha * 0.52);
    ctx.restore();

    drawImageWithRotation(img, x, y, size, f.worldRot + angle * 0.1, alpha);

    ctx.save();
    ctx.globalAlpha = alpha * 0.16;
    ctx.translate(x * DPR, y * DPR);
    ctx.rotate(f.worldRot + angle * 0.1);
    ctx.filter = 'blur(1px)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.ellipse(2 * DPR, 5 * DPR, (size * 0.18) * DPR, (size * 0.12) * DPR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    f.worldRot += f.rotSpeed;
  }
  ctx.restore();

  if (elapsed > cycle.phaseA + cycle.phaseB + cycle.phaseC + 700) {
    cycle.active = false;
    cycle = null;
  }
}

function animate() {
  ctx.clearRect(0, 0, W, H);

  if (cycle && cycle.active) {
    drawGlow();
    stepFlowers();
    stepAndDrawSparkles();
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

function openBox() {
  if (boxBusy) return;
  boxBusy = true;

  mysteryBox.classList.add('open');

  const rect = mysteryBox.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height * 0.28;

  setTimeout(() => {
    createNewCycle(originX, originY);
  }, 240);

  // Timings from createCycle: 2500 + 1700
  setTimeout(() => {
    mysteryBox.classList.remove('open');
  }, 240 + 2500 + 1700); // Close lid as vortex is at max

  // Timings: startDelay + phaseA + phaseB + phaseC + endBuffer
  const totalCycle = 240 + 2500 + 1700 + 2800 + 700;
  setTimeout(() => {
    boxBusy = false;
  }, totalCycle);
}

function createNewCycle(originX, originY) {
  cycle = createCycle(originX, originY);

  for (let i = 0; i < flowerPool.length; i++) {
    initFlowerParticle(flowerPool[i], i);
  }
  for (let i = 0; i < sparklePool.length; i++) {
    sparklePool[i].alive = false;
  }
}

// ================= Lightbox Gallery =================
const galleryFrames = document.querySelectorAll('.gallery-grid .frame');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const closeBtn = document.querySelector('.lightbox-close');
const prevBtn = document.querySelector('.lightbox-prev');
const nextBtn = document.querySelector('.lightbox-next');

let currentFrameIndex = 0;

if (lightbox && lightboxImg && lightboxCaption && closeBtn && prevBtn && nextBtn) {

  function showImage(index) {
    const newIndex = (index + galleryFrames.length) % galleryFrames.length;
    currentFrameIndex = newIndex;

    const frame = galleryFrames[newIndex];
    const img = frame.querySelector('img');
    const caption = frame.querySelector('.caption');

    if (img && img.src) {
      lightboxImg.src = img.src;
      lightboxCaption.textContent = caption ? caption.textContent : '';
    }
  }

  function openLightbox(index) {
    document.body.style.overflow = 'hidden';
    lightbox.classList.add('show');
    showImage(index);
  }

  galleryFrames.forEach((frame, index) => {
    frame.addEventListener('click', () => openLightbox(index));
  });

  const closeLightbox = () => {
    document.body.style.overflow = '';
    lightbox.classList.remove('show');
  };

  closeBtn.addEventListener('click', closeLightbox);

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showImage(currentFrameIndex + 1);
  });

  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showImage(currentFrameIndex - 1);
  });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('show')) return;

    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowRight') {
      showImage(currentFrameIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      showImage(currentFrameIndex - 1);
    }
  });
}

mysteryBox.addEventListener('click', openBox);
mysteryBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openBox();
  }
});

// ================= MUSIC PLAYER (Local MP3 files) =================
(() => {
  const audio = document.getElementById('audio-player');
  if (!audio) return;

  const songTitleEl = document.getElementById('player-song-title');
  const songArtistEl = document.getElementById('player-song-artist');
  const prevBtn = document.getElementById('player-prev-btn');
  const playPauseBtn = document.getElementById('player-play-pause-btn');
  const nextBtn = document.getElementById('player-next-btn');
  const progressBar = document.getElementById('player-progress-bar');

  if (!songTitleEl || !songArtistEl || !prevBtn || !playPauseBtn || !nextBtn || !progressBar) return;

  const playlist = [
    {
      title: "Can't Help Falling in Love",
      artist: 'Elvis Presley',
      src: 'music/Elvis Presley - Can\u2019t Help Falling In Love.mp3',
    },
    {
      title: 'Beautiful',
      artist: 'Bazzi feat. Camila',
      src: 'music/Bazzi - Beautiful feat. Camila.mp3',
    },
    {
      title: 'Shape of My Heart',
      artist: 'Backstreet Boys',
      src: 'music/Backstreet Boys - Shape of My Heart.mp3',
    },
  ];

  let currentIndex = 0;
  let isPlaying = false;
  let progressTimer = null;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function setNowPlaying(index) {
    currentIndex = (index + playlist.length) % playlist.length;
    const track = playlist[currentIndex];
    songTitleEl.textContent = track.title || 'Lagu';
    songArtistEl.textContent = track.artist || '';
  }

  function setPlayUI(playing) {
    const playIcon = playPauseBtn.querySelector('.play-icon');
    const pauseIcon = playPauseBtn.querySelector('.pause-icon');
    if (playIcon && pauseIcon) {
      playIcon.style.display = playing ? 'none' : 'block';
      pauseIcon.style.display = playing ? 'block' : 'none';
    }
    playPauseBtn.classList.toggle('playing', !!playing);
    isPlaying = !!playing;
  }

  function startProgressTimer() {
    if (progressTimer) return;
    progressTimer = setInterval(syncProgressNow, 250);
  }

  function stopProgressTimer() {
    if (!progressTimer) return;
    clearInterval(progressTimer);
    progressTimer = null;
  }

  function syncProgressNow() {
    if (!audio || !audio.duration || audio.duration <= 0) {
      progressBar.style.width = '0%';
      return;
    }
    const percent = clamp((audio.currentTime / audio.duration) * 100, 0, 100);
    progressBar.style.width = percent + '%';
  }

  function loadTrack(index) {
    currentIndex = (index + playlist.length) % playlist.length;
    const track = playlist[currentIndex];
    setNowPlaying(currentIndex);
    audio.src = track.src;
    audio.load();
  }

  function playCurrent() {
    if (!audio.src) {
      loadTrack(currentIndex);
    }
    audio.play().then(() => {
      setPlayUI(true);
      startProgressTimer();
    }).catch(() => {
      // Autoplay might be blocked; user must interact first
    });
  }

  function pauseCurrent() {
    audio.pause();
    setPlayUI(false);
    stopProgressTimer();
  }

  function playPause() {
    if (!audio.src) {
      loadTrack(currentIndex);
    }

    if (audio.paused) {
      playCurrent();
    } else {
      pauseCurrent();
    }
  }

  function prev() {
    stopProgressTimer();
    loadTrack(currentIndex - 1);
    if (isPlaying) {
      playCurrent();
    } else {
      // Reset progress bar
      progressBar.style.width = '0%';
    }
  }

  function next() {
    stopProgressTimer();
    loadTrack(currentIndex + 1);
    if (isPlaying) {
      playCurrent();
    } else {
      progressBar.style.width = '0%';
    }
  }

  // Audio events
  audio.addEventListener('loadedmetadata', () => {
    syncProgressNow();
  });

  audio.addEventListener('timeupdate', () => {
    syncProgressNow();
  });

  audio.addEventListener('play', () => {
    setPlayUI(true);
    startProgressTimer();
  });

  audio.addEventListener('pause', () => {
    setPlayUI(false);
    stopProgressTimer();
  });

  audio.addEventListener('ended', () => {
    setPlayUI(false);
    stopProgressTimer();
    progressBar.style.width = '0%';
    // Auto play next
    loadTrack(currentIndex + 1);
    if (isPlaying) {
      playCurrent();
    }
  });

  audio.addEventListener('error', () => {
    // If loading fails, try next track
    console.warn('Audio load error, skipping to next track');
    next();
  });

  // Initial UI
  setPlayUI(false);
  setNowPlaying(0);

  // Button events
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  playPauseBtn.addEventListener('click', playPause);

  playPauseBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      playPause();
    }
  });
})();


// Ensure body doesn't get hidden behind fixed music player on small screens (fallback)
(function(){
  const root = document.documentElement;
  if (!root) return;
  const applyPad = () => {
    if (window.matchMedia('(max-width:820px)').matches) {
      document.body.style.paddingBottom = '96px';
    } else {
      document.body.style.paddingBottom = '86px';
    }
  };
  window.addEventListener('resize', applyPad);
  applyPad();
})();


