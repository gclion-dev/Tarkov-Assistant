import { Navigate, Route, Routes } from 'react-router-dom';

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
      <Route path="*" element={<Notfound />} />
    </Routes>
  );
};

export default Router;
