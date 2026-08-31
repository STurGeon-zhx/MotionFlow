'use client';

import type {CSSProperties} from 'react';
import {Player} from '@remotion/player';
import {ImageIntroVideo} from '@/remotion/ImageIntroVideo';
import {defaultVideoProps} from '@/remotion/types';
import type {EffectPreset, Intensity} from '@/lib/schema';
import {getSourceDimensions} from '@/lib/video-config';

export function EffectPreview({effect, imageSrc, sourceWidth, sourceHeight, introDuration, intensity, breathing}: {
  effect: EffectPreset;
  imageSrc?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  introDuration: number;
  intensity: Intensity;
  breathing: boolean;
}) {
  const dimensions = getSourceDimensions(sourceWidth ?? 720, sourceHeight ?? 1280, '720p');
  const orientation = dimensions.width > dimensions.height ? 'landscape' : dimensions.width === dimensions.height ? 'square' : 'portrait';
  const ratio = dimensions.width / dimensions.height;
  const shellStyle: CSSProperties = {
    aspectRatio: `${dimensions.width} / ${dimensions.height}`,
    maxWidth: orientation === 'landscape' ? '100%' : `${Math.round(400 * ratio)}px`,
  };
  return (
    <div className="preview-stage">
      <div className={`preview-shell preview-${orientation}`} style={shellStyle}>
        <Player
          key={effect.id}
          component={ImageIntroVideo}
          inputProps={{
            ...defaultVideoProps,
            imageSrc: imageSrc ?? defaultVideoProps.imageSrc,
            effect,
            ...dimensions,
            introFrames: Math.round(introDuration * 30),
            intensity,
            enableBreathing: breathing,
          }}
          durationInFrames={150}
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
        <span className="preview-time">5.0 秒 · 30 FPS</span>
      </div>
    </div>
  );
}
