import { useState } from 'react';

import Icon from '@/components/Icon';

import './style.less';

const Index = () => {
  const [setActiveModal] = useState<InteractiveMap.AdditionFunc>();

  return (
    <div className="im-additionfunc">
      <div className="im-additionfunc-list">
        <div className="im-additionfunc-list-item" onClick={() => setActiveModal('tradertimer')}>
          <Icon type="icon-exchange-dollar-fill" />
        </div>
      </div>
    </div>
  );
};

export default Index;
