// ============================================================================
// UNSPLASH CONFIG
// Get your Access Key at https://unsplash.com/oauth/applications
// (use the "Access Key", NOT the "Secret Key")
// ============================================================================
const UNSPLASH_ACCESS_KEY = 'YOUR_ACCESS_KEY'
const UNSPLASH_API = 'https://api.unsplash.com'

// Optional filters for /photos/random. Leave as '' to disable.
// Note: `query` cannot be combined with `collections` or `topics`.
const UNSPLASH_QUERY = ''          // e.g. 'nature', 'architecture'
const UNSPLASH_COLLECTIONS = ''    // e.g. '317099,1065976' (comma separated IDs)
const UNSPLASH_TOPICS = ''         // e.g. 'bo8jQKTaE0Y' (comma separated IDs or slugs)
const UNSPLASH_CONTENT_FILTER = 'low' // 'low' | 'high'

const PHOTOS_PER_REQUEST = 30      // API maximum is 30
const POOL_LOW_WATERMARK = 10      // refill the pool when it drops below this

// ============================================================================

const preloaderText = document.querySelector('.preloader__text h1');
preloaderText.innerHTML = preloaderText.textContent.replace(/\S/g, "<span class='letter'>$&</span>");

anime.timeline().add({
  targets: '.preloader__text h1 .letter',
  translateX: [40, 0],
  translateZ: 0,
  opacity: [0, 1],
  easing: 'easeOutExpo',
  duration: 1200,
  delay: (el, i) => 1400 + 30 * i,
}).add({
  targets: '.preloader__text h1 .letter',
  translateX: [0, -40],
  translateZ: 0,
  opacity: [1, 0],
  easing: 'easeOutExpo',
  duration: 1200,
  delay: (el, i) => 800 + 30 * i,
});

gsap.to(".preloader__text", 1, {
  opacity: 0,
  display: "none",
  ease: "power3.inOut",
  delay: 4.4,
});

gsap.from(".button.logo", 1, {
  x: -40,
  opacity: 0,
  ease: "power3.inOut",
  delay: 4,
  stagger: {
    amount: 1,
  },
});

gsap.from([".footer__links__github"], 1, {
  x: -40,
  opacity: 0,
  ease: "power3.inOut",
  delay: 4.2,
});

gsap.from([".footer__links__swap"], 1, {
  x: -40,
  opacity: 0,
  ease: "power3.inOut",
  delay: 4.4,
});

const footerCreditSplit = new SplitType(".footer__credit h3");

gsap.from(footerCreditSplit.chars, {
  y: 40,
  opacity: 0,
  ease: "cubic-bezier(0.23, 1, 0.32, 1)",
  delay: 4.8,
  stagger: 0.01,
});

const shaderIds = {
  stageFragment: 'stage-fragment',
  backgroundFragment: 'background-fragment',
}

function fetchShader(shaderId) {
  const xhr = new XMLHttpRequest();

  xhr.open('GET', `assets/shaders/${shaderId}.glsl`, false);
  xhr.send();

  return xhr.status === 200 ? xhr.responseText : null;
}

/**
 * Class to generate a random masonry layout, using a square grid as base.
 */
class Grid {
  /**
   * Constructor for the Grid class.
   *
   * @param {number} gridSize - The size (width and height) for the smallest unit size.
   * @param {number} gridColumns - Number of columns for the grid (width = gridColumns * gridSize).
   * @param {number} gridRows - Number of rows for the grid (height = gridRows * gridSize).
   * @param {number} gridMin - Min width and height limits for rectangles (in grid units).
   */
  constructor(gridSize, gridColumns, gridRows, gridMin) {
    this.gridSize = gridSize
    this.gridColumns = gridColumns
    this.gridRows = gridRows
    this.gridMin = gridMin
    this.rects = []
    this.currentRects = [
      { x: 0, y: 0, w: this.gridColumns, h: this.gridRows },
    ]
  }

  /**
   * Takes the first rectangle on the list and divides it into 2 more rectangles if possible.
   */
  splitCurrentRect() {
    if (this.currentRects.length) {
      const currentRect = this.currentRects.shift()
      const cutVertical = currentRect.w > currentRect.h
      const cutSide = cutVertical ? currentRect.w : currentRect.h
      const cutSize = cutVertical ? 'w' : 'h'
      const cutAxis = cutVertical ? 'x' : 'y'

      if (cutSide > this.gridMin * 2) {
        const rect1Size = randomInRange(this.gridMin, cutSide - this.gridMin)
        const rect1 = Object.assign({}, currentRect, {[cutSize]: rect1Size })
        const rect2 = Object.assign({}, currentRect, {
          [cutAxis]: currentRect[cutAxis] + rect1Size,
          [cutSize]: currentRect[cutSize] - rect1Size,
        })
        this.currentRects.push(rect1, rect2)
      } else {
        this.rects.push(currentRect);
        this.splitCurrentRect();
      }
    }
  }

  /**
   * Calls `splitCurrentRect` until there are no more rectangles on the list.
   *
   * @returns {Array} - The list of rectangles.
   */
  generateRects() {
    while (this.currentRects.length) {
      this.splitCurrentRect()
    }
    return this.rects
  }
}

/**
 * Generates a random integer in the specified range.
 *
 * @param {number} min - The minimum value of the range.
 * @param {number} max - The maximum value of the range.
 * @returns {number} - The random integer.
 */
function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const view = document.querySelector('.canvas')
const resources = PIXI.Loader.shared.resources

// Target for pointer. If down, value is 1, else value is 0
let pointerDownTarget = 0

// Variables to keep track of the pointer
let pointerStart = new PIXI.Point()
let pointerDiffStart = new PIXI.Point()
let width, height, app, background, uniforms, diffX, diffY

// Variables as settings for grid
const gridSize = 30
const gridMin = 3
const imagePadding = 10
let gridColumnsCount, gridRowsCount, gridColumns, gridRows, grid
let widthRest, heightRest, centerX, centerY, container, rects
let images, imagesUrls

view.addEventListener('mousedown', () => {
  view.classList.add('active');
})

view.addEventListener('mouseup', () => {
  if (view.classList.contains('active')) {
    view.classList.remove('active');
  }
});

/**
 * Set initial values for dimensions.
 */
function initDimensions() {
  width = window.innerWidth
  height = window.innerHeight
  diffX = 0
  diffY = 0
}

/**
 * Set initial values for uniforms.
 */
function initUniforms() {
  uniforms = {
    uResolution: new PIXI.Point(width, height),
    uPointerDiff: new PIXI.Point(),
    uPointerDown: pointerDownTarget,
  }
}

/**
 * Initialize the random grid layout.
 */
function initGrid() {
  gridColumnsCount = Math.ceil(width / gridSize)
  gridRowsCount = Math.ceil(height / gridSize)

  // Make the grid 5 times bigger than viewport
  gridColumns = gridColumnsCount * 5
  gridRows = gridRowsCount * 5

  // Create a new Grid instance with our settings
  grid = new Grid(gridSize, gridColumns, gridRows, gridMin)
  // Calculate the center position for the grid in the viewport
  widthRest = Math.ceil(gridColumnsCount * gridSize - width)
  heightRest = Math.ceil(gridRowsCount * gridSize - height)
  centerX = (gridColumns * gridSize) / 2 - (gridColumnsCount * gridSize) / 2
  centerY = (gridRows * gridSize) / 2 - (gridRowsCount * gridSize) / 2

  rects = grid.generateRects();

  images = []
  // Stores the IDs of Unsplash photos already used in the grid, to avoid duplicates
  imagesUrls = {}
}

/**
 * Initialize the PixiJS Application.
 */
function initApp() {
  app = new PIXI.Application({ view })
  // Resizes renderer view in CSS pixels to allow for resolutions other than 1
  app.renderer.autoDensity = true
  // Resize the view to match viewport dimensions
  app.renderer.resize(width, height)

  // Set the distortion filter for the entire stage
  const fragmentShader = fetchShader(shaderIds["stageFragment"])
  const stageFilter = new PIXI.Filter(undefined, fragmentShader, uniforms)
  app.stage.filters = [stageFilter]
}

/**
 * Init the gridded background
 */
function initBackground() {
  // Create a new empty Sprite and define its size
  background = new PIXI.Sprite()
  background.width = width
  background.height = height
  // Get the code for the fragment shader from the loaded resources
  const fragmentShader = fetchShader(shaderIds['backgroundFragment']);

  // Create a new Filter using the fragment shader
  // no need a custom vertex shader, so we set it as `undefined`
  const backgroundFilter = new PIXI.Filter(undefined,fragmentShader, uniforms);

  // Assign the filter to the background Sprite
  background.filters = [backgroundFilter]

  app.stage.addChild(background)
}

/**
 * Initialize a Container element for solid rectangles and images
 */
function initContainer() {
  container = new PIXI.Container()
  app.stage.addChild(container)
}

// ============================================================================
// UNSPLASH API
// ============================================================================

// Photos fetched from the API but not yet assigned to a rectangle
let photoPool = []
// The in-flight request for a batch, so we never fire two at once
let batchRequest = null
// Set when the API rejects us (bad key / rate limit), so we stop spamming it
let apiBlocked = false

/**
 * Fetch a batch of random photos from Unsplash and add them to the pool.
 * Uses ONE API request for up to 30 photos (demo apps are limited to 50 requests/hour).
 *
 * @returns {Promise<void>}
 */
function fetchPhotoBatch() {
  if (apiBlocked) return Promise.resolve()
  if (batchRequest) return batchRequest

  if (!UNSPLASH_ACCESS_KEY || UNSPLASH_ACCESS_KEY === 'YOUR_ACCESS_KEY') {
    console.error('[Unsplash] Set UNSPLASH_ACCESS_KEY at the top of app.js')
    apiBlocked = true
    return Promise.resolve()
  }

  const params = new URLSearchParams({
    count: PHOTOS_PER_REQUEST,
    content_filter: UNSPLASH_CONTENT_FILTER,
  })
  if (UNSPLASH_QUERY) params.set('query', UNSPLASH_QUERY)
  // The docs say query can't be combined with collections/topics in one request
  if (!UNSPLASH_QUERY && UNSPLASH_COLLECTIONS) params.set('collections', UNSPLASH_COLLECTIONS)
  if (!UNSPLASH_QUERY && UNSPLASH_TOPICS) params.set('topics', UNSPLASH_TOPICS)

  batchRequest = fetch(`${UNSPLASH_API}/photos/random?${params}`, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  })
    .then(async (response) => {
      const remaining = response.headers.get('X-Ratelimit-Remaining')
      if (remaining !== null) console.info(`[Unsplash] Requests remaining this hour: ${remaining}`)

      if (response.status === 401) {
        apiBlocked = true
        throw new Error('401 Unauthorized: invalid Access Key')
      }
      if (response.status === 403) {
        apiBlocked = true
        throw new Error('403 Forbidden: rate limit exceeded (demo apps: 50 requests/hour) or missing permissions')
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(`${response.status}: ${(body.errors || []).join(', ') || response.statusText}`)
      }

      const photos = await response.json()
      // With `count`, the response is always an array
      photos.forEach((photo) => {
        if (!imagesUrls[photo.id]) photoPool.push(photo)
      })
    })
    .catch((error) => {
      console.error('[Unsplash]', error.message)
    })
    .finally(() => {
      batchRequest = null
    })

  return batchRequest
}

/**
 * Take an unused photo from the pool, preferring the one whose aspect ratio
 * is closest to the target (less cropping). Refills the pool as needed.
 *
 * @param {number} aspect - Target width / height
 * @returns {Promise<Object|null>} - The Unsplash photo object, or null if unavailable
 */
async function getPhoto(aspect) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // Drop anything already used (e.g. random returned a duplicate)
    photoPool = photoPool.filter((photo) => !imagesUrls[photo.id])

    // Top the pool up in the background before it runs dry
    if (photoPool.length < POOL_LOW_WATERMARK) fetchPhotoBatch()

    // Nothing to hand out: wait for the in-flight (or a new) request
    if (!photoPool.length) {
      await fetchPhotoBatch()
      continue
    }

    let bestIndex = 0
    let bestScore = Infinity
    photoPool.forEach((photo, i) => {
      const score = Math.abs(Math.log((photo.width / photo.height) / aspect))
      if (score < bestScore) {
        bestScore = score
        bestIndex = i
      }
    })

    const photo = photoPool.splice(bestIndex, 1)[0]
    imagesUrls[photo.id] = true
    return photo
  }
  return null
}

/**
 * Build a resized image URL from the photo's `raw` URL.
 * Docs: keep the `ixid` parameter (already in `raw`) and hotlink the image.
 *
 * @param {Object} photo - Unsplash photo object
 * @param {number} w - Width in CSS pixels
 * @param {number} h - Height in CSS pixels
 * @returns {string}
 */
function buildImageUrl(photo, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  // Cap the size so huge rectangles don't download enormous files
  const pw = Math.min(Math.round(w * dpr), 2000)
  const ph = Math.min(Math.round(h * dpr), 2000)
  const separator = photo.urls.raw.includes('?') ? '&' : '?'
  return `${photo.urls.raw}${separator}w=${pw}&h=${ph}&fit=crop&crop=entropy&auto=format&q=80`
}

/**
 * Load texture for an image, giving its index
 *
 * @param index
 * @param {number} retries - How many times this rect already retried after an image error
 */
function loadTextureForImage(index, retries = 0) {
  const image = images[index]
  // Get the corresponding rect, to store more data needed (it is a normal Object)
  const rect = rects[index]
  // Create a new AbortController, to cancel if the rect leaves the viewport before getting a photo
  const { signal } = (rect.controller = new AbortController())

  getPhoto(image.width / image.height).then((photo) => {
    if (!photo) {
      // API unavailable. Allow this rect to try again later (unless we're blocked for good)
      if (!apiBlocked) {
        setTimeout(() => {
          rect.discovered = false
        }, 5000)
      }
      return
    }

    // Rect left the viewport while we waited: give the photo back to the pool
    if (signal.aborted) {
      delete imagesUrls[photo.id]
      photoPool.unshift(photo)
      return
    }

    // From here on the photo is committed to this rect
    rect.committed = true
    rect.photo = photo // keep it around, you need it for photographer attribution

    // Remember the size this rect should be displayed at
    const targetW = image.width
    const targetH = image.height

    const texture = PIXI.Texture.from(buildImageUrl(photo, targetW, targetH))
    const baseTexture = texture.baseTexture

    // Assign the texture right away (even though it hasn't loaded yet).
    // The sprite then subscribes to the texture's 'update' event and rescales
    // itself once the real image dimensions are known. Assigning it only
    // after 'loaded' makes PixiJS 5.0.2 scale a 1x1 texture up to the rect
    // size, which shows up as flat single-colour blocks.
    image.texture = texture

    const onReady = () => {
      // Re-apply the display size now that the texture has real dimensions
      image.width = targetW
      image.height = targetH
      rect.loaded = true
    }

    const onError = () => {
      // Image failed: free the slot and try another photo (max 3 times)
      image.texture = PIXI.Texture.EMPTY
      image.width = targetW
      image.height = targetH
      rect.committed = false
      if (retries < 3) {
        loadTextureForImage(index, retries + 1)
      }
    }

    if (baseTexture.valid) {
      onReady()
    } else {
      texture.once('update', onReady)
      baseTexture.once('error', onError)
    }
  })
}

/**
 * Add solid rectangles and images
 */
function initRectsAndImages() {
  // New Graphics element to draw solid rectangles
  const graphics = new PIXI.Graphics();
  // Color for rectangles
  graphics.beginFill(0x000000);

  rects.forEach((rect) => {
    const image = new PIXI.Sprite();

    image.x = rect.x * gridSize
    image.y = rect.y * gridSize
    image.width = rect.w * gridSize - imagePadding
    image.height = rect.h * gridSize - imagePadding
    image.alpha = 0 // Not visible initially
    images.push(image)

    graphics.drawRect(image.x, image.y, image.width, image.height)
  });

  graphics.endFill();

  container.addChild(graphics);

  images.forEach((image) => {
    container.addChild(image);
  });
}

const ALPHA_CHANGE = 0.01;

/**
 * Check if rects intersects with the viewport and loads corresponding image
 */
function checkRectsAndImages() {
  rects.forEach((rect, index) => {
    const image = images[index]

    if (rectIntersectsWithViewport(rect)) {
      // If rect just has been discovered start loading image
      if (!rect.discovered) {
        rect.discovered = true
        loadTextureForImage(index)
      }

      // Increase alpha until limit
      if (rect.loaded && image.alpha < 1) {
        image.alpha += ALPHA_CHANGE;
      }
    } else {
      // The rect is not intersecting
      // If the rect was discovered before, but no photo has been assigned
      // yet, cancel the pending request
      if (rect.discovered && !rect.loaded && !rect.committed) {
        rect.discovered = false
        rect.controller.abort()
      }

      // Decrease alpha until limit
      if (image.alpha > 0) {
        image.alpha -= ALPHA_CHANGE;
      }
    }
  })
}

/**
 * Check if a rect intersects the viewport
 *
 * @param rect
 * @returns {boolean}
 */
function rectIntersectsWithViewport(rect) {
  return (
    rect.x * gridSize + container.x <= width &&
    0 <= (rect.x + rect.w) * gridSize + container.x &&
    rect.y * gridSize + container.y <= height &&
    0 <= (rect.y + rect.h) * gridSize + container.y
  )
}

/**
 * Initialize event listening
 */
function initEvents() {
  // Make stage interactive, so it can listen to events
  app.stage.interactive = true

  // Pointer & touch events are normalized into the `pointer*` events for handling different events
  app.stage
    .on('pointerdown', onPointerDown)
    .on('pointerup', onPointerUp)
    .on('pointerupoutside', onPointerUp)
    .on('pointermove', onPointerMove)
}

/**
 * On pointer down, save coordinates and set pointerDownTarget
 *
 * @param e
 */
function onPointerDown(e) {
  const { x, y } = e.data.global
  pointerDownTarget = 1
  pointerStart.set(x, y)
  pointerDiffStart = uniforms.uPointerDiff.clone()
}

/**
 * On pointer up, set pointerDownTarget
 */
function onPointerUp() {
  pointerDownTarget = 0
}

/**
 * On pointer move, calculate coordinates diff
 *
 * @param e
 */
function onPointerMove(e) {
  const { x, y } = e.data.global
  if (pointerDownTarget) {
    diffX = pointerDiffStart.x + (x - pointerStart.x)
    diffY = pointerDiffStart.y + (y - pointerStart.y)
    diffX =
      diffX > 0
        ? Math.min(diffX, centerX + imagePadding)
        : Math.max(diffX, -(centerX + widthRest))
    diffY =
      diffY > 0
        ? Math.min(diffY, centerY + imagePadding)
        : Math.max(diffY, -(centerY + heightRest))
  }
}

/**
 * Initialize
 */
function init() {
  initDimensions()
  initUniforms()
  initGrid()
  initApp()
  initBackground()
  initContainer()
  initRectsAndImages()
  initEvents()

  // Warm up the pool so the first visible rects get photos immediately
  fetchPhotoBatch()

  // Animation loop, executed on every animation frame
  app.ticker.add(() => {
    // Multiply the values by a coefficient to get a smooth animation
    uniforms.uPointerDown += (pointerDownTarget - uniforms.uPointerDown) * 0.075
    uniforms.uPointerDiff.x += (diffX - uniforms.uPointerDiff.x) * 0.2
    uniforms.uPointerDiff.y += (diffY - uniforms.uPointerDiff.y) * 0.2

    // Set position for the container
    container.x = uniforms.uPointerDiff.x - centerX
    container.y = uniforms.uPointerDiff.y - centerY

    // Check rects and load/cancel images as needed
    checkRectsAndImages()
  })
}

/**
 * Application cleanup
 */
function clean() {
  // Stop the current animation
  app.ticker.stop();

  // Remove event listeners
  app.stage
    .off('pointerdown', onPointerDown)
    .off('pointerup', onPointerUp)
    .off('pointerupoutside', onPointerUp)
    .off('pointermove', onPointerMove)

  // Cancel all pending photo requests
  rects.forEach((rect) => {
    if (rect.discovered && !rect.loaded && !rect.committed) {
      rect.controller.abort()
    }
  });
}

/**
 * On resize, reinit the app (clean and init), but first debounce the calls, so we don't call init too often
 */
let resizeTimer;

function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    clean()
    init()
  }, 200)
}

setTimeout(() => {
  window.addEventListener('resize', onResize)

  init()

  let swapBtn = document.querySelector(".footer__links__swap button");
  let filterDefault = true;

  swapBtn.addEventListener('click', () => {
    if (!view.classList.contains('active')) {
      view.classList.toggle('invert');
    }
  });
}, 5000);
