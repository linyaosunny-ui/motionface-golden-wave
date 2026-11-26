import {Composition} from 'remotion';
import {GoldenWave} from './GoldenWave';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="GoldenWave"
        component={GoldenWave}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
