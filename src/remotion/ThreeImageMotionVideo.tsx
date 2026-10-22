import React from 'react';
import {AbsoluteFill, Audio, Img, useCurrentFrame} from 'remotion';
import {THREE_IMAGE_DURATION_IN_FRAMES} from '@/lib/video-config';
import {getThreeImageMotion} from './three-image-motion';
import type {ThreeImageMotionVideoProps} from './types';

export const ThreeImageMotionVideo: React.FC<ThreeImageMotionVideoProps> = (props) => {
  const frame = useCurrentFrame();
  const motion = getThreeImageMotion(frame, props.motionSpeed, props.motionAmplitude, props.width, props.height, props.motionSeed);
  const imageSrc = props.imageSrcs[motion.imageIndex];
  const transform = `translate3d(${motion.translateX}px, ${motion.translateY}px, 0) scale(${motion.scale})`;

  return (
    <AbsoluteFill style={{backgroundColor: '#081426', overflow: 'hidden'}}>
      {props.backgroundMusicSrc && (
        <Audio
          src={props.backgroundMusicSrc}
          trimBefore={0}
          trimAfter={THREE_IMAGE_DURATION_IN_FRAMES}
          loop
          volume={0.35}
        />
      )}
      <Img
        src={imageSrc}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          filter: 'blur(44px) brightness(.58) saturate(1.1)', transform: 'scale(1.18)',
        }}
      />
      <AbsoluteFill style={{transform, willChange: 'transform'}}>
        <Img
          src={imageSrc}
          style={{width: '100%', height: '100%', objectFit: 'contain', backfaceVisibility: 'hidden'}}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
