import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';

import { RecoilRoot } from 'recoil';
import { ErrorBoundary, Message } from 'tilty-ui';

import AuthProvider from '@/features/auth/AuthProvider';
import PreferencesProvider from '@/features/preferences/PreferencesProvider';
import RoomProvider from '@/features/room/RoomProvider';
import Router from '@/router';

import '@/scripts/axios';
import 'tilty-ui/dist/theme/global.less';
import 'tilty-ui/dist/theme/index.less';
import 'tilty-ui/dist/style.css';
import 'react-toastify/dist/ReactToastify.css';
import '@/global.less';

declare global {
  interface Window {
    /** 由外部客户端壳注入，浏览器环境下为 undefined。 */
    clientAccessToken?: string;
    buildVersion: string;
  }
}

window.buildVersion = '1.0.1-OpenSource';

const root = document.getElementById('app');

document.addEventListener('DOMContentLoaded', () => {
  root &&
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <RecoilRoot>
          <ErrorBoundary>
            <BrowserRouter>
              {/* 会话恢复、偏好同步与房间连接各自只有一个持有者，避免多个组件重复发起。 */}
              <AuthProvider>
                <PreferencesProvider>
                  <RoomProvider>
                    <Router />
                  </RoomProvider>
                </PreferencesProvider>
              </AuthProvider>
            </BrowserRouter>
            <ToastContainer
              position="bottom-right"
              autoClose={5000}
              newestOnTop
              closeOnClick
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="dark"
            />
            <Message />
          </ErrorBoundary>
        </RecoilRoot>
      </React.StrictMode>,
    );
});
