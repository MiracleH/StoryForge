import React from 'react';
import { Button, Typography, Progress, Alert, Spin } from 'antd';
import { VideoCameraOutlined, RocketOutlined } from '@ant-design/icons';
import { useWorkflowStore } from '../../stores';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

interface Props {
  projectId: number;
}

const Step3Composition: React.FC<Props> = ({ projectId }) => {
  const navigate = useNavigate();
  const { status, loading, startComposition } = useWorkflowStore();
  const state = status?.state || 'idle';
  const isComposing = state === 'composing';

  const handleCompose = async () => {
    try {
      await startComposition(projectId);
    } catch {}
  };

  const progress = status?.progress || 0;
  const tasks = status?.tasks || { pending: 0, running: 0, completed: 0, failed: 0 };

  return (
    <div>
      <Title level={4}>Stage 3: 关键帧合成</Title>

      {state === 'assets_ready' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <VideoCameraOutlined style={{ fontSize: 48, color: '#fa541c', marginBottom: 16 }} />
          <Paragraph type="secondary" style={{ maxWidth: 500, margin: '0 auto 24px' }}>
            将角色素材和场景背景组合，为每个分镜生成关键帧图片。
            同时为所有对白生成语音音频。
          </Paragraph>
          <Button
            type="primary"
            size="large"
            icon={<RocketOutlined />}
            loading={loading}
            onClick={handleCompose}
          >
            开始合成关键帧
          </Button>
        </div>
      )}

      {isComposing && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <Title level={4} style={{ marginTop: 16 }}>关键帧合成中...</Title>
          <Paragraph type="secondary">正在组合素材生成分镜图和对白音频</Paragraph>
          <Progress
            percent={Math.round(progress)}
            status="active"
            style={{ maxWidth: 400, margin: '16px auto' }}
          />
        </div>
      )}

      {state === 'completed' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Title level={3} style={{ color: '#52c41a' }}>合成完成!</Title>
          <Paragraph>
            所有关键帧和对白音频已生成完毕。
            您可以在分镜编辑器中查看和调整结果。
          </Paragraph>
          <Button type="primary" size="large" onClick={() => navigate('/storyboard-editor')}>
            打开分镜编辑器
          </Button>
        </div>
      )}
    </div>
  );
};

export default Step3Composition;
