const Input = (() => {
  const state = {
    left: false,
    right: false,
    up: false,
    down: false,

    punch: false,
    kick: false,
    heavy: false,
    sword: false,

    dash: false,
    roll: false,
    block: false
  };

  // ==================================================
  // KEYBOARD
  // ==================================================

  const KEY_MAP = {
    ArrowLeft: 'left',
    KeyA: 'left',

    ArrowRight: 'right',
    KeyD: 'right',

    ArrowUp: 'up',
    KeyW: 'up',
    Space: 'up',

    ArrowDown: 'down',
    KeyS: 'down',

    KeyJ: 'punch',
    KeyK: 'kick',
    KeyL: 'heavy',
    KeyU: 'sword',

    ShiftLeft: 'block',
    ShiftRight: 'block',

    KeyE: 'dash',
    KeyQ: 'roll'
  };

  let active = false;

  // ==================================================
  // MOBILE POINTER SYSTEM
  // ==================================================

  const pointers = new Map();

  let joystickPointerId = null;

  let joystickBase = null;
  let joystickKnob = null;

  let joystickCenterX = 0;
  let joystickCenterY = 0;
  let joystickMaxRadius = 50;

  const JOYSTICK_DEADZONE = 0.14;

  // ==================================================
  // ATTACK PULSE TIMERS
  // ==================================================

  const pulseTimers = new Map();

  const PULSE_TIME = 95;

  // ==================================================
  // CONTROL ELEMENTS
  // ==================================================

  const BUTTONS = {
    punch: 't-punch',
    kick: 't-kick',
    sword: 't-sword',
    block: 't-block',
    dash: 't-dash'
  };

  // ==================================================
  // KEYBOARD
  // ==================================================

  function onKeyDown(e) {
    if (!active) return;

    const action = KEY_MAP[e.code];

    if (!action) return;

    e.preventDefault();

    state[action] = true;
  }

  function onKeyUp(e) {
    const action = KEY_MAP[e.code];

    if (!action) return;

    e.preventDefault();

    state[action] = false;
  }

  // ==================================================
  // JOYSTICK
  // ==================================================

  function updateJoystickGeometry() {
    if (!joystickBase) return;

    const rect =
      joystickBase.getBoundingClientRect();

    joystickCenterX =
      rect.left + rect.width / 2;

    joystickCenterY =
      rect.top + rect.height / 2;

    joystickMaxRadius =
      Math.max(
        20,
        rect.width * 0.36
      );
  }

  function moveJoystick(clientX, clientY) {
    if (!joystickBase || !joystickKnob) {
      return;
    }

    updateJoystickGeometry();

    let dx =
      clientX -
      joystickCenterX;

    let dy =
      clientY -
      joystickCenterY;

    const distance =
      Math.hypot(dx, dy);

    if (
      distance >
      joystickMaxRadius
    ) {
      dx =
        (dx / distance) *
        joystickMaxRadius;

      dy =
        (dy / distance) *
        joystickMaxRadius;
    }

    joystickKnob.style.transform =
      `translate3d(${dx}px, ${dy}px, 0)`;

    const normalizedX =
      dx /
      joystickMaxRadius;

    const normalizedY =
      dy /
      joystickMaxRadius;

    state.left =
      normalizedX <
      -JOYSTICK_DEADZONE;

    state.right =
      normalizedX >
      JOYSTICK_DEADZONE;

    state.up =
      normalizedY <
      -JOYSTICK_DEADZONE;

    state.down =
      normalizedY >
      JOYSTICK_DEADZONE;
  }

  function resetJoystick() {
    joystickPointerId = null;

    state.left = false;
    state.right = false;
    state.up = false;
    state.down = false;

    if (joystickKnob) {
      joystickKnob.style.transform =
        'translate3d(0, 0, 0)';
    }
  }

  function initJoystick() {
    joystickBase =
      document.querySelector(
        '.joystick-base'
      );

    joystickKnob =
      document.getElementById(
        'joystick-knob'
      );

    if (
      !joystickBase ||
      !joystickKnob
    ) {
      return;
    }

    joystickBase.style.touchAction =
      'none';

    function down(e) {
      if (!active) return;

      e.preventDefault();
      e.stopPropagation();

      if (
        joystickPointerId !== null
      ) {
        return;
      }

      joystickPointerId =
        e.pointerId;

      pointers.set(
        e.pointerId,
        {
          type: 'joystick'
        }
      );

      try {
        joystickBase.setPointerCapture(
          e.pointerId
        );
      } catch (_) { }

      moveJoystick(
        e.clientX,
        e.clientY
      );
    }

    function move(e) {
      if (
        e.pointerId !==
        joystickPointerId
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      moveJoystick(
        e.clientX,
        e.clientY
      );
    }

    function up(e) {
      if (
        e.pointerId !==
        joystickPointerId
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      pointers.delete(
        e.pointerId
      );

      resetJoystick();
    }

    joystickBase.addEventListener(
      'pointerdown',
      down,
      {
        passive: false
      }
    );

    joystickBase.addEventListener(
      'pointermove',
      move,
      {
        passive: false
      }
    );

    joystickBase.addEventListener(
      'pointerup',
      up,
      {
        passive: false
      }
    );

    joystickBase.addEventListener(
      'pointercancel',
      up,
      {
        passive: false
      }
    );

    joystickBase.addEventListener(
      'lostpointercapture',
      up,
      {
        passive: false
      }
    );
  }

  // ==================================================
  // COMBAT BUTTONS
  // ==================================================

  function clearPulse(action) {
    const timer =
      pulseTimers.get(action);

    if (timer) {
      clearTimeout(timer);
      pulseTimers.delete(action);
    }

    state[action] = false;

    const id =
      BUTTONS[action];

    const button =
      document.getElementById(id);

    if (button) {
      button.classList.remove(
        'active'
      );
    }
  }

  function pulse(action, button) {
    /*
     * Cancel previous pulse.
     *
     * This allows very fast repeated
     * attacks without stale timers.
     */

    const oldTimer =
      pulseTimers.get(action);

    if (oldTimer) {
      clearTimeout(oldTimer);
    }

    state[action] = true;

    button.classList.add(
      'active'
    );

    const timer =
      setTimeout(() => {
        state[action] = false;

        pulseTimers.delete(
          action
        );

        /*
         * Only remove visual state if
         * another finger isn't pressing it.
         */

        const stillHeld =
          [...pointers.values()]
            .some(
              p =>
                p.type === 'button' &&
                p.action === action
            );

        if (!stillHeld) {
          button.classList.remove(
            'active'
          );
        }
      }, PULSE_TIME);

    pulseTimers.set(
      action,
      timer
    );
  }

  function pressButton(
    action,
    button,
    pointerId
  ) {
    if (!active) return;

    if (
      pointers.has(pointerId)
    ) {
      return;
    }

    pointers.set(
      pointerId,
      {
        type: 'button',
        action
      }
    );

    try {
      button.setPointerCapture(
        pointerId
      );
    } catch (_) { }

    /*
     * BLOCK is held.
     */

    if (action === 'block') {
      state.block = true;

      button.classList.add(
        'active'
      );

      return;
    }

    /*
     * All other mobile combat
     * buttons are attack pulses.
     */

    pulse(
      action,
      button
    );
  }

  function releaseButton(
    action,
    button,
    pointerId
  ) {
    pointers.delete(
      pointerId
    );

    if (
      action === 'block'
    ) {
      const anotherBlockFinger =
        [...pointers.values()]
          .some(
            p =>
              p.type === 'button' &&
              p.action === 'block'
          );

      if (!anotherBlockFinger) {
        state.block = false;

        button.classList.remove(
          'active'
        );
      }

      return;
    }

    /*
     * Attack pulses naturally expire.
     *
     * If the pulse has already ended,
     * make sure the button isn't stuck.
     */

    const stillPressed =
      [...pointers.values()]
        .some(
          p =>
            p.type === 'button' &&
            p.action === action
        );

    if (
      !stillPressed &&
      !state[action]
    ) {
      button.classList.remove(
        'active'
      );
    }
  }

  function cancelButton(
    action,
    button,
    pointerId
  ) {
    pointers.delete(
      pointerId
    );

    if (
      action === 'block'
    ) {
      state.block = false;
    }

    const stillPressed =
      [...pointers.values()]
        .some(
          p =>
            p.type === 'button' &&
            p.action === action
        );

    if (!stillPressed) {
      button.classList.remove(
        'active'
      );
    }
  }

  function bindButton(
    elementId,
    action
  ) {
    const button =
      document.getElementById(
        elementId
      );

    if (!button) return;

    button.style.touchAction =
      'none';

    button.addEventListener(
      'pointerdown',
      e => {
        e.preventDefault();
        e.stopPropagation();

        pressButton(
          action,
          button,
          e.pointerId
        );
      },
      {
        passive: false
      }
    );

    button.addEventListener(
      'pointerup',
      e => {
        e.preventDefault();
        e.stopPropagation();

        releaseButton(
          action,
          button,
          e.pointerId
        );
      },
      {
        passive: false
      }
    );

    button.addEventListener(
      'pointercancel',
      e => {
        e.preventDefault();
        e.stopPropagation();

        cancelButton(
          action,
          button,
          e.pointerId
        );
      },
      {
        passive: false
      }
    );

    button.addEventListener(
      'lostpointercapture',
      e => {
        cancelButton(
          action,
          button,
          e.pointerId
        );
      },
      {
        passive: false
      }
    );

    /*
     * Prevent browser-generated click
     * from doing anything.
     */

    button.addEventListener(
      'click',
      e => {
        if (active) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      {
        passive: false
      }
    );
  }

  // ==================================================
  // MOBILE CONTROL SETUP
  // ==================================================

  function setupMobileControls() {
    const controls =
      document.getElementById(
        'touch-controls'
      );

    if (!controls) return;

    const touchDevice =
      navigator.maxTouchPoints > 0 ||
      'ontouchstart' in window;

    if (touchDevice) {
      controls.classList.remove(
        'hidden'
      );
    }
  }

  // ==================================================
  // TOUCH SAFETY
  // ==================================================

  function setupTouchSafety() {
    /*
     * Do NOT globally block every touch.
     *
     * That can interfere with menu
     * inputs and buttons.
     *
     * Only block browser gestures while
     * an actual fighting match is active.
     */

    document.addEventListener(
      'contextmenu',
      e => {
        if (active) {
          e.preventDefault();
        }
      },
      {
        passive: false
      }
    );

    document.addEventListener(
      'gesturestart',
      e => {
        if (active) {
          e.preventDefault();
        }
      },
      {
        passive: false
      }
    );

    document.addEventListener(
      'gesturechange',
      e => {
        if (active) {
          e.preventDefault();
        }
      },
      {
        passive: false
      }
    );

    document.addEventListener(
      'gestureend',
      e => {
        if (active) {
          e.preventDefault();
        }
      },
      {
        passive: false
      }
    );
  }

  // ==================================================
  // ORIENTATION
  // ==================================================

  function updateOrientation() {
    const width =
      window.innerWidth;

    const height =
      window.innerHeight;

    const portrait =
      height > width;

    document.documentElement
      .classList.toggle(
        'game-portrait',
        portrait
      );

    document.documentElement
      .classList.toggle(
        'game-landscape',
        !portrait
      );

    window.dispatchEvent(
      new CustomEvent(
        'stickclashorientation',
        {
          detail: {
            portrait,
            landscape: !portrait
          }
        }
      )
    );
  }

  // ==================================================
  // RESET
  // ==================================================

  function resetAll() {
    Object.keys(state)
      .forEach(
        key => {
          state[key] = false;
        }
      );

    pulseTimers.forEach(
      timer => {
        clearTimeout(timer);
      }
    );

    pulseTimers.clear();

    pointers.clear();

    resetJoystick();

    document
      .querySelectorAll(
        '.tbtn.active'
      )
      .forEach(
        button => {
          button.classList.remove(
            'active'
          );
        }
      );
  }

  // ==================================================
  // ACTIVE STATE
  // ==================================================

  function setActive(value) {
    active = !!value;

    if (!active) {
      resetAll();
    }
  }

  // ==================================================
  // SNAPSHOT
  // ==================================================

  function snapshot() {
    return {
      left: !!state.left,
      right: !!state.right,
      up: !!state.up,
      down: !!state.down,

      punch: !!state.punch,
      kick: !!state.kick,
      heavy: !!state.heavy,
      sword: !!state.sword,

      dash: !!state.dash,
      roll: !!state.roll,
      block: !!state.block
    };
  }

  // ==================================================
  // CONTROL CUSTOMIZATION
  // ==================================================

  const STORAGE_KEY =
    'stickclash-mobile-controls-v2';

  const defaultLayout = {
    joystick: {
      x: 6,
      y: 72,
      size: 138
    },

    punch: {
      x: 84,
      y: 67,
      size: 68
    },

    kick: {
      x: 76,
      y: 76,
      size: 68
    },

    sword: {
      x: 84,
      y: 83,
      size: 68
    },

    block: {
      x: 76,
      y: 91,
      size: 68
    },

    dash: {
      x: 84,
      y: 92,
      size: 68
    }
  };

  let controlLayout =
    loadControlLayout();

  function loadControlLayout() {
    try {
      const saved =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (!saved) {
        return structuredClone(
          defaultLayout
        );
      }

      const parsed =
        JSON.parse(saved);

      return mergeLayout(
        structuredClone(
          defaultLayout
        ),
        parsed
      );
    } catch (_) {
      return structuredClone(
        defaultLayout
      );
    }
  }

  function mergeLayout(
    base,
    saved
  ) {
    if (
      !saved ||
      typeof saved !== 'object'
    ) {
      return base;
    }

    Object.keys(base)
      .forEach(
        control => {
          if (
            saved[control] &&
            typeof saved[control] ===
            'object'
          ) {
            if (
              Number.isFinite(
                saved[control].x
              )
            ) {
              base[control].x =
                saved[control].x;
            }

            if (
              Number.isFinite(
                saved[control].y
              )
            ) {
              base[control].y =
                saved[control].y;
            }

            if (
              Number.isFinite(
                saved[control].size
              )
            ) {
              base[control].size =
                saved[control].size;
            }
          }
        }
      );

    return base;
  }

  function saveControlLayout() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          controlLayout
        )
      );
    } catch (_) { }
  }

  function applyControlLayout() {
    const root =
      document.documentElement;

    if (!root) return;

    const joystick =
      controlLayout.joystick;

    root.style.setProperty(
      '--joystick-size',
      `${joystick.size}px`
    );

    root.style.setProperty(
      '--joystick-base-size',
      `${Math.round(
        joystick.size * 0.78
      )}px`
    );

    root.style.setProperty(
      '--joystick-knob-size',
      `${Math.round(
        joystick.size * 0.45
      )}px`
    );

    root.style.setProperty(
      '--button-size',
      `${controlLayout.punch.size}px`
    );
  }

  function getControlLayout() {
    return structuredClone(
      controlLayout
    );
  }

  function setControlPosition(
    control,
    x,
    y
  ) {
    if (
      !controlLayout[control]
    ) {
      return;
    }

    controlLayout[control].x =
      Math.max(
        0,
        Math.min(
          100,
          Number(x) || 0
        )
      );

    controlLayout[control].y =
      Math.max(
        0,
        Math.min(
          100,
          Number(y) || 0
        )
      );

    saveControlLayout();
  }

  function setControlSize(
    control,
    size
  ) {
    if (
      !controlLayout[control]
    ) {
      return;
    }

    controlLayout[control].size =
      Math.max(
        50,
        Math.min(
          180,
          Number(size) || 68
        )
      );

    saveControlLayout();

    applyControlLayout();
  }

  function resetControlLayout() {
    controlLayout =
      structuredClone(
        defaultLayout
      );

    saveControlLayout();

    applyControlLayout();
  }

  // ==================================================
  // INITIALIZATION
  // ==================================================

  function init() {
    window.addEventListener(
      'keydown',
      onKeyDown,
      {
        passive: false
      }
    );

    window.addEventListener(
      'keyup',
      onKeyUp,
      {
        passive: false
      }
    );

    bindButton(
      't-punch',
      'punch'
    );

    bindButton(
      't-kick',
      'kick'
    );

    bindButton(
      't-sword',
      'sword'
    );

    bindButton(
      't-block',
      'block'
    );

    bindButton(
      't-dash',
      'dash'
    );

    initJoystick();

    setupMobileControls();

    setupTouchSafety();

    applyControlLayout();

    updateOrientation();

    window.addEventListener(
      'resize',
      () => {
        updateOrientation();
        updateJoystickGeometry();
      }
    );

    window.addEventListener(
      'orientationchange',
      () => {
        setTimeout(() => {
          updateOrientation();
          updateJoystickGeometry();
        }, 100);
      }
    );

    /*
     * If the browser loses the page,
     * never leave a control stuck.
     */

    window.addEventListener(
      'blur',
      resetAll
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (
          document.hidden
        ) {
          resetAll();
        }
      }
    );
  }

  // ==================================================
  // PUBLIC API
  // ==================================================

  return {
    init,
    setActive,
    snapshot,

    getControlLayout,
    setControlPosition,
    setControlSize,
    resetControlLayout
  };
})();