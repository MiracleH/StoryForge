import React, { useEffect, useState } from 'react';
import { Button, Typography, Alert, Card, Row, Col, Tag, Space, Tabs, Modal, message, Select } from 'antd';
import { VideoCameraOutlined, RocketOutlined, ReloadOutlined, ExpandOutlined, PlayCircleOutlined, ThunderboltOutlined, DownloadOutlined, MergeCellsOutlined } from '@ant-design/icons';
import { useWorkflowStore, useEpisodeWorkflowStore } from '../../stores';
import { workflowAPI, episodeWorkflowAPI } from '../../services/api';

const { Title, Text } = Typography;

interface Props {
  projectId: number;
  episodeId?: number;
}

interface VideoClipCard {
  id: number;
  asset_type: string;
  entity_type: string;
  entity_id: number;
  name: string;
  description: string;
  prompt: string;
  image_url: string;
  status: string;
  metadata: string;
  storyboard_version?: string;
  storyboard_title?: string;
  storyboard_description?: string;
  storyboard_duration?: number;
  camera_angle?: string;
  camera_movement?: string;
  scene_title?: string;
  chapter_title?: string;
}

const VERSION_TABS = [
  { key: 'seedance', label: 'Seedance 2.0' },
  { key: 'sora', label: 'Sora-2' },
];

const RESOLUTION_OPTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
];

const Step5Video: React.FC<Props> = ({ projectId, episodeId }) => {
  const isEpisodeMode = !!episodeId;
  const projectStore = useWorkflowStore();
  const episodeStore = useEpisodeWorkflowStore();

  const status = isEpisodeMode ? episodeStore.status : projectStore.status;
  const loading = isEpisodeMode ? episodeStore.loading : projectStore.loading;
  const videoStatus = isEpisodeMode ? episodeStore.videoStatus : (projectStore as any).videoStatus;
  const videos = isEpisodeMode ? episodeStore.videos : (projectStore as any).videos || [];
  const entityId = isEpisodeMode ? episodeId! : projectId;

  const [clips, setClips] = useState<VideoClipCard[]>([]);
  const [activeVersion, setActiveVersion] = useState('seedance');
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClip, setSelectedClip] = useState<VideoClipCard | null>(null);
  const [resolution, setResolution] = useState('1080p');
  const [cardsCreated, setCardsCreated] = useState(false);

  const state = status?.state || 'idle';

  const fetchClips = async (version?: string) => {
    if (!isEpisodeMode) return;
    const v = version || activeVersion;
    try {
      const res = await episodeWorkflowAPI.getVideoClips(entityId, v);
      const data = (res as any).data || res || [];
      setClips(data);
      if (data.length > 0) setCardsCreated(true);
    } catch {}
  };

  useEffect(() => {
    if (['generating_keyframes', 'completed', 'generating_video', 'video_ready'].includes(state)) {
      fetchClips();
      if (isEpisodeMode) episodeStore.fetchVideoStatus(entityId);
    }
  }, [state, activeVersion]);

  const handleCreateCards = async () => {
    try {
      await episodeStore.createVideoClips(entityId);
      message.success('视频片段卡片创建完成');
      setCardsCreated(true);
      await fetchClips();
    } catch {}
  };

  const handleGenerateSingle = async (assetId: number) => {
    setGeneratingIds(prev => new Set(prev).add(assetId));
    try {
      await episodeStore.generateSingleVideoClip(entityId, assetId);
      message.success('视频片段生成完成');
      await fetchClips();
      episodeStore.fetchVideoStatus(entityId);
    } catch {}
    setGeneratingIds(prev => {
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
  };

  const handleGenerateAll = async () => {
    const pending = filteredClips.filter(c => c.status === 'pending' || c.status === 'failed');
    for (const c of pending) {
      await handleGenerateSingle(c.id);
    }
  };

  const handleMerge = async () => {
    try {
      await episodeStore.mergeVideoClips(entityId, { resolution });
      message.success('视频合成已开始');
      episodeStore.fetchVideoStatus(entityId);
    } catch {}
  };

  const filteredClips = isEpisodeMode
    ? clips.filter(c => c.storyboard_version === activeVersion)
    : clips;

  const pendingCount = filteredClips.filter(c => c.status === 'pending' || c.status === 'failed').length;
  const completedCount = filteredClips.filter(c => c.status === 'completed').length;
  const seedanceCount = clips.filter(c => c.storyboard_version === 'seedance').length;
  const soraCount = clips.filter(c => c.storyboard_version === 'sora').length;

  const isMerging = state === 'generating_video' && !cardsCreated;
  const currentVideo = videoStatus || videos[0];
  const isReady = currentVideo?.status === 'completed' && state === 'video_ready';

  const renderCard = (clip: VideoClipCard) => {
    const isGenerating = generatingIds.has(clip.id);
    const hasVideo = clip.image_url && clip.image_url !== 'pending' && clip.status === 'completed';

    return (
      <Col key={clip.id} xs={24} sm={12} md={8} lg={6}>
        <Card
          size="small"
          hoverable
          onClick={() => { setSelectedClip(clip); setModalOpen(true); }}
          cover={
            hasVideo ? (
              <video
                src={clip.image_url}
                style={{ width: '100%', height: 160, objectFit: 'cover' }}
                controls
                preload="metadata"
              />
            ) : (
              <div style={{
                width: '100%', height: 160, background: '#f0f0f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <VideoCameraOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
              </div>
            )
          }
          actions={[
            (clip.status === 'pending' || clip.status === 'failed') ? (
              <Button
                type="primary"
                size="small"
                icon={isGenerating ? undefined : <RocketOutlined />}
                loading={isGenerating}
                onClick={(e) => { e.stopPropagation(); handleGenerateSingle(clip.id); }}
              >
                {isGenerating ? '生成中' : '生成视频'}
              </Button>
            ) : (
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={(e) => { e.stopPropagation(); handleGenerateSingle(clip.id); }}
              >
                重生成
              </Button>
            ),
            hasVideo ? (
              <PlayCircleOutlined key="play" onClick={(e) => { e.stopPropagation(); setSelectedClip(clip); setModalOpen(true); }} />
            ) : (
              <ExpandOutlined key="expand" onClick={(e) => { e.stopPropagation(); setSelectedClip(clip); setModalOpen(true); }} />
            ),
          ]}
        >
          <Card.Meta
            title={
              <Space size={4}>
                <Text ellipsis style={{ maxWidth: 100 }}>{clip.name || clip.storyboard_title || '视频片段'}</Text>
                <Tag color={clip.status === 'completed' ? 'green' : clip.status === 'failed' ? 'red' : clip.status === 'generating' ? 'processing' : 'blue'}>
                  {clip.status === 'completed' ? '已生成' : clip.status === 'failed' ? '失败' : clip.status === 'generating' ? '生成中' : '待生成'}
                </Tag>
              </Space>
            }
            description={
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                  {clip.chapter_title} &gt; {clip.scene_title}
                </Text>
                {clip.storyboard_duration && (
                  <Tag color="blue" style={{ fontSize: 10 }}>{clip.storyboard_duration}秒</Tag>
                )}
              </Space>
            }
          />
        </Card>
      </Col>
    );
  };

  // --- State: generating_video (merge in progress) ---
  if (isMerging) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Title level={4}>视频合成中...</Title>
        <Text type="secondary">正在使用 FFmpeg 合并 {completedCount} 个视频片段</Text>
      </div>
    );
  }

  // --- State: video_ready (show final video) ---
  if (isReady) {
    return (
      <div style={{ textAlign: 'center', padding: 20 }}>
        <Title level={4}>视频生成完成</Title>

        {currentVideo.file_path && (
          <Card style={{ maxWidth: 720, margin: '16px auto' }}>
            <video
              controls
              style={{ width: '100%', borderRadius: 8 }}
              src={currentVideo.file_path}
            />
          </Card>
        )}

        <Space style={{ marginTop: 16 }}>
          {currentVideo.file_path && (
            <Button icon={<DownloadOutlined />} href={currentVideo.file_path} download target="_blank">
              下载视频
            </Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={handleMerge} loading={loading}>
            重新合成
          </Button>
        </Space>
      </div>
    );
  }

  // --- State: no cards yet ---
  if (!cardsCreated && !['generating_video'].includes(state)) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <VideoCameraOutlined style={{ fontSize: 48, color: '#722ed1', marginBottom: 16 }} />
        <Title level={4}>AI 视频生成</Title>
        <Text type="secondary" style={{ display: 'block', maxWidth: 500, margin: '0 auto 24px' }}>
          每个分镜将调用 AI 视频生成模型（Seedance 分镜用 Seedance 2.0，Sora-2 分镜用 Sora-2），生成视频片段后再用 FFmpeg 合成最终视频。
        </Text>
        <Button
          type="primary"
          size="large"
          icon={<RocketOutlined />}
          loading={loading}
          onClick={handleCreateCards}
        >
          创建视频片段卡片
        </Button>
      </div>
    );
  }

  // --- Cards view ---
  return (
    <div>
      <Title level={4}>AI 视频生成</Title>

      <Alert
        message={`视频片段卡片：共 ${filteredClips.length} 个（已完成: ${completedCount}${pendingCount > 0 ? `, 待生成: ${pendingCount}` : ''}）`}
        type={pendingCount === 0 && completedCount > 0 ? 'success' : 'info'}
        showIcon
        style={{ marginBottom: 16 }}
        action={
          <Space>
            {pendingCount > 0 && (
              <Button
                type="primary"
                size="small"
                icon={<ThunderboltOutlined />}
                loading={loading}
                onClick={handleGenerateAll}
              >
                一键生成全部 ({pendingCount})
              </Button>
            )}
            {completedCount > 0 && (
              <Space size={4}>
                <Select value={resolution} onChange={setResolution} options={RESOLUTION_OPTIONS} size="small" style={{ width: 80 }} />
                <Button
                  type="primary"
                  size="small"
                  icon={<MergeCellsOutlined />}
                  loading={loading}
                  onClick={handleMerge}
                  style={{ background: '#722ed1' }}
                >
                  合成最终视频
                </Button>
              </Space>
            )}
          </Space>
        }
      />

      {isEpisodeMode && (
        <Tabs
          activeKey={activeVersion}
          onChange={(v) => { setActiveVersion(v); fetchClips(v); }}
          items={VERSION_TABS.map(t => ({
            key: t.key,
            label: (
              <span>
                {t.label}
                <Tag style={{ marginLeft: 6 }}>
                  {t.key === 'seedance' ? seedanceCount : soraCount}
                </Tag>
              </span>
            ),
          }))}
          style={{ marginBottom: 16 }}
        />
      )}

      {filteredClips.length > 0 ? (
        <Row gutter={[12, 12]}>
          {filteredClips.map(renderCard)}
        </Row>
      ) : (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary">当前版本暂无数据，请先创建视频片段卡片</Text>
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        title={selectedClip?.name || selectedClip?.storyboard_title || '视频片段详情'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={800}
        style={{ top: 20 }}
      >
        {selectedClip && (
          <div>
            <Space wrap style={{ marginBottom: 16 }}>
              <Tag color={selectedClip.storyboard_version === 'seedance' ? 'purple' : 'cyan'}>
                {selectedClip.storyboard_version === 'seedance' ? 'Seedance 2.0' : selectedClip.storyboard_version === 'sora' ? 'Sora-2' : 'Standard'}
              </Tag>
              <Tag color={selectedClip.status === 'completed' ? 'green' : 'blue'}>
                {selectedClip.status === 'completed' ? '已生成' : '待生成'}
              </Tag>
              {selectedClip.storyboard_duration && (
                <Tag color="blue">{selectedClip.storyboard_duration}秒</Tag>
              )}
            </Space>

            {selectedClip.image_url && selectedClip.image_url !== 'pending' && selectedClip.status === 'completed' && (
              <Card title="生成的视频片段" size="small" style={{ marginBottom: 12 }}>
                <video
                  src={selectedClip.image_url}
                  controls
                  style={{ width: '100%', maxHeight: 400, borderRadius: 8 }}
                />
              </Card>
            )}

            <Card title="视频提示词" size="small">
              <Text
                style={{
                  whiteSpace: 'pre-wrap',
                  background: '#1e1e1e',
                  color: '#d4d4d4',
                  padding: 16,
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  display: 'block',
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                {selectedClip.prompt}
              </Text>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Step5Video;
