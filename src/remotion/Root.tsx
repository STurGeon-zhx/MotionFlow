import React from 'react';
import {Composition} from 'remotion';
import {DURATION_IN_FRAMES, FPS} from '@/lib/video-config';
import {ImageIntroVideo} from './ImageIntroVideo';
import {defaultVideoProps, type ImageIntroVideoProps} from './types';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ImageIntroVideo"
    component={ImageIntroVideo}
    durationInFrames={DURATION_IN_FRAMES}
    fps={FPS}
    width={1080}
    height={1920}
    defaultProps={defaultVideoProps}
    calculateMetadata={({props}) => ({width: (props as ImageIntroVideoProps).width, height: (props as ImageIntroVideoProps).height})}
  />
);

