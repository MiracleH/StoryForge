import React from 'react';
import { Button, Typography, Progress, Card, Row, Col, Alert, Space } from 'antd';
import { PictureOutlined, RocketOutlined } from '@ant-design/icons';
import { useWorkflowStore, useEpisodeWorkflowStore } from '../../stores';

const { Title, Text, Paragraph } = Typography;

interface Props {
  projectId: number;
  episodeId?: number;
}

const Step4Keyframes: React.FC<Props> = ({ projectId, episodeId }) => {
  const isEpisodeMode = !!episodeId;
  const projectStore = useWorkflowStore();
  const episodeStore = useEpisodeWorkflowStore();

  const status = isEpisodeMode ? episodeStore.status : projectStore.status;
  const loading = isEpisodeMode ? episodeStore.loading : projectStore.loading;
  const startKeyframeGeneration = isEpisodeMode ? episodeStore.startKeyframeGeneration : projectStore.startKeyframeGeneration;
  const retryFailed = isEpisodeMode ? episodeStore.retryFailed : projectStore.retryFailed;
  const entityId = isEpisodeMode ? episodeId! : projectId;

  const state = status?.state || 'idle';

  const handleGenerate = async () => {
    try { await startKeyframeGeneration(entityId); } catch {}
  };

  const progress = status?.progress || 0;
  const tasks = status?.tasks || { pending: 0, running: 0, completed: 0, failed: 0 };

  if (state === 'storyboards_ready') {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <PictureOutlined style={{ fontSize: 48, color: '#eb2f96', marginBottom: 16 }} />
        <Title level={4}>关键帧生成</Title>
        <Paragraph type="secondary" style={{ maxWidth: 500, margin: '0 auto 24px' }}>
          AI 将基于分镜 JSON 和素材库，为每个分镜生成关键帧图片。
        </Paragraph>
        <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading} onClick={handleGenerate}>
          开始生成关键帧
        </Button>
      </div>
    );
  }

  if (state === 'generating_keyframes') {
    return (
      <div>
        <Alert message="关键帧生成中" description="AI 正在为每个分镜生成关键帧图片，请耐心等待。" type="info" showIcon style={{ marginBottom: 16 }} />
        <Progress percent={Math.round(progress)} status="active" strokeColor={{ from: '#108ee9', to: '#87d068' }} style={{ marginBottom: 24 }} />
        <Row gutter={16}>
          <Col span={6}><Card size="small"><Text strong>待处理</Text><br /><Text style={{ fontSize: 24 }}>{tasks.pending}</Text></Card></Col>
          <Col span={6}><Card size="small"><Text strong>进行中</Text><br /><Text style={{ fontSize: 24, color: '#1890ff' }}>{tasks.running}</Text></Card></Col>
          <Col span={6}><Card size="small"><Text strong>已完成</Text><br /><Text style={{ fontSize: 24, color: '#52c41a' }}>{tasks.completed}</Text></Card></Col>
          <Col span={6}><Card size="small"><Text strong>失败</Text><br /><Text style={{ fontSize: 24, color: tasks.failed > 0 ? '#ff4d4f' : undefined }}>{tasks.failed}</Text></Card></Col>
        </Row>
      </div>
    );
  }

  if (state === 'completed') {
    return (
      <div>
        <Alert message="关键帧生成完成" description={`共生成 ${tasks.completed} 个关键帧。`} type="success" showIcon style={{ marginBottom: 16 }} />
        {tasks.failed > 0 && (
          <Alert
            message={`${tasks.failed} 个任务失败`}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            action={<Button size="small" onClick={() => retryFailed(entityId)}>重试</Button>}
          />
        )}
      </div>
    );
  }

  return null;
};

export default Step4Keyframes;
