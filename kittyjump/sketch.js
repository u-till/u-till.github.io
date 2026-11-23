let cat;
let catTexture;
let catTextureMiau;
let floorTexture; // Offscreen buffer for the checkered pattern

// Chicken nugget 3D model and texture
let nuggetModel;
let nuggetTexture;

let miauSound;
let miauIndex = 0;
let miauEndTime = 0;

// Cat position and jump physics
let catY = 0;
let catZ = 0;
let velocityY = 0;
let velocityZ = 0;
let gravity = 0.8;
let jumpVelocityY = -14;
let jumpVelocityZ = 6;
let isJumping = false;
let groundPause = 0; // Frames to rest on the floor between jumps

let groundY = 100; // Cat's resting height
let floorY = 215; // Plane height
let tileSize = 150; // Size of each checker square

// Chicken nuggets array and spacing
let nuggets = [];
let nextNuggetZ = 0;
let jumpDistance = 0;
let nuggetY = 0;

async function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  catY = groundY;

  // Load assets asynchronously (p5.js 2.0 style)
  cat = await loadModel('assets/mcdonalds.obj', true);
  catTexture = await loadImage('assets/texture-flipped.png');
  catTextureMiau = await loadImage('assets/texture-flipped-miau.png');

  // Load chicken nugget model and texture
  nuggetModel = await loadModel('assets/cn.obj', true);
  nuggetTexture = await loadImage('assets/cn-tex.jpg');

  // The OBJ UVs use a top-left origin, so undo p5's V flip to map the textures correctly
  cat.flipV();
  nuggetModel.flipV();

  // The nugget scan has no vertex normals; p5 fills in zero vectors, which renders black under lights
  nuggetModel.computeNormals();

  miauSound = new Audio('assets/miau.mp3');

  // Create a crisp checkered texture image
  let gridCount = 24;
  let texSize = 512;
  let cell = texSize / gridCount;
  floorTexture = createGraphics(texSize, texSize);
  floorTexture.noStroke();

  for (let x = 0; x < gridCount; x++) {
    for (let y = 0; y < gridCount; y++) {
      if ((x + y) % 2 === 0) {
        floorTexture.fill(240);
      } else {
        floorTexture.fill(64);
      }
      floorTexture.rect(x * cell, y * cell, cell, cell);
    }
  }

  // Calculate exact jump spacing and peak height so nuggets line up with every jump
  let framesToPeak = abs(jumpVelocityY) / gravity; // 17.5 frames
  let totalJumpFrames = framesToPeak * 2; // 35 frames per full jump
  jumpDistance = jumpVelocityZ * totalJumpFrames; // 210 units per jump

  let peakY = groundY + jumpVelocityY * framesToPeak + 0.5 * gravity * framesToPeak * framesToPeak;
  nuggetY = peakY - 15; // Adjusted to cat's mouth height

  // First nugget sits at the peak of the very first jump (half a jump distance ahead)
  nextNuggetZ = jumpDistance / 2;
}

function draw() {
  background(200, 64, 64);

  // Safety check so draw() waits until all assets are loaded
  if (!cat || !catTexture || !catTextureMiau || !nuggetModel || !nuggetTexture) return;

  // Stop the current meow slice once it reaches its end timestamp
  if (miauSound && !miauSound.paused && miauSound.currentTime >= miauEndTime) {
    miauSound.pause();
  }

  // 1. Trigger a new jump only after the brief landing pause finishes
  if (mouseIsPressed && !isJumping && groundPause === 0) {
    startJump();
  }

  // Count down the landing pause while on the floor
  if (groundPause > 0) {
    groundPause--;
  }

  // 2. Update jump physics
  if (isJumping) {
    catY += velocityY;
    catZ += velocityZ;
    velocityY += gravity;

    if (catY >= groundY) {
      catY = groundY;
      velocityY = 0;
      velocityZ = 0;
      isJumping = false;
      groundPause = 3; // Stay on the floor for 3 frames so the normal texture is visible
    }
  }

  // Follow camera
  let camDistance = 900;
  let camHeight = 220;
  let camAngle = -25;

  let rad = radians(camAngle);
  let camX = sin(rad) * camDistance;
  let camZ = catZ + cos(rad) * camDistance;

  camera(camX, groundY - camHeight, camZ, 0, groundY, catZ, 0, 1, 0);

  // Lighting
  ambientLight(180);
  directionalLight(255, 255, 255, 0, 1, -1);

  // Draw the checkered ground plane
  let floorSize = tileSize * 24;
  let snappedZ = floor(catZ / (tileSize * 2)) * (tileSize * 2);

  push();
  translate(0, floorY, snappedZ);
  rotateX(HALF_PI);
  noStroke();
  texture(floorTexture);
  plane(floorSize, floorSize);
  pop();

  // Draw the shadow on the ground directly beneath the cat
  let jumpHeight = groundY - catY;
  let shadowScale = constrain(map(jumpHeight, 0, 150, 1, 0.8), 0.8, 1);
  let shadowAlpha = constrain(map(jumpHeight, 0, 150, 90, 25), 25, 90);

  push();
  translate(0, floorY - 0.5, catZ);
  rotateX(HALF_PI);
  scale(shadowScale);
  noStroke();
  fill(0, shadowAlpha);
  ellipse(0, 0, 180, 180);
  pop();

  // 3. Keep spawning nuggets ahead of the camera view so they are already floating there
  while (nextNuggetZ < catZ + 2500) {
    nuggets.push({
      y: nuggetY,
      z: nextNuggetZ,
      scale: 1,
      eaten: false,
      phase: random(TWO_PI),
    });
    nextNuggetZ += jumpDistance;
  }

  // Draw and check collision for Chicken Nuggets
  for (let i = nuggets.length - 1; i >= 0; i--) {
    let n = nuggets[i];

    // Eat the nugget if the cat gets close to it in 3D space
    let d = dist(0, catY, catZ, 0, n.y, n.z);
    if (d < 85) {
      n.eaten = true;
    }

    if (n.eaten) {
      n.scale -= 0.25;
      if (n.scale <= 0) {
        nuggets.splice(i, 1);
        continue;
      }
    }

    // Render the 3D chicken nugget model
    push();
    translate(0, n.y + sin(frameCount * 0.1 + n.phase) * 6, n.z);
    rotateX(PI); // Flip upright to match p5.js WEBGL coordinates (like the cat)
    rotateY(frameCount * 0.05 + n.phase);
    rotateZ(0.3);
    scale(0.35 * n.scale); // Adjust 0.35 if the normalized model needs to be bigger or smaller
    noStroke();
    texture(nuggetTexture);
    model(nuggetModel);
    pop();
  }

  // 4. Draw the cat at catY
  push();
  translate(0, catY, catZ);
  rotateX(PI);
  rotateY(PI);

  noStroke();
  scale(1.2);

  // Use miau texture only while actually in the air above the floor
  if (catY < groundY) {
    texture(catTextureMiau);
  } else {
    texture(catTexture);
  }
  model(cat);
  pop();
}

function startJump() {
  isJumping = true;
  velocityY = jumpVelocityY;
  velocityZ = jumpVelocityZ;

  // Play next meow audio slice
  if (miauSound && miauSound.duration) {
    let totalParts = 5;
    let startOffset = 0.3;

    let activeDuration = miauSound.duration - startOffset;
    let sliceDuration = activeDuration / totalParts;
    let startTime = startOffset + miauIndex * sliceDuration;

    miauSound.currentTime = startTime;
    miauEndTime = startTime + sliceDuration;
    miauSound.play();

    miauIndex = (miauIndex + 1) % totalParts;
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
