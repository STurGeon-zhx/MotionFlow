import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {getMusicMimeType, getMusicTrackForIndex, listMusicTracks} from '@/lib/music';

describe('自动背景音乐', () => {
  it('读取内置音乐并按顺序循环分配', () => {
    const tracks = listMusicTracks();
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.every((track) => path.isAbsolute(track.filePath))).toBe(true);
    expect(getMusicTrackForIndex(0, tracks)).toEqual(tracks[0]);
    expect(getMusicTrackForIndex(tracks.length, tracks)).toEqual(tracks[0]);
  });

  it('识别支持的音频 MIME 类型并拒绝 NCM', () => {
    expect(getMusicMimeType('music.mp3')).toBe('audio/mpeg');
    expect(() => getMusicMimeType('music.ncm')).toThrow('不支持的音乐格式');
  });
});
