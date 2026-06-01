import React, { useEffect, useState } from 'react';
import { Button, Typography, Alert, Card, Row, Col, Tag, Space, Tabs, Modal, message, Select, Image } from 'antd';
import { RocketOutlined, ReloadOutlined, ExpandOutlined, PictureOutlined, ThunderboltOutlined, WarningOutlined, CameraOutlined } from '@ant-design/icons';
import { useWorkflowStore, useEpisodeWorkflowStore } from '../../stores';
import { workflowAPI, episodeWorkflowAPI } from '../../services/api';

const { Title, Text, Paragraph } = Typography;

interface Props {
  projectId: number;
  episodeId?: number;
}

interface KeyframeCard {
  id: number;
  asset_type: string;
  entity_type: string;
  entity_id: number;
  name: string;
  description: string;
  prompt: string;
  image_url: string;
  thumbnail_url?: string;
  status: string;
  style_preset: string;
  metadata: string;
  width: number;
  height: number;
  storyboard_version?: string;
  storyboard_title?: string;
  storyboard_description?: string;
  camera_angle?: string;
  camera_movement?: string;
  seedance_prompt?: string;
  sora_prompt?: string;
  scene_title?: string;
  chapter_title?: string;
}

const VERSION_TABS = [
  { key: 'seedance', label: 'Seedance 2.0' },
  { key: 'sora', label: 'Sora-2' },
];

const STYLE_OPTIONS = [
  { value: 'anime', label: '日式动漫' },
  { value: 'realistic', label: '写实风格' },
  { value: 'chinese_ink', label: '中国水墨' },
  { value: 'cartoon', label: '卡通风格' },
  { value: 'illustration', label: '插画风格' },
  { value: '3d_render', label: '3D 渲染' },
  { value: 'oil_painting', label: '油画风格' },
  { value: 'watercolor', label: '水彩风格' },
  { value: 'sketch', label: '素描风格' },
  { value: 'cyberpunk', label: '赛博朋克' },
];

const Step4Keyframes: React.FC<Props> = ({ projectId, episodeId }) => {
  const isEpisodeMode = !!episodeId;
  const projectStore = useWorkflowStore();
  const episodeStore = useEpisodeWorkflowStore();

  const status = isEpisodeMode ? episodeStore.status : projectStore.status;
  const loading = isEpisodeMode ? episodeStore.loading : projectStore.loading;
  const startKeyframeGeneration = isEpisodeMode ? episodeStore.startKeyframeGeneration : projectStore.startKeyframeGeneration;
  const entityId = isEpisodeMode ? episodeId! : projectId;
  const api = isEpisodeMode ? episodeWorkflowAPI : workflowAPI;

  const [keyframes, setKeyframes] = useState<KeyframeCard[]>([]);
  const [activeVersion, setActiveVersion] = useState('seedance');
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedKf, setSelectedKf] = useState<KeyframeCard | null>(null);
  const [selectedStyle, setSelectedStyle] = useState(status?.style_preset || 'anime');
  const [cardsCreated, setCardsCreated] = useState(false);

  const state = status?.state || 'idle';
  const showDualVersion = isEpisodeMode;

  useEffect(() => {
    setSelectedStyle(status?.style_preset || 'anime');
  }, [status?.style_preset]);

  const fetchKeyframes = async (version?: string) => {
    if (!isEpisodeMode) return;
    const v = version || activeVersion;
    try {
      const res = await episodeWorkflowAPI.getAssets(entityId, 'keyframe', v);
      const data = (res as any).data || res || [];
      setKeyframes(data);
      if (data.length > 0) setCardsCreated(true);
    } catch {}
  };

  useEffect(() => {
    if (['storyboards_ready', 'generating_keyframes', 'completed', 'generating_video', 'video_ready'].includes(state)) {
      fetchKeyframes();
    }
  }, [state, activeVersion]);

  const handleCreateCards = async (style?: string) => {
    try {
      const res = await episodeStore.createKeyframeCards(entityId, style || selectedStyle);
      message.success(res?.data?.message || '首尾帧卡片创建完成');
      setCardsCreated(true);
      await fetchKeyframes();
    } catch {}
  };

  const handleGenerateSingle = async (assetId: number) => {
    setGeneratingIds(prev => new Set(prev).add(assetId));
    try {
      await episodeStore.generateSingleKeyframe(entityId, assetId);
      message.success('首尾帧图片生成完成');
      await fetchKeyframes();
    } catch {}
    setGeneratingIds(prev => {
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
  };

  const handleRegenerate = async (assetId: number) => {
    await episodeStore.regenerateKeyframe(entityId, assetId);
    message.success('已重置，可重新生成');
    await fetchKeyframes();
  };

  const handleGenerateAll = async () => {
    const pending = filteredKeyframes.filter(k => k.status === 'pending' || k.status === 'failed' || (k.status === 'completed' && !k.thumbnail_url));
    for (const k of pending) {
      await handleGenerateSingle(k.id);
    }
  };

  const openModal = (kf: KeyframeCard) => {
    setSelectedKf(kf);
    setModalOpen(true);
  };

  const filteredKeyframes = showDualVersion
    ? keyframes.filter(k => k.storyboard_version === activeVersion)
    : keyframes;

  const pendingCount = filteredKeyframes.filter(k => k.status === 'pending' || k.status === 'failed' || (k.status === 'completed' && !k.thumbnail_url)).length;
  const completedCount = filteredKeyframes.filter(k => k.status === 'completed').length;
  const failedCount = filteredKeyframes.filter(k => k.status === 'failed').length;
  const seedanceCount = keyframes.filter(k => k.storyboard_version === 'seedance').length;
  const soraCount = keyframes.filter(k => k.storyboard_version === 'sora').length;

  const renderCard = (kf: KeyframeCard) => {
    const isGenerating = generatingIds.has(kf.id);
    const hasImage = kf.image_url && kf.image_url !== 'pending';

    return (
      <Col key={kf.id} xs={24} sm={12} md={8} lg={6}>
        <Card
          size="small"
          hoverable
          onClick={() => openModal(kf)}
          cover={
            hasImage ? (
              <Image
                src={kf.image_url}
                alt={kf.name}
                style={{ width: '100%', height: 160, objectFit: 'cover' }}
                preview={false}
              />
            ) : (
              <div style={{
                width: '100%', height: 160, background: '#f5f5f5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {kf.status === 'failed'
                  ? <WarningOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />
                  : <PictureOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />}
              </div>
            )
          }
          actions={[
            (kf.status === 'pending' || kf.status === 'failed' || (kf.status === 'completed' && !kf.thumbnail_url)) ? (
              <Button
                type="primary"
                size="small"
                icon={isGenerating ? undefined : <RocketOutlined />}
                loading={isGenerating}
                onClick={(e) => { e.stopPropagation(); handleGenerateSingle(kf.id); }}
              >
                {isGenerating ? '生成中' : (kf.status === 'completed' ? '补尾帧' : '生成')}
              </Button>
            ) : (
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={(e) => { e.stopPropagation(); handleRegenerate(kf.id); }}
              >
                重生成
              </Button>
            ),
            <ExpandOutlined key="expand" onClick={(e) => { e.stopPropagation(); openModal(kf); }} />,
          ]}
        >
          <Card.Meta
            title={
              <Space size={4}>
                <Text ellipsis style={{ maxWidth: 120 }}>{kf.name || kf.storyboard_title || '首尾帧'}</Text>
                <Tag color={kf.status === 'completed' ? 'green' : kf.status === 'failed' ? 'red' : kf.status === 'generating' ? 'processing' : 'blue'}>
                  {kf.status === 'completed' ? (kf.thumbnail_url ? '首尾帧' : '首帧') : kf.status === 'failed' ? '失败' : kf.status === 'generating' ? '生成中' : '待生成'}
                </Tag>
              </Space>
            }
            description={
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                  {kf.storyboard_description || kf.description || ''}
                </Text>
                <Space size={4} wrap>
                  {kf.camera_angle && <Tag color="green" style={{ fontSize: 10 }}>{kf.camera_angle}</Tag>}
                  {kf.camera_movement && kf.camera_movement !== 'static' && kf.camera_movement !== '固定' && (
                    <Tag color="orange" style={{ fontSize: 10 }}>{kf.camera_movement}</Tag>
                  )}
                </Space>
              </Space>
            }
          />
        </Card>
      </Col>
    );
  };

  // --- State: storyboards_ready (create cards) ---
  if (state === 'storyboards_ready') {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <ThunderboltOutlined style={{ fontSize: 48, color: '#faad14', marginBottom: 16 }} />
        <Title level={4}>首尾帧图片生成</Title>
        <Paragraph type="secondary" style={{ maxWidth: 500, margin: '0 auto 24px' }}>
          创建首尾帧卡片后，AI 将基于分镜和已生成的素材图片（角色、场景、道具），通过图片编辑接口合成首尾帧图片。
        </Paragraph>

        <Space direction="vertical" size={16} style={{ marginBottom: 24 }}>
          <div>
            <Text>生成风格：</Text>
            <Select
              value={selectedStyle}
              onChange={setSelectedStyle}
              style={{ width: 160, marginLeft: 8 }}
              options={STYLE_OPTIONS}
            />
          </div>
          <Button
            type="primary"
            size="large"
            icon={<RocketOutlined />}
            loading={loading}
            onClick={() => handleCreateCards(selectedStyle)}
          >
            创建首尾帧卡片
          </Button>
        </Space>

        <div>
          <Button icon={<ThunderboltOutlined />} loading={loading || state === 'generating_keyframes'} disabled={loading || state === 'generating_keyframes'} onClick={() => startKeyframeGeneration(entityId)}>
            {loading || state === 'generating_keyframes' ? '正在生成...' : '一键批量生成（旧版纯文本生图）'}
          </Button>
        </div>
      </div>
    );
  }

  // --- States with cards ---
  if (['generating_keyframes', 'completed'].includes(state) || cardsCreated) {
    return (
      <div>
        <Title level={4}>首尾帧图片生成</Title>
        <Alert
          message={`首尾帧卡片：共 ${filteredKeyframes.length} 个（已完成: ${completedCount}${pendingCount > 0 ? `, 待生成: ${pendingCount}` : ''}${failedCount > 0 ? `, 失败: ${failedCount}` : ''}）`}
          type={pendingCount === 0 ? 'success' : 'info'}
          showIcon
          style={{ marginBottom: 16 }}
          action={
            pendingCount > 0 ? (
              <Button
                type="primary"
                size="small"
                icon={<ThunderboltOutlined />}
                loading={loading || state === 'generating_keyframes'}
                disabled={loading || state === 'generating_keyframes'}
                onClick={handleGenerateAll}
              >
                {loading || state === 'generating_keyframes' ? '正在生成...' : `一键生成全部 (${pendingCount})`}
              </Button>
            ) : undefined
          }
        />

        {showDualVersion && (
          <Tabs
            activeKey={activeVersion}
            onChange={(v) => { setActiveVersion(v); fetchKeyframes(v); }}
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

        <div style={{ marginBottom: 16 }}>
          <Space>
            <Text>风格：</Text>
            <Select
              value={selectedStyle}
              onChange={setSelectedStyle}
              style={{ width: 140 }}
              options={STYLE_OPTIONS}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => handleCreateCards(selectedStyle)}
            >
              重建卡片
            </Button>
          </Space>
        </div>

        {filteredKeyframes.length > 0 ? (
          <Row gutter={[12, 12]}>
            {filteredKeyframes.map(renderCard)}
          </Row>
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">当前版本暂无数据，请先创建首尾帧卡片</Text>
          </div>
        )}

        {/* Detail Modal */}
        <Modal
          title={selectedKf?.name || selectedKf?.storyboard_title || '首尾帧详情'}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          footer={null}
          width={800}
          style={{ top: 20 }}
        >
          {selectedKf && (
            <div>
              <Space wrap style={{ marginBottom: 16 }}>
                <Tag color={selectedKf.storyboard_version === 'seedance' ? 'purple' : 'cyan'}>
                  {selectedKf.storyboard_version === 'seedance' ? 'Seedance 2.0' : selectedKf.storyboard_version === 'sora' ? 'Sora-2' : 'Standard'}
                </Tag>
                <Tag color={selectedKf.status === 'completed' ? 'green' : selectedKf.status === 'failed' ? 'red' : 'blue'}>
                  {selectedKf.status === 'completed' ? '已生成' : selectedKf.status === 'failed' ? '失败' : '待生成'}
                </Tag>
                {selectedKf.camera_angle && (
                  <Tag icon={<CameraOutlined />} color="green">{selectedKf.camera_angle}</Tag>
                )}
                {selectedKf.camera_movement && selectedKf.camera_movement !== 'static' && selectedKf.camera_movement !== '固定' && (
                  <Tag color="orange">{selectedKf.camera_movement}</Tag>
                )}
              </Space>

              <Paragraph>
                <Text strong>章节：</Text>{selectedKf.chapter_title} &gt; {selectedKf.scene_title}
              </Paragraph>

              {selectedKf.image_url && selectedKf.image_url !== 'pending' && (
                <Card title="生成结果" size="small" style={{ marginBottom: 12 }}>
                  <Row gutter={12}>
                    <Col span={selectedKf.thumbnail_url ? 12 : 24}>
                      <div style={{ textAlign: 'center', marginBottom: 4 }}>
                        <Tag color="blue">首帧</Tag>
                      </div>
                      <Image src={selectedKf.image_url} style={{ width: '100%', maxHeight: 400, objectFit: 'contain' }} />
                    </Col>
                    {selectedKf.thumbnail_url && (
                      <Col span={12}>
                        <div style={{ textAlign: 'center', marginBottom: 4 }}>
                          <Tag color="orange">尾帧</Tag>
                        </div>
                        <Image src={selectedKf.thumbnail_url} style={{ width: '100%', maxHeight: 400, objectFit: 'contain' }} />
                      </Col>
                    )}
                  </Row>
                </Card>
              )}

              <Card title="首尾帧提示词" size="small" style={{ marginBottom: 12 }}>
                <Paragraph
                  style={{
                    whiteSpace: 'pre-wrap',
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    padding: 16,
                    borderRadius: 8,
                    fontFamily: 'monospace',
                    fontSize: 13,
                    lineHeight: 1.6,
                    maxHeight: 300,
                    overflow: 'auto',
                  }}
                >
                  {selectedKf.prompt}
                </Paragraph>
              </Card>

              {(selectedKf.seedance_prompt || selectedKf.sora_prompt) && (
                <Card
                  title={selectedKf.storyboard_version === 'seedance' ? 'Seedance 2.0 分镜' : 'Sora-2 分镜'}
                  size="small"
                >
                  <Paragraph
                    style={{
                      whiteSpace: 'pre-wrap',
                      background: '#1e1e1e',
                      color: '#d4d4d4',
                      padding: 16,
                      borderRadius: 8,
                      fontFamily: 'monospace',
                      fontSize: 13,
                      lineHeight: 1.6,
                      maxHeight: 300,
                      overflow: 'auto',
                    }}
                  >
                    {selectedKf.seedance_prompt || selectedKf.sora_prompt}
                  </Paragraph>
                </Card>
              )}
            </div>
          )}
        </Modal>
      </div>
    );
  }

  return null;
};

export default Step4Keyframes;
