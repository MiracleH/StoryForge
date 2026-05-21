import React, { useState, useEffect } from 'react';
import { Layout, Menu, theme, Avatar, Dropdown } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  VideoCameraOutlined,
  ProjectOutlined,
  PictureOutlined,
  TeamOutlined,
  SettingOutlined,
  LogoutOutlined,
  BlockOutlined,
  FolderOpenOutlined,
  EyeOutlined,
  SketchOutlined,
  EditOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { authAPI } from '../../services/api';

const { Header, Sider, Content } = Layout;

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [username, setUsername] = useState('用户');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    authAPI.getProfile().then((res: any) => {
      setUsername(res.data?.username || '用户');
    }).catch(() => {});
  }, []);
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <ProjectOutlined />,
      label: '工作台',
    },
    {
      key: '/projects',
      icon: <ProjectOutlined />,
      label: '项目管理',
    },
    {
      key: '/characters',
      icon: <TeamOutlined />,
      label: '角色管理',
    },
    {
      key: '/storyboards',
      icon: <PictureOutlined />,
      label: '分镜绘制',
    },
    {
      key: '/videos',
      icon: <VideoCameraOutlined />,
      label: '视频合成',
    },
    {
      key: '/scenes',
      icon: <BlockOutlined />,
      label: '场景管理',
    },
    {
      key: '/assets',
      icon: <FolderOpenOutlined />,
      label: '资源管理',
    },
    {
      key: '/storyboard-preview',
      icon: <EyeOutlined />,
      label: '分镜预览',
    },
    {
      key: '/scene-preview',
      icon: <SketchOutlined />,
      label: '场景预览',
    },
    {
      key: '/storyboard-editor',
      icon: <EditOutlined />,
      label: '分镜编辑',
    },
    {
      key: '/templates',
      icon: <AppstoreOutlined />,
      label: '模板中心',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const handleUserMenuClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      localStorage.removeItem('token');
      navigate('/login');
    } else if (key === 'profile') {
      navigate('/profile');
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed}>
        <div className="logo" style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: collapsed ? '16px' : '20px',
          fontWeight: 'bold'
        }}>
          {collapsed ? 'AI' : 'AI短漫剧平台'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{
          padding: 0,
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
              className: 'trigger',
              onClick: () => setCollapsed(!collapsed),
              style: { fontSize: '18px', padding: '0 24px', cursor: 'pointer' }
            })}
          </div>
          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '0 24px'
            }}>
              <Avatar icon={<UserOutlined />} />
              <span style={{ marginLeft: '8px', marginRight: '16px' }}>{username}</span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{
          margin: '24px 16px',
          padding: 24,
          minHeight: 280,
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
        }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;