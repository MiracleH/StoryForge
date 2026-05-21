import React, { useRef, useEffect } from 'react';
import { Button, Typography, Alert, Spin } from 'antd';
import { VideoCameraOutlined, RocketOutlined } from '@ant-design/icons';
import { useWorkflowStore, useEpisodeWorkflowStore } from '../../stores';

const { Title, Text, Paragraph } = Typography;

interface Props {
  projectId: number;
  episodeId?: number;
}

const Step3Storyboards: React.FC<Props> = ({ projectId, episodeId }) => {
  const isEpisodeMode = !!episodeId;
  const projectStore = useWorkflowStore();
  const episodeStore = useEpisodeWorkflowStore();

  const status = isEpisodeMode ? episodeStore.status : projectStore.status;
  const loading = isEpisodeMode ? episodeStore.loading : projectStore.loading;
  const streamContent = isEpisodeMode ? episodeStore.streamContent : projectStore.streamContent;
  const startStoryboardGenerationStream = isEpisodeMode ? episodeStore.startStoryboardGenerationStream : projectStore.startStoryboardGenerationStream;
  const entityId = isEpisodeMode ? episodeId! : projectId;

  const streamEndRef = useRef<HTMLDivElement>(null);

  const state = status?.state || 'idle';

  useEffect(() => {
    if (streamContent) {
      streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamContent]);

  const handleGenerate = async () => {
    try { await startStoryboardGenerationStream(entityId); } catch {}
  };

  if (state === 'assets_ready') {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <VideoCameraOutlined style={{ fontSize: 48, color: '#13c2c2', marginBottom: 16 }} />
        <Title level={4}>分镜生成</Title>
        <Paragraph type="secondary" style={{ maxWidth: 500, margin: '0 auto 24px' }}>
          AI 将基于已审核的剧本，为每个场景生成详细的分镜 JSON，包含镜头角度、运动、构图、对白时机等信息。
        </Paragraph>
        <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading} onClick={handleGenerate}>
          开始生成分镜
        </Button>
      </div>
    );
  }

  if (state === 'generating_storyboards') {
    return (
      <div>
        <Alert message="分镜生成中" description="AI 正在为每个场景生成详细分镜，请耐心等待。" type="info" showIcon style={{ marginBottom: 16 }} />
        {streamContent && (
          <div style={{
            background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8,
            fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            maxHeight: 400, overflow: 'auto',
          }}>
            {streamContent}
            {loading && <Spin size="small" style={{ marginLeft: 8 }} />}
            <div ref={streamEndRef} />
          </div>
        )}
      </div>
    );
  }

  if (state === 'storyboards_ready') {
    return (
      <div>
        <Title level={4}>分镜预览</Title>
        <Alert message="分镜生成完成" description="分镜 JSON 已生成，可以进入关键帧生成阶段。" type="success" showIcon style={{ marginBottom: 16 }} />
        <Text type="secondary">点击下一步开始生成关键帧图片。</Text>
      </div>
    );
  }

  // 已完成的步骤 - 显示分镜结果摘要
  if (['generating_keyframes', 'completed'].includes(state)) {
    return (
      <div>
        <Title level={4}>分镜结果</Title>
        <Alert message="分镜生成已完成" description="分镜 JSON 已生成并进入关键帧阶段。" type="success" showIcon />
      </div>
    );
  }

  return null;
};

export default Step3Storyboards;
