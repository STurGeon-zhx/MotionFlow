import React from 'react';
import {Composition} from 'remotion';
import {DURATION_IN_FRAMES, FPS, THREE_IMAGE_DURATION_IN_FRAMES} from '@/lib/video-config';
import {ImageIntroVideo} from './ImageIntroVideo';
import {ThreeImageMotionVideo} from './ThreeImageMotionVideo';
import {defaultThreeImageMotionProps, defaultVideoProps, type ImageIntroVideoProps, type ThreeImageMotionVideoProps} from './types';

export const RemotionRoot: React.FC = () => (
  <>
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
    <Composition
      id="ThreeImageMotionVideo"
      component={ThreeImageMotionVideo}
      durationInFrames={THREE_IMAGE_DURATION_IN_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={defaultThreeImageMotionProps}
      calculateMetadata={({props}) => ({width: (props as ThreeImageMotionVideoProps).width, height: (props as ThreeImageMotionVideoProps).height})}
    />
  </>
);
