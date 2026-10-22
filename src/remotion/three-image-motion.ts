import {FRAMES_PER_SEQUENCE_IMAGE} from '@/lib/video-config';
import {createRandom} from '@/lib/random';

type Point = {x: number; y: number};

function createBoundedRoute(seed: number) {
  const random = createRandom(seed);
  const outward: Point[] = [{x: 0, y: 0}];
  while (outward.length < 3) {
    const previous = outward[outward.length - 1];
    let candidate: Point = {x: 0, y: 0};
    for (let attempt = 0; attempt < 12; attempt++) {
      candidate = {x: random() * 1.64 - 0.82, y: random() * 1.64 - 0.82};
      if (Math.hypot(candidate.x - previous.x, candidate.y - previous.y) >= 0.58) break;
    }
    outward.push(candidate);
  }
  return [...outward, ...outward.slice(1, -1).reverse(), outward[0]];
}

export function getThreeImageMotion(
  frame: number,
  speed: number,
  amplitude: number,
  width: number,
  height: number,
  seed = 1,
) {
  const safeSpeed = Math.min(1.2, Math.max(0.3, speed));
  const safeAmplitude = Math.min(0.15, Math.max(0.01, amplitude));
  const route = createBoundedRoute(seed);
  const segmentCount = route.length - 1;
  const routeProgress = Math.max(0, frame) / FRAMES_PER_SEQUENCE_IMAGE * safeSpeed * segmentCount;
  const segmentIndex = Math.floor(routeProgress) % segmentCount;
  const segmentProgress = routeProgress - Math.floor(routeProgress);
  const from = route[segmentIndex];
  const to = route[segmentIndex + 1];
  const positionX = from.x + (to.x - from.x) * segmentProgress;
  const positionY = from.y + (to.y - from.y) * segmentProgress;
  const scale = 1.04 + ((safeAmplitude - 0.01) / 0.14) * 0.3;

  return {
    imageIndex: Math.min(2, Math.max(0, Math.floor(frame / FRAMES_PER_SEQUENCE_IMAGE))),
    translateX: positionX * width * safeAmplitude,
    translateY: positionY * height * safeAmplitude,
    scale,
  };
}
