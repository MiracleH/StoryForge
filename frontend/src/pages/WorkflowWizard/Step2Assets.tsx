import React, { useEffect, useState } from 'react';
import { Button, Typography, Progress, Card, Row, Col, Tag, Alert, Space, Tabs, Input, message, Modal } from 'antd';
import { PictureOutlined, RocketOutlined, SoundOutlined, ReloadOutlined, EditOutlined } from '@ant-design/icons';
import { useWorkflowStore, useEpisodeWorkflowStore, useProjectStore } from '../../stores';
import { workflowAPI, episodeWorkflowAPI } from '../../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Props {
  projectId: number;
  episodeId?: number;
}

interface AssetCard {
  id: number;
  asset_type: string;
  name: string;
  description: string;
  prompt: string;
  voice_prompt: string;
  image_url: string;
  audio_url: string;
  status: string;
}

const Step2Assets: React.FC<Props> = ({ projectId, episodeId }) => {
  const isEpisodeMode = !!episodeId;
  const projectStore = useWorkflowStore();
  const episodeStore = useEpisodeWorkflowStore();

  const status = isEpisodeMode ? episodeStore.status : projectStore.status;
  const loading = isEpisodeMode ? episodeStore.loading : projectStore.loading;
  const startAssetGeneration = isEpisodeMode ? episodeStore.startAssetGeneration : projectStore.startAssetGeneration;
  const retryFailed = isEpisodeMode ? episodeStore.retryFailed : projectStore.retryFailed;
  const entityId = isEpisodeMode ? episodeId! : projectId;
  const api = isEpisodeMode ? episodeWorkflowAPI : workflowAPI;

  const { currentProject } = useProjectStore();
  const [assets, setAssets] = useState<AssetCard[]>([]);
  const [editingAsset, setEditingAsset] = useState<AssetCard | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editVoicePrompt, setEditVoicePrompt] = useState('');

  const state = status?.state || 'idle';

  const fetchAssets = async () => {
    try {
      const res = await api.getAssets(entityId);
      setAssets((res as any).data || []);
    } catch {}
  };

  useEffect(() => {
    if (state !== 'idle' && state !== 'analyzing') {
      fetchAssets();
    }
  }, [state, entityId]);

  const handleGenerate = async () => {
    try { await startAssetGeneration(entityId); } catch {}
  };

  const handleRegenerate = async (assetId: number) => {
    try {
      if (isEpisodeMode) {
        // Episode mode doesn't have regenerateAsset yet, skip
        message.info('剧集模式暂不支持单个素材重生成');
        return;
      }
      await workflowAPI.regenerateAsset(projectId, assetId);
      message.success('已重置为待生成状态');
      fetchAssets();
    } catch {
      message.error('操作失败');
    }
  };

  const handleGenerateAudio = async (assetId: number) => {
    try {
      if (isEpisodeMode) {
        message.info('剧集模式暂不支持语音生成');
        return;
      }
      await workflowAPI.generateAssetAudio(projectId, assetId);
      message.success('语音生成成功');
      fetchAssets();
    } catch {
      message.error('语音生成失败');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingAsset) return;
    try {
      if (isEpisodeMode) {
        message.info('剧集模式暂不支持编辑素材');
        setEditingAsset(null);
        return;
      }
      await workflowAPI.updateAsset(projectId, editingAsset.id, {
        prompt: editPrompt,
        voice_prompt: editVoicePrompt,
      });
      message.success('已保存');
      setEditingAsset(null);
      fetchAssets();
    } catch {
      message.error('保存失败');
    }
  };

  const openEdit = (asset: AssetCard) => {
    setEditingAsset(asset);
    setEditPrompt(asset.prompt);
    setEditVoicePrompt(asset.voice_prompt || '');
  };

  const progress = status?.progress || 0;
  const tasks = status?.tasks || { pending: 0, running: 0, completed: 0, failed: 0 };

  const characters = assets.filter(a => a.asset_type === 'character_design');
  const backgrounds = assets.filter(a => a.asset_type === 'background');
  const props = assets.filter(a => a.asset_type === 'prop');

  const renderAssetCard = (asset: AssetCard) => (
    <Col key={asset.id} xs={24} sm={12} md={8} lg={6}>
      <Card
        size="small"
        cover={
          asset.image_url && asset.image_url !== 'pending' ? (
            <img src={asset.image_url} alt={asset.name} style={{ height: 160, objectFit: 'cover' }} />
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
              <PictureOutlined style={{ fontSize: 32, color: '#ccc' }} />
            </div>
          )
        }
        actions={[
          <Button key="edit" type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(asset)}>编辑</Button>,
          <Button key="regen" type="link" size="small" icon={<ReloadOutlined />} onClick={() => handleRegenerate(asset.id)}>重生成</Button>,
          asset.voice_prompt ? (
            <Button key="audio" type="link" size="small" icon={<SoundOutlined />} onClick={() => handleGenerateAudio(asset.id)}>语音</Button>
          ) : <span key="no-audio" />,
        ]}
      >
        <Card.Meta
          title={<Space>{asset.name}<Tag color={asset.status === 'completed' ? 'green' : asset.status === 'failed' ? 'red' : 'blue'}>{asset.status}</Tag></Space>}
          description={<Text type="secondary" ellipsis={{ rows: 2 }}>{asset.description}</Text>}
        />
        {asset.audio_url && (
          <div style={{ marginTop: 8 }}>
            <audio controls src={asset.audio_url} style={{ width: '100%', height: 32 }} />
          </div>
        )}
      </Card>
    </Col>
  );

  return (
    <div>
      <Title level={4}>素材生成</Title>

      {state === 'reviewing' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <PictureOutlined style={{ fontSize: 48, color: '#722ed1', marginBottom: 16 }} />
          <Paragraph type="secondary" style={{ maxWidth: 500, margin: '0 auto 24px' }}>
            基于剧本分析结果，AI 将为每个角色生成设计图，为每个场景生成背景图，提取道具素材。
            所有素材使用统一风格，确保视觉一致性。
          </Paragraph>
          <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading} onClick={handleGenerate}>
            开始生成素材
          </Button>
        </div>
      )}

      {state === 'generating_assets' && (
        <div>
          <Alert message="素材生成中" description="AI 正在批量生成素材图片，请耐心等待。" type="info" showIcon style={{ marginBottom: 16 }} />
          <Progress percent={Math.round(progress)} status="active" strokeColor={{ from: '#108ee9', to: '#87d068' }} style={{ marginBottom: 24 }} />
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}><Card size="small"><Text strong>待处理</Text><br /><Text style={{ fontSize: 24 }}>{tasks.pending}</Text></Card></Col>
            <Col span={6}><Card size="small"><Text strong>进行中</Text><br /><Text style={{ fontSize: 24, color: '#1890ff' }}>{tasks.running}</Text></Card></Col>
            <Col span={6}><Card size="small"><Text strong>已完成</Text><br /><Text style={{ fontSize: 24, color: '#52c41a' }}>{tasks.completed}</Text></Card></Col>
            <Col span={6}><Card size="small"><Text strong>失败</Text><br /><Text style={{ fontSize: 24, color: tasks.failed > 0 ? '#ff4d4f' : undefined }}>{tasks.failed}</Text></Card></Col>
          </Row>
        </div>
      )}

      {(state === 'assets_ready' || state === 'generating_assets' || ['generating_storyboards', 'storyboards_ready', 'generating_keyframes', 'completed'].includes(state)) && assets.length > 0 && (
        <Tabs
          items={[
            { key: 'characters', label: `角色 (${characters.length})`, children: <Row gutter={[16, 16]}>{characters.map(renderAssetCard)}</Row> },
            { key: 'backgrounds', label: `场景 (${backgrounds.length})`, children: <Row gutter={[16, 16]}>{backgrounds.map(renderAssetCard)}</Row> },
            { key: 'props', label: `道具 (${props.length})`, children: props.length > 0 ? <Row gutter={[16, 16]}>{props.map(renderAssetCard)}</Row> : <Text type="secondary">暂无道具素材</Text> },
          ]}
        />
      )}

      {state === 'assets_ready' && (
        <div style={{ marginTop: 16 }}>
          {tasks.failed > 0 && (
            <Alert
              message={`${tasks.failed} 个任务失败`}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              action={<Button size="small" onClick={() => retryFailed(entityId)}>重试</Button>}
            />
          )}
          {assets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading} onClick={handleGenerate}>
                开始生成素材
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary">素材已就绪，点击下一步开始生成分镜。</Text>
              <Button onClick={async () => {
                try {
                  await api.backToReview(entityId);
                  if (isEpisodeMode) episodeStore.fetchStatus(entityId);
                  else projectStore.fetchStatus(projectId);
                } catch {}
              }}>
                返回修改剧本
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal title="编辑素材" open={!!editingAsset} onOk={handleSaveEdit} onCancel={() => setEditingAsset(null)} width={600}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>图片提示词 (image_prompt)</Text>
            <TextArea rows={3} value={editPrompt} onChange={e => setEditPrompt(e.target.value)} />
          </div>
          <div>
            <Text strong>声音提示词 (voice_prompt)</Text>
            <TextArea rows={2} value={editVoicePrompt} onChange={e => setEditVoicePrompt(e.target.value)} placeholder="描述声音特征，如：低沉磁性的男声" />
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default Step2Assets;
