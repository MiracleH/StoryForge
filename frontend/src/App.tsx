import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Button, Typography } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout';

const { Text } = Typography;

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Text type="danger" strong style={{ fontSize: 18 }}>页面发生错误</Text>
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <Text type="secondary">{this.state.error?.message}</Text>
          </div>
          <Button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}>
            刷新页面
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// 页面组件
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Projects = React.lazy(() => import('./pages/Projects'));
const ProjectDetail = React.lazy(() => import('./pages/ProjectDetail'));
const Characters = React.lazy(() => import('./pages/Characters'));
const Storyboards = React.lazy(() => import('./pages/Storyboards'));
const Videos = React.lazy(() => import('./pages/Videos'));
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Settings = React.lazy(() => import('./pages/Settings'));
const ScriptAnalysis = React.lazy(() => import('./pages/ScriptAnalysis'));
const ProjectForm = React.lazy(() => import('./pages/ProjectForm'));
const Scenes = React.lazy(() => import('./pages/Scenes'));
const Assets = React.lazy(() => import('./pages/Assets'));
const StoryboardPreview = React.lazy(() => import('./pages/StoryboardPreview'));
const ScenePreview = React.lazy(() => import('./pages/ScenePreview'));
const StoryboardEditor = React.lazy(() => import('./pages/StoryboardEditor'));
const Templates = React.lazy(() => import('./pages/Templates'));
const WorkflowWizard = React.lazy(() => import('./pages/WorkflowWizard'));
const EpisodeSetup = React.lazy(() => import('./pages/EpisodeSetup'));

// 路由守卫
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ConfigProvider locale={zhCN}>
      <Router>
        <ErrorBoundary>
        <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={
            <React.Suspense fallback={<div>加载中...</div>}>
              <Login />
            </React.Suspense>
          } />
          <Route path="/register" element={
            <React.Suspense fallback={<div>加载中...</div>}>
              <Register />
            </React.Suspense>
          } />

          {/* 需要认证的路由 */}
          <Route path="/" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Navigate to="/dashboard" replace />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/dashboard" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Dashboard />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/projects" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Projects />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/projects/new" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <ProjectForm />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/projects/:id/edit" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <ProjectForm />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/projects/:id" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <ProjectDetail />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/script-analysis/:projectId" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <ScriptAnalysis />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/characters" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Characters />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/storyboards" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Storyboards />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/videos" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Videos />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/scenes" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Scenes />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/assets" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Assets />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/storyboard-preview" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <StoryboardPreview />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/scene-preview" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <ScenePreview />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/storyboard-editor" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <StoryboardEditor />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/projects/:id/episodes/setup" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <EpisodeSetup />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/projects/:id/workflow" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <WorkflowWizard />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/projects/:id/episodes/:episodeId/workflow" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <WorkflowWizard />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/templates" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Templates />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/profile" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Profile />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />
          <Route path="/settings" element={
            <PrivateRoute>
              <AppLayout>
                <React.Suspense fallback={<div>加载中...</div>}>
                  <Settings />
                </React.Suspense>
              </AppLayout>
            </PrivateRoute>
          } />

          {/* 404页面 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </ErrorBoundary>
      </Router>
    </ConfigProvider>
  );
};

export default App;