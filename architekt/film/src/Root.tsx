import { Composition } from 'remotion';
import { Haus, FILM } from './Haus';

export const Root = () => (
  <Composition id="Haus" component={Haus} durationInFrames={FILM.frames} fps={FILM.fps} width={FILM.w} height={FILM.h} />
);
