const gesturePill = document.getElementById("gesturePill");

const EDGE_GESTURE_START_ZONE_RATIO = 0.28;
const EDGE_GESTURE_START_ZONE_MAX_PX = 140;
const EDGE_GESTURE_LOCK_DISTANCE_PX = 8;
const EDGE_GESTURE_TRIGGER_DISTANCE_PX = 32;
const EDGE_GESTURE_DIRECTION_RATIO = 0.85;

let edgeGestureState = null;
let edgeGestureActionInFlight = false;

function canUseEdgeGestures() {
  if (!gesturePill) return false;
  if (isDesktop || visitorMode) return false;
  if (sidebarOverlay?.classList.contains("open")) return false;
  if (addToolModal && !addToolModal.hidden) return false;
  return true;
}

function isEdgeGestureBlockedTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, label, summary, pre, code, [contenteditable='true']",
    ),
  );
}

function resetGesturePill() {
  if (!gesturePill) return;
  gesturePill.classList.remove("visible", "ready", "left", "right");
  gesturePill.style.removeProperty("--gesture-offset");
  gesturePill.style.removeProperty("--gesture-scale");
}

function showGesturePill(side, progress, distance) {
  if (!gesturePill) return;
  const clampedProgress = Math.max(0, Math.min(progress, 1.25));
  const offset = Math.min(Math.max(distance * 0.22, 0), 18);
  const directionOffset = side === "left" ? offset : -offset;
  const scale = Math.min(1, 0.96 + clampedProgress * 0.06);
  gesturePill.textContent = side === "left" ? "Sessions" : "New Session";
  gesturePill.classList.toggle("left", side === "left");
  gesturePill.classList.toggle("right", side === "right");
  gesturePill.classList.toggle("visible", clampedProgress > 0.05);
  gesturePill.classList.toggle("ready", clampedProgress >= 1);
  gesturePill.style.setProperty("--gesture-offset", `${directionOffset}px`);
  gesturePill.style.setProperty("--gesture-scale", String(scale));
}

function cancelEdgeGesture() {
  edgeGestureState = null;
  resetGesturePill();
}

function getEdgeGestureStartZonePx(viewportWidth) {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return EDGE_GESTURE_START_ZONE_MAX_PX;
  }
  return Math.min(
    EDGE_GESTURE_START_ZONE_MAX_PX,
    Math.max(64, Math.round(viewportWidth * EDGE_GESTURE_START_ZONE_RATIO)),
  );
}

function shouldLockEdgeGesture(deltaX, deltaY, inwardDistance) {
  if (inwardDistance < EDGE_GESTURE_LOCK_DISTANCE_PX) return false;
  return Math.abs(deltaX) >= Math.abs(deltaY) * EDGE_GESTURE_DIRECTION_RATIO;
}

function getEdgeGestureDistance(touch, side) {
  const deltaX = touch.clientX - edgeGestureState.startX;
  return side === "left" ? deltaX : -deltaX;
}

function handleEdgeGestureStart(event) {
  if (!canUseEdgeGestures()) return;
  if (edgeGestureActionInFlight || edgeGestureState) return;
  if (event.touches.length !== 1) return;
  if (isEdgeGestureBlockedTarget(event.target)) return;

  const touch = event.touches[0];
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const startZone = getEdgeGestureStartZonePx(viewportWidth);
  const fromLeftEdge = touch.clientX <= startZone;
  const fromRightEdge = viewportWidth > 0 && touch.clientX >= viewportWidth - startZone;
  if (!fromLeftEdge && !fromRightEdge) return;

  edgeGestureState = {
    side: fromLeftEdge ? "left" : "right",
    startX: touch.clientX,
    startY: touch.clientY,
    locked: false,
    distance: 0,
  };
}

function handleEdgeGestureMove(event) {
  if (!edgeGestureState) return;
  if (event.touches.length !== 1) {
    cancelEdgeGesture();
    return;
  }

  const touch = event.touches[0];
  const deltaX = touch.clientX - edgeGestureState.startX;
  const deltaY = touch.clientY - edgeGestureState.startY;
  const inwardDistance = getEdgeGestureDistance(touch, edgeGestureState.side);
  edgeGestureState.distance = inwardDistance;

  if (!edgeGestureState.locked) {
    if (Math.abs(deltaY) > Math.abs(deltaX) * EDGE_GESTURE_DIRECTION_RATIO) {
      cancelEdgeGesture();
      return;
    }
    if (!shouldLockEdgeGesture(deltaX, deltaY, inwardDistance)) {
      return;
    }
    edgeGestureState.locked = true;
  }

  if (inwardDistance <= 0) {
    resetGesturePill();
    return;
  }

  event.preventDefault();
  showGesturePill(
    edgeGestureState.side,
    inwardDistance / EDGE_GESTURE_TRIGGER_DISTANCE_PX,
    inwardDistance,
  );
}

function handleEdgeGestureEnd(event) {
  if (!edgeGestureState) return;

  const finalTouch = event.changedTouches?.[0] || null;
  if (finalTouch) {
    const deltaX = finalTouch.clientX - edgeGestureState.startX;
    const deltaY = finalTouch.clientY - edgeGestureState.startY;
    const finalDistance = getEdgeGestureDistance(finalTouch, edgeGestureState.side);
    edgeGestureState.distance = finalDistance;
    if (!edgeGestureState.locked && shouldLockEdgeGesture(deltaX, deltaY, finalDistance)) {
      edgeGestureState.locked = true;
    }
  }

  const shouldTrigger =
    edgeGestureState.locked && edgeGestureState.distance >= EDGE_GESTURE_TRIGGER_DISTANCE_PX;
  const side = edgeGestureState.side;
  cancelEdgeGesture();
  if (!shouldTrigger || edgeGestureActionInFlight) return;

  edgeGestureActionInFlight = true;
  const action =
    side === "left"
      ? Promise.resolve(openSessionsSidebar())
      : Promise.resolve(createNewSessionShortcut());

  action.finally(() => {
    edgeGestureActionInFlight = false;
  });
}

document.addEventListener("touchstart", handleEdgeGestureStart, {
  passive: true,
  capture: true,
});
document.addEventListener("touchmove", handleEdgeGestureMove, { passive: false });
document.addEventListener("touchend", handleEdgeGestureEnd, { passive: true });
document.addEventListener("touchcancel", cancelEdgeGesture, { passive: true });
