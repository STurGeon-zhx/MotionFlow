'use client';

import type {CSSProperties} from 'react';
import {Player} from '@remotion/player';
import {ThreeImageMotionVideo} from '@/remotion/ThreeImageMotionVideo';
import {defaultThreeImageMotionProps} from '@/remotion/types';
import type {ImageRecord} from '@/lib/schema';
import {getSourceDimensions} from '@/lib/video-config';

export function ThreeImageMotionPreview({images, motionSpeed, motionAmplitude}: {
  images: ImageRecord[];
  motionSpeed: number;
  motionAmplitude: number;
}) {
  const first = images[0];
  const dimensions = getSourceDimensions(first?.width ?? 1280, first?.height ?? 720, '720p');
  const orientation = dimensions.width > dimensions.height ? 'landscape' : dimensions.width === dimensions.height ? 'square' : 'portrait';
  const ratio = dimensions.width / dimensions.height;
  const shellStyle: CSSProperties = {
    aspectRatio: `${dimensions.width} / ${dimensions.height}`,
    maxWidth: orientation === 'landscape' ? '100%' : `${Math.round(400 * ratio)}px`,
  };
  const sources = [0, 1, 2].map((index) => images[index]?.previewUrl ?? first?.previewUrl ?? defaultThreeImageMotionProps.imageSrcs[index]) as [string, string, string];
  const motionSeed = images.reduce((seed, image) => {
    for (const character of image.id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
    return seed;
  }, 2166136261) >>> 0;

  return (
    <>
      <div className="preview-stage sequence-preview-stage">
        <div className={`preview-shell preview-${orientation}`} style={shellStyle}>
          <Player
            key={`${sources.join('|')}-${motionSpeed}-${motionAmplitude}-${motionSeed}`}
            component={ThreeImageMotionVideo}
            inputProps={{...defaultThreeImageMotionProps, imageSrcs: sources, ...dimensions, motionSpeed, motionAmplitude, motionSeed}}
            durationInFrames={450}
            fps={30}
            compositionWidth={dimensions.width}
            compositionHeight={dimensions.height}
            controls
            loop
            autoPlay
            initiallyMuted
            style={{width: '100%', height: '100%'}}
            acknowledgeRemotionLicense
          />
          <span className="preview-time">15.0 秒 · 30 FPS</span>
        </div>
      </div>
      <div className="sequence-timeline" aria-label="三张图片时间段">
        {[0, 1, 2].map((index) => <span key={index}>图片 {index + 1}<small>{index * 5}–{(index + 1) * 5} 秒</small></span>)}
      </div>
    </>
  );
}
