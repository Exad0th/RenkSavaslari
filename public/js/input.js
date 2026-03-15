// Input module - Mouse & keyboard handling with full camera controls
const Input = (() => {
  let canvas;
  let isSelecting = false;
  let selectionStart = { x: 0, y: 0 };
  let selectionEnd = { x: 0, y: 0 };
  let isDraggingCamera = false;
  let lastMouse = { x: 0, y: 0 };
  let onSelectCallback = null;
  let onMoveCallback = null;
  let onSelectAllCallback = null;
  let chatFocused = false;

  // Camera movement keys state
  const keysDown = new Set();
  const CAMERA_SPEED = 8; // pixels per frame at zoom=1
  const EDGE_SCROLL_MARGIN = 30; // pixels from edge
  const EDGE_SCROLL_SPEED = 6;
  let mouseScreenPos = { x: 0, y: 0 };

  function init(canvasEl) {
    canvas = canvasEl;

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', handleWheel);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
  }

  function setCallbacks(onSelect, onMove, onSelectAll) {
    onSelectCallback = onSelect;
    onMoveCallback = onMove;
    onSelectAllCallback = onSelectAll;
  }

  function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (e.button === 0) {
      // Left click - start selection
      isSelecting = true;
      selectionStart = { x: sx, y: sy };
      selectionEnd = { x: sx, y: sy };
    } else if (e.button === 1) {
      // Middle click - camera drag
      isDraggingCamera = true;
      lastMouse = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    } else if (e.button === 2) {
      // Right click - move command
      const world = Renderer.screenToWorld(sx, sy);
      if (onMoveCallback) onMoveCallback(world.x, world.y);
    }
  }

  function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    mouseScreenPos = { x: sx, y: sy };

    if (isSelecting) {
      selectionEnd = { x: sx, y: sy };
    }

    if (isDraggingCamera) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      const cam = Renderer.getCamera();
      Renderer.setCamera(cam.x - dx / cam.zoom, cam.y - dy / cam.zoom, cam.zoom);
      lastMouse = { x: e.clientX, y: e.clientY };
    }
  }

  function handleMouseUp(e) {
    if (e.button === 0 && isSelecting) {
      isSelecting = false;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      selectionEnd = { x: sx, y: sy };

      // Convert to world coordinates
      const w1 = Renderer.screenToWorld(selectionStart.x, selectionStart.y);
      const w2 = Renderer.screenToWorld(selectionEnd.x, selectionEnd.y);

      const additive = e.shiftKey;

      if (onSelectCallback) {
        onSelectCallback(
          Math.min(w1.x, w2.x),
          Math.min(w1.y, w2.y),
          Math.max(w1.x, w2.x),
          Math.max(w1.y, w2.y),
          additive
        );
      }
    }

    if (e.button === 1) {
      isDraggingCamera = false;
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    const cam = Renderer.getCamera();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.3, Math.min(3, cam.zoom * zoomFactor));
    Renderer.setCamera(cam.x, cam.y, newZoom);
  }

  function handleKeyDown(e) {
    if (chatFocused) return; // Don't process game keys when typing in chat

    if (e.ctrlKey && e.key === 'a') {
      e.preventDefault();
      if (onSelectAllCallback) onSelectAllCallback();
      return;
    }

    // Prevent scrolling with arrow keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }

    keysDown.add(e.key.toLowerCase());
  }

  function handleKeyUp(e) {
    keysDown.delete(e.key.toLowerCase());
  }

  // Called every frame from game loop to move camera smoothly
  function updateCamera() {
    const cam = Renderer.getCamera();
    let dx = 0, dy = 0;
    const speed = CAMERA_SPEED / cam.zoom;

    // WASD + Arrow keys only
    if (keysDown.has('w') || keysDown.has('arrowup')) dy -= speed;
    if (keysDown.has('s') || keysDown.has('arrowdown')) dy += speed;
    if (keysDown.has('a') || keysDown.has('arrowleft')) dx -= speed;
    if (keysDown.has('d') || keysDown.has('arrowright')) dx += speed;

    if (dx !== 0 || dy !== 0) {
      Renderer.setCamera(cam.x + dx, cam.y + dy, cam.zoom);
    }
  }

  function getSelectionBox() {
    if (!isSelecting) return null;
    return {
      x1: selectionStart.x,
      y1: selectionStart.y,
      x2: selectionEnd.x,
      y2: selectionEnd.y,
    };
  }

  function setChatFocused(val) {
    chatFocused = val;
    if (val) keysDown.clear();
  }

  return {
    init,
    setCallbacks,
    getSelectionBox,
    updateCamera,
    setChatFocused,
  };
})();
