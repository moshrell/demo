import {Composition} from 'remotion';
import {PaintHero, LOOP_FRAMES} from './PaintHero';

export const Root: React.FC = () => (
  <Composition
    id="PaintHero"
    component={PaintHero}
    durationInFrames={LOOP_FRAMES}
    fps={30}
    width={1920}
    height={1080}
  />
);
