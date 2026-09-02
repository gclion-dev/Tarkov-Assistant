import { Navigate, Route, Routes } from 'react-router-dom';

import Admin from '@/pages/Admin';
import InteractiveMap from '@/pages/InteractiveMap';
import Login from '@/pages/Login';
import Notfound from '@/pages/NotFound';
import Tasks from '@/pages/Tasks';
import LayoutBase from '@/components/Layout/base';

const Router = () => {
  return (
    <Routes>
      <Route index element={<Navigate to="interactive" />} />
      <Route path="/" element={<LayoutBase />}>
        <Route path="interactive" element={<InteractiveMap />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:taskId" element={<Tasks />} />
      </Route>
      <Route path="/login" element={<Login />} />
      {/*
        管理后台。刻意不放进 LayoutBase，也不在任何导航里给入口：
        它与普通用户功能没有交集，鉴权完全在服务端（/api/admin），
        这个路由本身不含任何敏感信息，未登录时只会看到登录表单。
      */}
      <Route path="/admin_zds" element={<Admin />} />
      <Route path="*" element={<Notfound />} />
    </Routes>
  );
};

export default Router;
