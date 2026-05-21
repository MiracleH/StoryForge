import React, { useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography, Button, List, Tag, Spin, Progress, Space } from 'antd';
import {
  ProjectOutlined, VideoCameraOutlined, PictureOutlined, TeamOutlined,
  PlusOutlined, RightOutlined, AppstoreOutlined, EditOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useProjectStore, useCharacterStore, useVideoStore } from '../../stores';

const { Title, Paragraph, Text } = Typography;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { projects, stats, loading, fetchProjects, fetchStats } = useProjectStore();
  const { characters, fetchCharacters } = useCharacterStore();
  const { videos, fetchVideos } = useVideoStore();

  useEffect(() => {
    fetchStats();
    fetchProjects({ limit: 5 });
  }, []);

  useEffect(() => {
    if (projects.length > 0) {
      fetchCharacters(projects[0].id);
      fetchVideos(projects[0].id);
    }
  }, [projects]);

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      draft: { color: 'default', text: '草稿' },
      in_progress: { color: 'processing', text: '进行中' },
      completed: { color: 'success', text: '已完成' },
      archived: { color: 'warning', text: '已归档' },
    };
    const { color, text } = statusMap[status] || { color: 'default', text: status };
    return <Tag color={color}>{text}</Tag>;
  };

  const total = stats?.total_projects || 1;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>工作台</Title>
        <Paragraph>欢迎使用AI短漫剧一站式生产平台</Paragraph>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/projects')}>
            <Statistic title="项目总数" value={stats?.total_projects ?? 0} prefix={<ProjectOutlined />} loading={loading} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/characters')}>
            <Statistic title="角色数量" value={characters.length} prefix={<TeamOutlined />} loading={loading} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/videos')}>
            <Statistic title="视频数量" value={videos.length} prefix={<VideoCameraOutlined />} loading={loading} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/storyboards')}>
            <Statistic title="进行中项目" value={stats?.in_progress_projects ?? 0} prefix={<EditOutlined />} loading={loading} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="项目状态分布">
            {loading ? <Spin /> : (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>草稿</Text><Text type="secondary">{stats?.draft_projects ?? 0}</Text>
                  </div>
                  <Progress percent={Math.round(((stats?.draft_projects || 0) / total) * 100)} strokeColor="#d9d9d9" showInfo={false} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>进行中</Text><Text type="secondary">{stats?.in_progress_projects ?? 0}</Text>
                  </div>
                  <Progress percent={Math.round(((stats?.in_progress_projects || 0) / total) * 100)} strokeColor="#1890ff" showInfo={false} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>已完成</Text><Text type="secondary">{stats?.completed_projects ?? 0}</Text>
                  </div>
                  <Progress percent={Math.round(((stats?.completed_projects || 0) / total) * 100)} strokeColor="#52c41a" showInfo={false} />
                </div>
              </Space>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="快速操作">
            <Row gutter={[12, 12]}>
              <Col span={8}><Button type="primary" icon={<PlusOutlined />} block onClick={() => navigate('/projects/new')}>新建项目</Button></Col>
              <Col span={8}><Button icon={<FileTextOutlined />} block onClick={() => navigate('/storyboards')}>分镜管理</Button></Col>
              <Col span={8}><Button icon={<AppstoreOutlined />} block onClick={() => navigate('/templates')}>模板中心</Button></Col>
              <Col span={8}><Button icon={<PictureOutlined />} block onClick={() => navigate('/storyboard-preview')}>分镜预览</Button></Col>
              <Col span={8}><Button icon={<VideoCameraOutlined />} block onClick={() => navigate('/videos')}>视频合成</Button></Col>
              <Col span={8}><Button icon={<TeamOutlined />} block onClick={() => navigate('/characters')}>角色管理</Button></Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Card title="最近项目">
        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> :
         projects.length > 0 ? (
          <List
            dataSource={projects}
            renderItem={(project) => (
              <List.Item actions={[<Button type="link" icon={<RightOutlined />} onClick={() => navigate(`/projects/${project.id}`)}>查看</Button>]}>
                <List.Item.Meta
                  title={<a onClick={() => navigate(`/projects/${project.id}`)}>{project.title}</a>}
                  description={project.description || '暂无描述'}
                />
                {getStatusTag(project.status)}
              </List.Item>
            )}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Paragraph>暂无项目</Paragraph>
            <Button type="primary" onClick={() => navigate('/projects/new')}>创建第一个项目</Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
