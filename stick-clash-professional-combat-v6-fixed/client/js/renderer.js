/* global GameMaps, GameConstants */

const Renderer = (() => {
  let canvas = null;
  let ctx = null;

  // ==================================================
  // INTERNAL FIGHTING-GAME RESOLUTION
  // ==================================================

  /*
   * The actual game world is always composed as 16:9.
   *
   * The browser screen can be:
   * 16:9
   * 18:9
   * 19.5:9
   * 20:9
   *
   * The renderer adapts without stretching the fighters.
   */

  const VIEW_W = 1280;
  const VIEW_H = 720;

  const TARGET_ASPECT =
    VIEW_W / VIEW_H;

  /*
   * Lower value = closer camera.
   *
   * 1.0 = normal
   * 1.10 = slightly closer
   * 1.20 = closer
   *
   * We deliberately keep this moderate so fighters
   * remain large without cutting off attacks.
   */

  const CAMERA_ZOOM = 1.12;

  /*
   * Dynamic zoom range.
   *
   * ZOOM_MAX = fighters standing close together
   * (camera pushes in for a tighter, more intense frame).
   *
   * ZOOM_MIN = fighters at max separation
   * (camera eases out so both stay comfortably on screen).
   *
   * Kept close together on purpose so the zoom change is
   * felt but never jarring or "zoomy".
   */

  const ZOOM_MAX = 1.22;
  const ZOOM_MIN = 1.00;

  const ZOOM_NEAR_DISTANCE = 200; // world px: at/below this -> fully zoomed in
  const ZOOM_FAR_DISTANCE = 950;  // world px: at/above this -> fully zoomed out

  const ZOOM_SMOOTHING = 0.05; // slower than pan so zoom never feels twitchy

  // ==================================================
  // CAMERA
  // ==================================================

  // `baseScale` = screen px per world unit at zoom 1.0 (pure device fit,
  // no camera zoom applied). Recomputed on resize.
  let baseScale = 1;
  let canvasW = 0;
  let canvasH = 0;

  let currentZoom = CAMERA_ZOOM;
  let targetZoom = CAMERA_ZOOM;

  let scale = 1;

  let offsetX = 0;
  let offsetY = 0;

  let cameraX = VIEW_W / 2;
  let cameraY = 360;

  let targetCameraX = VIEW_W / 2;

  const CAMERA_SMOOTHING = 0.10;

  // ==================================================
  // EFFECTS
  // ==================================================

  let shakeTime = 0;
  let shakeMag = 0;

  let particles = [];
  let impacts = [];

  const TAU =
    Math.PI * 2;

  // ==================================================
  // INITIALIZATION
  // ==================================================

  function init() {
    canvas =
      document.getElementById(
        'game-canvas'
      );

    if (!canvas) {
      console.error(
        'Stick Clash: #game-canvas not found'
      );

      return;
    }

    ctx =
      canvas.getContext(
        '2d',
        {
          alpha: false
        }
      );

    if (!ctx) {
      console.error(
        'Stick Clash: Canvas 2D context unavailable'
      );

      return;
    }

    /*
     * Improve canvas rendering.
     */

    ctx.imageSmoothingEnabled = true;

    resize();

    window.addEventListener(
      'resize',
      resize
    );

    window.addEventListener(
      'orientationchange',
      resize
    );
  }

  // ==================================================
  // RESPONSIVE CANVAS
  // ==================================================

  function resize() {
    if (!canvas || !ctx) {
      return;
    }

    const dpr =
      Math.min(
        2,
        window.devicePixelRatio || 1
      );

    const screenW =
      Math.max(
        1,
        window.innerWidth
      );

    const screenH =
      Math.max(
        1,
        window.innerHeight
      );

    /*
     * Physical canvas resolution.
     */

    canvas.width =
      Math.floor(
        screenW * dpr
      );

    canvas.height =
      Math.floor(
        screenH * dpr
      );

    canvas.style.width =
      `${screenW}px`;

    canvas.style.height =
      `${screenH}px`;

    /*
     * Reset transform.
     */

    ctx.setTransform(
      1,
      0,
      0,
      1,
      0,
      0
    );

    /*
     * Determine the largest 16:9 area that fits
     * inside the actual screen.
     *
     * This prevents distortion.
     */

    const screenAspect =
      screenW / screenH;

    let renderW;
    let renderH;

    if (
      screenAspect >= TARGET_ASPECT
    ) {
      /*
       * Very wide phone / desktop.
       */

      renderH =
        screenH * dpr;

      renderW =
        renderH *
        TARGET_ASPECT;
    } else {
      /*
       * Narrower display.
       */

      renderW =
        screenW * dpr;

      renderH =
        renderW /
        TARGET_ASPECT;
    }

    /*
     * `renderW`/`renderH` here is the pure device-fit size at
     * zoom 1.0. The actual camera zoom (fixed baseline + dynamic
     * separation-based adjustment) is applied every frame in
     * updateProjection(), not baked in here — otherwise the zoom
     * could never change smoothly without re-running resize().
     */

    baseScale =
      renderW / VIEW_W;

    canvasW = canvas.width;
    canvasH = canvas.height;

    updateProjection();
  }

  // ==================================================
  // PROJECTION (device fit + camera zoom)
  // ==================================================

  function updateProjection() {
    scale =
      baseScale *
      currentZoom;

    const renderW =
      VIEW_W * scale;

    const renderH =
      VIEW_H * scale;

    /*
     * Center the 16:9 game composition.
     */

    offsetX =
      (canvasW - renderW) /
      2;

    offsetY =
      (canvasH - renderH) /
      2;
  }

  // ==================================================
  // CAMERA
  // ==================================================

  function updateCamera(
    map,
    players
  ) {
    if (
      !map ||
      !players ||
      !players.length
    ) {
      targetCameraX =
        map && Number.isFinite(map.width)
          ? map.width * 0.5
          : VIEW_W / 2;

      cameraX +=
        (
          targetCameraX -
          cameraX
        ) *
        CAMERA_SMOOTHING;

      cameraY = 360;

      targetZoom = CAMERA_ZOOM;

      currentZoom +=
        (
          targetZoom -
          currentZoom
        ) *
        ZOOM_SMOOTHING;

      updateProjection();

      return;
    }

    const validPlayers =
      players.filter(
        p =>
          Number.isFinite(p.x) &&
          Number.isFinite(p.y)
      );

    if (!validPlayers.length) {
      return;
    }

    let minX =
      validPlayers[0].x;

    let maxX =
      validPlayers[0].x;

    let sumX = 0;

    for (
      const p of validPlayers
    ) {
      minX =
        Math.min(
          minX,
          p.x
        );

      maxX =
        Math.max(
          maxX,
          p.x
        );

      sumX += p.x;
    }

    const centerX =
      sumX /
      validPlayers.length;

    const distance =
      maxX -
      minX;

    /*
     * The camera normally follows the fighters'
     * midpoint.
     */

    targetCameraX =
      centerX;

    /*
     * Extra space when fighters separate.
     *
     * This keeps both fighters visible during
     * movement instead of suddenly cutting one off.
     */

    if (distance > 300) {
      targetCameraX =
        (minX + maxX) *
        0.5;
    }

    /*
     * Dynamic zoom.
     *
     * Close together -> push in (ZOOM_MAX).
     * Far apart      -> ease out (ZOOM_MIN), so both
     * fighters always stay comfortably framed instead
     * of one getting cut off at the edge.
     *
     * Smoothed separately (and more slowly) than the pan,
     * so it never feels like the camera is "breathing".
     */

    const zoomT =
      Math.max(
        0,
        Math.min(
          1,
          (distance - ZOOM_NEAR_DISTANCE) /
          (ZOOM_FAR_DISTANCE - ZOOM_NEAR_DISTANCE)
        )
      );

    targetZoom =
      ZOOM_MAX +
      (ZOOM_MIN - ZOOM_MAX) *
      zoomT;

    currentZoom +=
      (
        targetZoom -
        currentZoom
      ) *
      ZOOM_SMOOTHING;

    updateProjection();

    /*
     * Camera limits.
     *
     * Because the world is zoomed, calculate the
     * visible world width correctly.
     */

    const visibleWorldWidth =
      VIEW_W /
      scale;

    const halfVisible =
      visibleWorldWidth /
      2;

    /*
     * Keep a little breathing room near map edges.
     */

    const edgePadding = 80;

    const minCamera =
      halfVisible +
      edgePadding;

    const maxCamera =
      Math.max(
        minCamera,
        map.width -
        halfVisible -
        edgePadding
      );

    if (
      Number.isFinite(minCamera) &&
      Number.isFinite(maxCamera)
    ) {
      targetCameraX =
        Math.max(
          minCamera,
          Math.min(
            maxCamera,
            targetCameraX
          )
        );
    }

    /*
     * Smooth camera.
     *
     * This prevents the camera from snapping whenever
     * a fighter takes a step.
     */

    cameraX +=
      (
        targetCameraX -
        cameraX
      ) *
      CAMERA_SMOOTHING;

    /*
     * Stable vertical camera.
     *
     * We intentionally don't follow jumping fighters
     * vertically because that makes a fighting game
     * feel unstable.
     */

    cameraY = 360;
  }

  // ==================================================
  // WORLD -> SCREEN
  // ==================================================

  function worldToScreen(
    x,
    y
  ) {
    return [
      offsetX +
      (
        x -
        cameraX
      ) *
      scale +
      VIEW_W *
      scale /
      2,

      offsetY +
      (
        y -
        cameraY
      ) *
      scale +
      VIEW_H *
      scale /
      2
    ];
  }

  // ==================================================
  // SCREEN -> WORLD
  // ==================================================

  function screenToWorld(
    x,
    y
  ) {
    return [
      cameraX +
      (
        x -
        offsetX -
        VIEW_W *
        scale /
        2
      ) /
      scale,

      cameraY +
      (
        y -
        offsetY -
        VIEW_H *
        scale /
        2
      ) /
      scale
    ];
  }

  // ==================================================
  // CAMERA SHAKE
  // ==================================================

  function shake(
    magnitude,
    duration
  ) {
    shakeMag =
      Math.max(
        shakeMag,
        magnitude
      );

    shakeTime =
      Math.max(
        shakeTime,
        duration
      );
  }

  // ==================================================
  // HIT PARTICLES
  // ==================================================

  function spawnHit(
    x,
    y,
    color,
    big
  ) {
    const amount =
      big
        ? 28
        : 16;

    for (
      let i = 0;
      i < amount;
      i++
    ) {
      const angle =
        Math.random() *
        TAU;

      const speed =
        (
          big
            ? 430
            : 280
        ) *
        (
          0.45 +
          Math.random() *
          0.9
        );

      particles.push({
        x,
        y,

        vx:
          Math.cos(angle) *
          speed,

        vy:
          Math.sin(angle) *
          speed -
          (
            big
              ? 100
              : 35
          ),

        life:
          0.25 +
          Math.random() *
          0.3,

        age: 0,

        color:
          big
            ? '#ffffff'
            : (
              color ||
              '#ffffff'
            ),

        size:
          big
            ? 4
            : 3
      });
    }

    impacts.push({
      x,
      y,

      age: 0,

      life:
        big
          ? 0.34
          : 0.22,

      big
    });

    shake(
      big
        ? 12
        : 5,

      big
        ? 0.13
        : 0.07
    );
  }

  // ==================================================
  // DUST
  // ==================================================

  function spawnDust(
    x,
    y,
    amount = 5
  ) {
    for (
      let i = 0;
      i < amount;
      i++
    ) {
      particles.push({
        x:
          x +
          (
            Math.random() -
            0.5
          ) *
          28,

        y,

        vx:
          (
            Math.random() -
            0.5
          ) *
          100,

        vy:
          -Math.random() *
          75,

        life:
          0.22 +
          Math.random() *
          0.2,

        age: 0,

        color:
          'rgba(80,80,80,.32)',

        size:
          3 +
          Math.random() *
          5
      });
    }
  }

  // ==================================================
  // PARTICLE UPDATE
  // ==================================================

  function updateParticles(
    dt
  ) {
    for (
      const p of particles
    ) {
      p.age += dt;

      p.x +=
        p.vx *
        dt;

      p.y +=
        p.vy *
        dt;

      p.vy +=
        650 *
        dt;

      p.vx *=
        Math.max(
          0,
          1 -
          dt *
          2.4
        );
    }

    particles =
      particles.filter(
        p =>
          p.age <
          p.life
      );

    for (
      const p of impacts
    ) {
      p.age += dt;
    }

    impacts =
      impacts.filter(
        p =>
          p.age <
          p.life
      );
  }

  // ==================================================
  // BACKGROUND
  // ==================================================

  function drawBackground(
    map,
    time
  ) {
    const left =
      offsetX;

    const top =
      offsetY;

    const width =
      VIEW_W *
      scale;

    const height =
      VIEW_H *
      scale;

    /*
     * Bright cinematic background.
     */

    const gradient =
      ctx.createLinearGradient(
        0,
        top,
        0,
        top +
        height
      );

    gradient.addColorStop(
      0,
      '#eef0f1'
    );

    gradient.addColorStop(
      0.45,
      '#d6dade'
    );

    gradient.addColorStop(
      0.72,
      '#b9bec3'
    );

    gradient.addColorStop(
      1,
      '#858b90'
    );

    ctx.fillStyle =
      gradient;

    /*
     * Fill entire physical canvas so no black
     * bars appear.
     */

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    /*
     * Main 16:9 environment.
     */

    ctx.fillStyle =
      gradient;

    ctx.fillRect(
      left,
      top,
      width,
      height
    );

    /*
     * Horizon.
     */

    const [
      ,
      horizon
    ] =
      worldToScreen(
        cameraX,
        600
      );

    ctx.save();

    // ==================================================
    // WALL GRID
    // ==================================================

    const tile =
      Math.max(
        38,
        62 *
        scale
      );

    ctx.strokeStyle =
      'rgba(35,40,44,.09)';

    ctx.lineWidth =
      Math.max(
        1,
        scale
      );

    const visibleLeft =
      left -
      tile;

    const visibleRight =
      left +
      width +
      tile;

    for (
      let x =
        visibleLeft;
      x <=
      visibleRight;
      x += tile
    ) {
      ctx.beginPath();

      ctx.moveTo(
        x,
        top
      );

      ctx.lineTo(
        x,
        horizon -
        90 *
        scale
      );

      ctx.stroke();
    }

    for (
      let y =
        top;
      y <
      horizon -
      90 *
      scale;
      y += tile
    ) {
      ctx.beginPath();

      ctx.moveTo(
        visibleLeft,
        y
      );

      ctx.lineTo(
        visibleRight,
        y
      );

      ctx.stroke();
    }

    // ==================================================
    // BACKGROUND LIGHT
    // ==================================================

    const lightX =
      left +
      width *
      0.5;

    const lightY =
      top +
      height *
      0.25;

    const light =
      ctx.createRadialGradient(
        lightX,
        lightY,
        10 *
        scale,
        lightX,
        lightY,
        450 *
        scale
      );

    light.addColorStop(
      0,
      'rgba(255,255,255,.50)'
    );

    light.addColorStop(
      1,
      'rgba(255,255,255,0)'
    );

    ctx.fillStyle =
      light;

    ctx.fillRect(
      left,
      top,
      width,
      height *
      0.7
    );

    // ==================================================
    // DISTANT STRUCTURES
    // ==================================================

    ctx.fillStyle =
      'rgba(50,55,60,.09)';

    const visibleWorldWidth =
      VIEW_W /
      scale;

    const worldLeft =
      cameraX -
      visibleWorldWidth /
      2;

    const worldRight =
      cameraX +
      visibleWorldWidth /
      2;

    const buildingSpacing =
      160;

    const firstBuilding =
      Math.floor(
        worldLeft /
        buildingSpacing
      ) *
      buildingSpacing;

    for (
      let worldX =
        firstBuilding;
      worldX <=
      worldRight +
      buildingSpacing;
      worldX +=
      buildingSpacing
    ) {
      const index =
        Math.floor(
          worldX /
          buildingSpacing
        );

      const x =
        worldToScreen(
          worldX,
          0
        )[0];

      const buildingHeight =
        (
          70 +
          (
            Math.abs(index) %
            3
          ) *
          35
        ) *
        scale;

      ctx.fillRect(
        x,
        horizon -
        buildingHeight -
        95 *
        scale,
        76 *
        scale,
        buildingHeight
      );

      /*
       * Roof element.
       */

      ctx.fillRect(
        x +
        25 *
        scale,

        horizon -
        buildingHeight -
        125 *
        scale,

        25 *
        scale,

        30 *
        scale
      );
    }

    // ==================================================
    // HORIZON
    // ==================================================

    ctx.strokeStyle =
      'rgba(35,40,44,.14)';

    ctx.lineWidth =
      Math.max(
        1,
        2 *
        scale
      );

    ctx.beginPath();

    ctx.moveTo(
      left,
      horizon -
      95 *
      scale
    );

    ctx.lineTo(
      left +
      width,
      horizon -
      95 *
      scale
    );

    ctx.stroke();

    ctx.restore();
  }

  // ==================================================
  // FLAT FIGHTING GROUND
  // ==================================================

  function drawGround(
    map
  ) {
    const [
      ,
      groundTop
    ] =
      worldToScreen(
        cameraX,
        600
      );

    const groundBottom =
      offsetY +
      VIEW_H *
      scale;

    const left =
      offsetX;

    const width =
      VIEW_W *
      scale;

    /*
     * IMPORTANT:
     *
     * This is one continuous fighting plane.
     *
     * No potholes.
     * No holes.
     * No gaps.
     * No platforms.
     * No sudden drops.
     */

    const groundGradient =
      ctx.createLinearGradient(
        0,
        groundTop,
        0,
        groundBottom
      );

    groundGradient.addColorStop(
      0,
      '#34383b'
    );

    groundGradient.addColorStop(
      0.15,
      '#24272a'
    );

    groundGradient.addColorStop(
      1,
      '#0d0f11'
    );

    ctx.fillStyle =
      groundGradient;

    ctx.fillRect(
      left,
      groundTop,
      width,
      Math.max(
        0,
        groundBottom -
        groundTop +
        4
      )
    );

    /*
     * Main floor edge.
     */

    ctx.strokeStyle =
      'rgba(255,255,255,.15)';

    ctx.lineWidth =
      Math.max(
        1,
        2 *
        scale
      );

    ctx.beginPath();

    ctx.moveTo(
      left,
      groundTop
    );

    ctx.lineTo(
      left +
      width,
      groundTop
    );

    ctx.stroke();

    /*
     * Subtle floor lines.
     */

    ctx.strokeStyle =
      'rgba(255,255,255,.035)';

    ctx.lineWidth =
      Math.max(
        1,
        scale
      );

    const visibleWorldWidth =
      VIEW_W /
      scale;

    const worldLeft =
      cameraX -
      visibleWorldWidth /
      2;

    const worldRight =
      cameraX +
      visibleWorldWidth /
      2;

    const spacing =
      110;

    const first =
      Math.floor(
        worldLeft /
        spacing
      ) *
      spacing;

    const centerX =
      left +
      width /
      2;

    for (
      let worldX =
        first;
      worldX <=
      worldRight +
      spacing;
      worldX +=
      spacing
    ) {
      const x =
        worldToScreen(
          worldX,
          600
        )[0];

      ctx.beginPath();

      ctx.moveTo(
        x,
        groundTop
      );

      ctx.lineTo(
        centerX +
        (
          x -
          centerX
        ) *
        0.62,

        groundBottom
      );

      ctx.stroke();
    }
  }

  // ==================================================
  // LINE HELPER
  // ==================================================

  function drawLine(
    x1,
    y1,
    x2,
    y2,
    width,
    alpha = 1
  ) {
    ctx.save();

    ctx.globalAlpha =
      alpha;

    ctx.strokeStyle =
      '#050505';

    ctx.lineWidth =
      Math.max(
        1,
        width
      );

    ctx.lineCap =
      'round';

    ctx.lineJoin =
      'round';

    ctx.beginPath();

    ctx.moveTo(
      x1,
      y1
    );

    ctx.lineTo(
      x2,
      y2
    );

    ctx.stroke();

    ctx.restore();
  }

  // ==================================================
  // LIMB HELPER
  // ==================================================

  function drawLimb(
    a,
    b,
    c,
    width
  ) {
    drawLine(
      a[0],
      a[1],
      b[0],
      b[1],
      width
    );

    drawLine(
      b[0],
      b[1],
      c[0],
      c[1],
      width *
      0.88
    );
  }

  // ==================================================
  // STICK FIGHTER
  // ==================================================

  function drawStick(
    p,
    time
  ) {
    if (!p) {
      return;
    }

    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y)
    ) {
      return;
    }

    const [
      sx,
      sy
    ] =
      worldToScreen(
        p.x,
        p.y
      );

    /*
     * IMPORTANT:
     *
     * The fighter is intentionally large.
     *
     * This is what makes the game feel like a
     * proper close fighting game rather than
     * tiny characters in a huge arena.
     */

    const S =
      scale;

    const fighterWidth =
      42 *
      S;

    const facing =
      p.facing === -1
        ? -1
        : 1;

    const state =
      p.state ||
      'idle';

    const attackType =
      p.attackType ||
      'punch';

    const attackClock =
      Number.isFinite(
        p.attackClock
      )
        ? p.attackClock
        : 0;

    const crouching =
      !!p.crouching;

    const rolling =
      state ===
      'roll';

    const jumping =
      state ===
      'jump' ||
      !p.onGround;

    const blocking =
      state ===
      'block';

    const hit =
      state ===
      'hitstun';

    const dead =
      state ===
      'dead' ||
      p.lives <= 0;

    const moving =
      Math.abs(
        p.vx || 0
      ) > 25 &&
      p.onGround;

    const low =
      crouching ||
      rolling;

    /*
     * Larger body.
     */

    const bodyHeight =
      (
        low
          ? 68
          : 108
      ) *
      S;

    const centerX =
      sx +
      fighterWidth /
      2;

    const groundY =
      sy +
      bodyHeight;

    // ==================================================
    // ATTACK DEFINITION
    // ==================================================

    let attackDef = null;

    if (
      GameConstants &&
      GameConstants.ATTACKS
    ) {
      attackDef =
        GameConstants.ATTACKS[
        attackType
        ];
    }

    if (!attackDef) {
      attackDef = {
        startup: 0.08,
        active: 0.08,
        recovery: 0.18
      };
    }

    const startup =
      Number.isFinite(
        attackDef.startup
      )
        ? attackDef.startup
        : 0.08;

    const active =
      Number.isFinite(
        attackDef.active
      )
        ? attackDef.active
        : 0.08;

    const recovery =
      Number.isFinite(
        attackDef.recovery
      )
        ? attackDef.recovery
        : 0.18;

    const total =
      startup +
      active +
      recovery;

    const normalized =
      total > 0
        ? Math.max(
          0,
          Math.min(
            1,
            attackClock /
            total
          )
        )
        : 0;

    const isAttackActive =
      attackClock >= startup &&
      attackClock <=
      startup +
      active;

    /*
     * Smooth animation helper.
     */

    const ease =
      (value) => {
        value =
          Math.max(
            0,
            Math.min(
              1,
              value
            )
          );

        return (
          value < 0.5
            ? 2 *
            value *
            value
            : 1 -
            Math.pow(
              -2 *
              value +
              2,
              2
            ) /
            2
        );
      };

    // ==================================================
    // BODY ANIMATION
    // ==================================================

    let bob =
      0;

    if (moving) {
      bob =
        Math.abs(
          Math.sin(
            time *
            10
          )
        ) *
        2 *
        S;
    } else {
      bob =
        Math.sin(
          time *
          2.2
        ) *
        0.5 *
        S;
    }

    if (jumping) {
      bob +=
        Math.sin(
          time *
          7
        ) *
        1.5 *
        S;
    }

    let bodyLean = 0;

    if (hit) {
      bodyLean =
        -0.20 *
        facing;
    }

    if (blocking) {
      bodyLean =
        -0.06 *
        facing;
    }

    if (
      state ===
      'dash'
    ) {
      bodyLean =
        0.15 *
        facing;
    }

    if (rolling) {
      bodyLean =
        0.48 *
        facing;
    }

    if (
      state ===
      'attack'
    ) {
      bodyLean =
        0.08 *
        facing;
    }

    // ==================================================
    // FIGHTER TRANSFORM
    // ==================================================

    ctx.save();

    if (dead) {
      ctx.globalAlpha =
        0.38;
    }

    ctx.translate(
      0,
      bob
    );

    ctx.translate(
      centerX,
      groundY
    );

    ctx.rotate(
      bodyLean
    );

    ctx.translate(
      -centerX,
      -groundY
    );

    // ==================================================
    // GROUND SHADOW
    // ==================================================

    ctx.save();

    ctx.globalAlpha =
      0.34;

    ctx.fillStyle =
      '#000000';

    ctx.beginPath();

    ctx.ellipse(
      centerX,
      groundY +
      5 *
      S,

      34 *
      S,

      7 *
      S,

      0,
      0,
      TAU
    );

    ctx.fill();

    ctx.restore();

    // ==================================================
    // BODY POINTS
    // ==================================================

    const shoulder = [
      centerX,
      sy +
      21 *
      S
    ];

    const hip = [
      centerX,
      groundY -
      bodyHeight *
      0.42
    ];

    const head = [
      centerX,
      sy +
      11 *
      S
    ];

    // ==================================================
    // LEGS
    // ==================================================

    let rearFoot = [
      centerX -
      13 *
      S,

      groundY
    ];

    let frontFoot = [
      centerX +
      13 *
      S,

      groundY
    ];

    const walk =
      moving
        ? Math.sin(
          time *
          10
        ) *
        7 *
        S
        : 0;

    if (moving) {
      rearFoot[1] +=
        Math.max(
          0,
          walk
        );

      frontFoot[1] +=
        Math.max(
          0,
          -walk
        );
    }

    if (jumping) {
      rearFoot = [
        centerX -
        19 *
        S,
        groundY -
        15 *
        S
      ];

      frontFoot = [
        centerX +
        20 *
        S,
        groundY -
        6 *
        S
      ];
    }

    // ==================================================
    // KICK ANIMATION
    // ==================================================

    if (
      state ===
      'attack' &&
      (
        attackType ===
        'kick' ||
        attackType ===
        'heavyKick'
      )
    ) {
      const kickProgress =
        ease(
          normalized
        );

      frontFoot = [
        centerX +
        facing *
        (
          18 +
          52 *
          kickProgress
        ) *
        S,

        groundY -
        (
          Math.sin(
            kickProgress *
            Math.PI
          ) *
          28
        ) *
        S
      ];
    }

    if (rolling) {
      rearFoot = [
        centerX -
        facing *
        20 *
        S,

        groundY -
        3 *
        S
      ];

      frontFoot = [
        centerX +
        facing *
        20 *
        S,

        groundY -
        5 *
        S
      ];
    }

    drawLimb(
      hip,
      [
        centerX -
        10 *
        S,

        hip[1] +
        25 *
        S
      ],
      rearFoot,
      8 *
      S
    );

    drawLimb(
      hip,
      [
        centerX +
        10 *
        S,

        hip[1] +
        25 *
        S
      ],
      frontFoot,
      8 *
      S
    );

    // ==================================================
    // TORSO
    // ==================================================

    drawLine(
      shoulder[0],
      shoulder[1],

      hip[0],
      hip[1],

      10 *
      S
    );

    // ==================================================
    // ARMS
    // ==================================================

    let rearHand = [
      centerX -
      facing *
      17 *
      S,

      shoulder[1] +
      21 *
      S
    ];

    let frontHand = [
      centerX +
      facing *
      17 *
      S,

      shoulder[1] +
      18 *
      S
    ];

    // --------------------------------------------------
    // BLOCK
    // --------------------------------------------------

    if (blocking) {
      frontHand = [
        centerX +
        facing *
        10 *
        S,

        shoulder[1] -
        20 *
        S
      ];

      rearHand = [
        centerX +
        facing *
        2 *
        S,

        shoulder[1] -
        4 *
        S
      ];
    }

    // --------------------------------------------------
    // JUMP
    // --------------------------------------------------

    if (jumping) {
      frontHand = [
        centerX +
        facing *
        27 *
        S,

        shoulder[1] -
        12 *
        S
      ];

      rearHand = [
        centerX -
        facing *
        24 *
        S,

        shoulder[1] -
        2 *
        S
      ];
    }

    // --------------------------------------------------
    // HIT
    // --------------------------------------------------

    if (hit) {
      frontHand = [
        centerX -
        facing *
        9 *
        S,

        shoulder[1] +
        27 *
        S
      ];

      rearHand = [
        centerX -
        facing *
        28 *
        S,

        shoulder[1] +
        9 *
        S
      ];
    }

    // --------------------------------------------------
    // ATTACKS
    // --------------------------------------------------

    if (
      state ===
      'attack'
    ) {
      const progress =
        ease(
          normalized
        );

      if (
        attackType ===
        'punch' ||
        attackType ===
        'airPunch'
      ) {
        frontHand = [
          centerX +
          facing *
          (
            40 +
            8 *
            progress
          ) *
          S,

          shoulder[1] +
          1 *
          S
        ];
      }

      if (
        attackType ===
        'heavy'
      ) {
        frontHand = [
          centerX +
          facing *
          49 *
          S,

          shoulder[1] -
          3 *
          S
        ];
      }

      if (
        attackType ===
        'kick' ||
        attackType ===
        'heavyKick'
      ) {
        frontHand = [
          centerX +
          facing *
          27 *
          S,

          shoulder[1] +
          8 *
          S
        ];

        rearHand = [
          centerX -
          facing *
          21 *
          S,

          shoulder[1] +
          5 *
          S
        ];
      }

      if (
        attackType ===
        'sword'
      ) {
        frontHand = [
          centerX +
          facing *
          20 *
          S,

          shoulder[1] +
          4 *
          S
        ];

        rearHand = [
          centerX -
          facing *
          22 *
          S,

          shoulder[1] -
          2 *
          S
        ];
      }

      if (
        attackType ===
        'dashAttack'
      ) {
        frontHand = [
          centerX +
          facing *
          45 *
          S,

          shoulder[1] -
          1 *
          S
        ];
      }
    }

    // ==================================================
    // REAR ARM
    // ==================================================

    drawLimb(
      shoulder,
      [
        centerX -
        facing *
        6 *
        S,

        shoulder[1] +
        8 *
        S
      ],
      rearHand,
      8 *
      S
    );

    // ==================================================
    // FRONT ARM
    // ==================================================

    drawLimb(
      shoulder,
      [
        centerX +
        facing *
        8 *
        S,

        shoulder[1] +
        6 *
        S
      ],
      frontHand,
      8 *
      S
    );

    // ==================================================
    // SWORD
    // ==================================================

    if (
      attackType ===
      'sword' ||
      p.hasSword ||
      state ===
      'sword'
    ) {
      const hand =
        frontHand;

      let swordAngle =
        facing *
        -0.55;

      let swordLength =
        58 *
        S;

      if (
        state ===
        'attack' &&
        attackType ===
        'sword'
      ) {
        const progress =
          ease(
            normalized
          );

        swordAngle =
          facing *
          (
            -1.30 +
            progress *
            2.35
          );

        swordLength =
          (
            58 +
            62 *
            progress
          ) *
          S;
      }

      const hx =
        hand[0];

      const hy =
        hand[1];

      const tipX =
        hx +
        Math.cos(
          swordAngle
        ) *
        swordLength;

      const tipY =
        hy +
        Math.sin(
          swordAngle
        ) *
        swordLength;

      ctx.save();

      ctx.lineCap =
        'round';

      // Sword shadow
      ctx.strokeStyle =
        'rgba(0,0,0,.22)';

      ctx.lineWidth =
        8 *
        S;

      ctx.beginPath();

      ctx.moveTo(
        hx,
        hy
      );

      ctx.lineTo(
        tipX,
        tipY
      );

      ctx.stroke();

      // Blade
      const bladeGradient =
        ctx.createLinearGradient(
          hx,
          hy,
          tipX,
          tipY
        );

      bladeGradient.addColorStop(
        0,
        '#33373a'
      );

      bladeGradient.addColorStop(
        0.5,
        '#ffffff'
      );

      bladeGradient.addColorStop(
        1,
        '#8d9499'
      );

      ctx.strokeStyle =
        bladeGradient;

      ctx.lineWidth =
        4 *
        S;

      ctx.beginPath();

      ctx.moveTo(
        hx,
        hy
      );

      ctx.lineTo(
        tipX,
        tipY
      );

      ctx.stroke();

      // Guard
      ctx.strokeStyle =
        '#1a1a1a';

      ctx.lineWidth =
        5 *
        S;

      ctx.beginPath();

      ctx.moveTo(
        hx -
        facing *
        6 *
        S,

        hy -
        6 *
        S
      );

      ctx.lineTo(
        hx +
        facing *
        6 *
        S,

        hy +
        6 *
        S
      );

      ctx.stroke();

      // Grip
      ctx.strokeStyle =
        '#111111';

      ctx.lineWidth =
        7 *
        S;

      ctx.beginPath();

      ctx.moveTo(
        hx -
        facing *
        4 *
        S,

        hy -
        facing *
        2 *
        S
      );

      ctx.lineTo(
        hx +
        facing *
        10 *
        S,

        hy +
        facing *
        8 *
        S
      );

      ctx.stroke();

      // Sword slash arc
      if (
        state ===
        'attack' &&
        attackType ===
        'sword' &&
        isAttackActive
      ) {
        ctx.globalAlpha =
          0.9;

        ctx.strokeStyle =
          '#ffffff';

        ctx.lineWidth =
          4 *
          S;

        ctx.beginPath();

        const radius =
          100 *
          S;

        const start =
          facing > 0
            ? -1.20
            : Math.PI +
            0.20;

        const end =
          facing > 0
            ? 0.95
            : Math.PI -
            0.95;

        ctx.arc(
          centerX +
          facing *
          4 *
          S,

          shoulder[1] +
          15 *
          S,

          radius,

          start,
          end,

          facing <
          0
        );

        ctx.stroke();
      }

      ctx.restore();
    }

    // ==================================================
    // HEAD
    // ==================================================

    ctx.fillStyle =
      '#050505';

    ctx.beginPath();

    ctx.arc(
      head[0],
      head[1],

      12 *
      S,

      0,
      TAU
    );

    ctx.fill();

    /*
     * Very subtle edge highlight.
     *
     * This is important because a completely black
     * stickman on a dark background can disappear.
     */

    ctx.strokeStyle =
      'rgba(255,255,255,.30)';

    ctx.lineWidth =
      Math.max(
        1,
        1.2 *
        S
      );

    ctx.beginPath();

    ctx.arc(
      head[0] -
      1 *
      S,

      head[1] -
      1 *
      S,

      10 *
      S,

      Math.PI *
      1.03,

      Math.PI *
      1.62
    );

    ctx.stroke();

    // ==================================================
    // ATTACK TRAIL
    // ==================================================

    if (
      state ===
      'attack' &&
      isAttackActive
    ) {
      ctx.save();

      ctx.globalAlpha =
        0.72;

      ctx.strokeStyle =
        '#ffffff';

      ctx.lineWidth =
        3 *
        S;

      ctx.lineCap =
        'round';

      const trailX =
        centerX +
        facing *
        55 *
        S;

      let trailY =
        shoulder[1];

      if (
        attackType ===
        'kick' ||
        attackType ===
        'heavyKick'
      ) {
        trailY =
          shoulder[1] +
          22 *
          S;
      }

      if (
        attackType ===
        'sword'
      ) {
        trailY =
          shoulder[1] +
          10 *
          S;
      }

      ctx.beginPath();

      ctx.moveTo(
        trailX -
        facing *
        32 *
        S,

        trailY +
        10 *
        S
      );

      ctx.quadraticCurveTo(
        trailX -
        facing *
        8 *
        S,

        trailY -
        8 *
        S,

        trailX +
        facing *
        10 *
        S,

        trailY
      );

      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();

    // ==================================================
    // MOVEMENT DUST
    // ==================================================

    if (
      (
        moving ||
        rolling
      ) &&
      Math.random() <
      0.12
    ) {
      spawnDust(
        p.x,
        p.y +
        bodyHeight /
        S,

        rolling
          ? 3
          : 2
      );
    }

    // ==================================================
    // PLAYER NAME
    // ==================================================

    ctx.save();

    ctx.font =
      `600 ${12 * S}px Rubik, sans-serif`;

    ctx.fillStyle =
      'rgba(15,15,15,.82)';

    ctx.textAlign =
      'center';

    ctx.fillText(
      p.name ||
      'Player',

      centerX,

      sy -
      18 *
      S
    );

    ctx.restore();
  }

  // ==================================================
  // IMPACTS
  // ==================================================

  function drawImpacts() {
    for (
      const impact of impacts
    ) {
      const [
        x,
        y
      ] =
        worldToScreen(
          impact.x,
          impact.y
        );

      const progress =
        impact.age /
        impact.life;

      const radius =
        (
          12 +
          54 *
          progress
        ) *
        (
          impact.big
            ? 1.25
            : 1
        ) *
        scale;

      ctx.save();

      ctx.globalAlpha =
        Math.max(
          0,
          1 -
          progress
        );

      ctx.strokeStyle =
        '#ffffff';

      ctx.lineWidth =
        Math.max(
          1,
          3 *
          scale
        );

      ctx.beginPath();

      ctx.arc(
        x,
        y,
        radius,
        0,
        TAU
      );

      ctx.stroke();

      for (
        let i = 0;
        i < 8;
        i++
      ) {
        const angle =
          i *
          TAU /
          8;

        ctx.beginPath();

        ctx.moveTo(
          x +
          Math.cos(
            angle
          ) *
          radius *
          0.45,

          y +
          Math.sin(
            angle
          ) *
          radius *
          0.45
        );

        ctx.lineTo(
          x +
          Math.cos(
            angle
          ) *
          radius *
          1.4,

          y +
          Math.sin(
            angle
          ) *
          radius *
          1.4
        );

        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ==================================================
  // PARTICLES
  // ==================================================

  function drawParticles() {
    for (
      const particle of particles
    ) {
      const [
        x,
        y
      ] =
        worldToScreen(
          particle.x,
          particle.y
        );

      const alpha =
        Math.max(
          0,
          1 -
          particle.age /
          particle.life
        );

      ctx.save();

      ctx.globalAlpha =
        alpha;

      ctx.fillStyle =
        particle.color;

      ctx.beginPath();

      ctx.arc(
        x,
        y,

        Math.max(
          1,
          particle.size *
          scale *
          alpha
        ),

        0,
        TAU
      );

      ctx.fill();

      ctx.restore();
    }
  }

  // ==================================================
  // DEBUG
  // ==================================================

  function drawDebugBoxes(
    map,
    players
  ) {
    for (
      const p of players
    ) {
      const [
        x,
        y
      ] =
        worldToScreen(
          p.x,
          p.y
        );

      ctx.save();

      ctx.strokeStyle =
        'rgba(0,120,130,.8)';

      ctx.lineWidth =
        1;

      ctx.strokeRect(
        x,
        y,

        42 *
        scale,

        (
          p.crouching
            ? 68
            : 108
        ) *
        scale
      );

      ctx.restore();
    }
  }

  // ==================================================
  // MAIN DRAW
  // ==================================================

  function draw(
    mapId,
    players,
    time,
    dt,
    debugOn
  ) {
    if (
      !ctx ||
      !canvas
    ) {
      return;
    }

    const map =
      GameMaps.getMap(
        mapId
      );

    if (!map) {
      return;
    }

    /*
     * Protect against bad frame times.
     */

    dt =
      Math.max(
        0,
        Math.min(
          0.1,
          Number(dt) || 0
        )
      );

    updateCamera(
      map,
      players || []
    );

    updateParticles(
      dt
    );

    /*
     * Clear physical canvas.
     */

    ctx.setTransform(
      1,
      0,
      0,
      1,
      0,
      0
    );

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.save();

    // ==================================================
    // CAMERA SHAKE
    // ==================================================

    if (
      shakeTime > 0
    ) {
      shakeTime -=
        dt;

      const fade =
        Math.max(
          0,
          shakeTime /
          0.15
        );

      ctx.translate(
        (
          Math.random() -
          0.5
        ) *
        shakeMag *
        fade,

        (
          Math.random() -
          0.5
        ) *
        shakeMag *
        fade
      );

      if (
        shakeTime <=
        0
      ) {
        shakeTime = 0;
        shakeMag = 0;
      }
    }

    // ==================================================
    // BACKGROUND
    // ==================================================

    drawBackground(
      map,
      time
    );

    // ==================================================
    // FLAT GROUND
    // ==================================================

    drawGround(
      map
    );

    // ==================================================
    // FIGHTERS
    // ==================================================

    for (
      const player of
      players || []
    ) {
      drawStick(
        player,
        time
      );
    }

    // ==================================================
    // COMBAT EFFECTS
    // ==================================================

    drawImpacts();

    drawParticles();

    // ==================================================
    // DEBUG
    // ==================================================

    if (debugOn) {
      drawDebugBoxes(
        map,
        players || []
      );
    }

    ctx.restore();
  }

  // ==================================================
  // PUBLIC API
  // ==================================================

  return {
    init,
    draw,
    shake,
    spawnHit,
    screenToWorld
  };
})();