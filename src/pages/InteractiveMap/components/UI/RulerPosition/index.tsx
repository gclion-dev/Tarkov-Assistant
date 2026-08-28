import { useMemo } from 'react';

import { calculateHypotenuse } from '@/pages/InteractiveMap/utils';

import './style.less';

interface RulerPositionProps {
  rulerPosition?: InteractiveMap.Position2D[];
}

const Index = (props: RulerPositionProps) => {
  const { rulerPosition } = props;

  const length = useMemo(() => {
    if (rulerPosition) {
      return calculateHypotenuse(rulerPosition[0], rulerPosition[1]);
    } else {
      return 0;
    }
  }, [rulerPosition]);

  if (rulerPosition) {
    return (
      <div className="im-rulerposition">
        <span>测绘距离: {length.toFixed(1)} m</span>
      </div>
    );
  } else {
    return null;
  }
};

export default Index;
