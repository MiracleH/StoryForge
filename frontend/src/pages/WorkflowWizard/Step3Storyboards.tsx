import React, { useEffect, useState, useRef } from 'react';
import { Button, Typography, Alert, Spin, Card, Row, Col, Tag, Space, Tabs, Modal } from 'antd';
import { VideoCameraOutlined, RocketOutlined, ClockCircleOutlined, CameraOutlined, ReloadOutlined, ExpandOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useWorkflowStore, useEpisodeWorkflowStore } from '../../stores';
import { workflowAPI, episodeWorkflowAPI } from '../../services/api';

const { Title, Text, Paragraph } = Typography;

interface Props {
  projectId: number;
  episodeId?: number;
}

interface StoryboardItem {
  id: number;
  scene_id: number;
  title: string;
  description: string;
  duration: number;
  camera_angle: string;
  camera_movement: string;
  order_index: number;
  transition_type: string;
  transition_duration: number;
  scene_title: string;
  scene_order: number;
  chapter_title: string;
  chapter_order: number;
  version: string;
  seedance_prompt?: string;
  sora_prompt?: string;
}

const VERSION_TABS = [
  { key: 'seedance', label: 'Seedance 2.0' },
  { key: 'sora', label: 'Sora-2' },
];

const Step3Storyboards: React.FC<Props> = ({ projectId, episodeId }) => {
  const isEpisodeMode = !!episodeId;
  const projectStore = useWorkflowStore();
  const episodeStore = useEpisodeWorkflowStore();

  const status = isEpisodeMode ? episodeStore.status : projectStore.status;
  const loading = isEpisodeMode ? episodeStore.loading : projectStore.loading;
  const streamContent = isEpisodeMode ? episodeStore.streamContent : projectStore.streamContent;
  const streamContentSeedance = isEpisodeMode ? episodeStore.streamContentSeedance : '';
  const streamContentSora = isEpisodeMode ? episodeStore.streamContentSora : '';
  const startStoryboardGenerationStream = isEpisodeMode ? episodeStore.startStoryboardGenerationStream : projectStore.startStoryboardGenerationStream;
  const startKeyframeGeneration = isEpisodeMode ? episodeStore.startKeyframeGeneration : projectStore.startKeyframeGeneration;
  const entityId = isEpisodeMode ? episodeId! : projectId;
  const api = isEpisodeMode ? episodeWorkflowAPI : workflowAPI;

  const [storyboards, setStoryboards] = useState<StoryboardItem[]>([]);
  const [activeVersion, setActiveVersion] = useState('seedance');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSb, setSelectedSb] = useState<StoryboardItem | null>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);

  const state = status?.state || 'idle';
  const showDualVersion = isEpisodeMode;

  useEffect(() => {
    if (state === 'storyboards_ready' || state === 'generating_keyframes' || state === 'completed') {
      api.getStoryboards(entityId).then((res: any) => {
        setStoryboards((res as any).data || res || []);
      }).catch(() => {});
    }
  }, [state, entityId]);

  useEffect(() => {
    if (streamContent || streamContentSeedance || streamContentSora) {
      streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamContent, streamContentSeedance, streamContentSora]);

  const handleGenerate = async (version?: string) => {
    try {
      if (isEpisodeMode) {
        await episodeStore.startStoryboardGenerationStream(entityId, version || 'both');
      } else {
        await (startStoryboardGenerationStream as any)(entityId);
      }
    } catch {}
  };

  const handleNextStep = async () => {
    try { await startKeyframeGeneration(entityId); } catch {}
  };

  const openModal = (sb: StoryboardItem) => {
    setSelectedSb(sb);
    setModalOpen(true);
  };

  // Filter storyboards by version
  const filteredStoryboards = showDualVersion
    ? storyboards.filter(sb => sb.version === activeVersion)
    : storyboards;

  // Group storyboards by chapter/scene
  const grouped = new Map<string, StoryboardItem[]>();
  for (const sb of filteredStoryboards) {
    const key = `${sb.chapter_title || '未命名章节'} > ${sb.scene_title || '未命名场景'}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(sb);
  }

  const currentStreamContent = showDualVersion
    ? (activeVersion === 'seedance' ? streamContentSeedance : streamContentSora)
    : streamContent;

  // --- State: assets_ready (start button) ---
  if (state === 'assets_ready') {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <VideoCameraOutlined style={{ fontSize: 48, color: '#13c2c2', marginBottom: 16 }} />
        <Title level={4}>分镜生成</Title>
        <Paragraph type="secondary" style={{ maxWidth: 500, margin: '0 auto 24px' }}>
          {showDualVersion
            ? 'AI 将基于剧本生成双版本分镜：Seedance 2.0（中文分镜脚本）和 Sora-2（英文视频提示词）。'
            : 'AI 将基于已审核的剧本，为每个场景生成详细的分镜 JSON。'}
        </Paragraph>
        {showDualVersion ? (
          <Space direction="vertical" size={12}>
            <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading || state === 'generating_storyboards'} disabled={loading || state === 'generating_storyboards'} onClick={() => handleGenerate('both')}>
              {loading || state === 'generating_storyboards' ? '正在生成...' : '一键生成双版本分镜'}
            </Button>
            <Space size={8}>
              <Button icon={<ThunderboltOutlined />} loading={loading || state === 'generating_storyboards'} disabled={loading || state === 'generating_storyboards'} onClick={() => handleGenerate('seedance')}>
                {loading || state === 'generating_storyboards' ? '正在生成...' : '仅生成 Seedance 2.0'}
              </Button>
              <Button icon={<ThunderboltOutlined />} loading={loading || state === 'generating_storyboards'} disabled={loading || state === 'generating_storyboards'} onClick={() => handleGenerate('sora')}>
                {loading || state === 'generating_storyboards' ? '正在生成...' : '仅生成 Sora-2'}
              </Button>
            </Space>
          </Space>
        ) : (
          <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading || state === 'generating_storyboards'} disabled={loading || state === 'generating_storyboards'} onClick={() => handleGenerate()}>
            {loading || state === 'generating_storyboards' ? '正在生成...' : '开始生成分镜'}
          </Button>
        )}
      </div>
    );
  }

  // --- State: generating_storyboards ---
  if (state === 'generating_storyboards') {
    return (
      <div>
        <Alert message="分镜生成中" description="AI 正在生成分镜，请耐心等待。" type="info" showIcon style={{ marginBottom: 16 }} />
        {showDualVersion && (
          <Tabs
            activeKey={activeVersion}
            onChange={setActiveVersion}
            items={VERSION_TABS.map(t => ({
              key: t.key,
              label: (
                <span>
                  {t.label}
                  {(t.key === 'seedance' && streamContentSeedance) || (t.key === 'sora' && streamContentSora)
                    ? <Spin size="small" style={{ marginLeft: 8 }} />
                    : null}
                </span>
              ),
            }))}
            style={{ marginBottom: 8 }}
          />
        )}
        {currentStreamContent && (
          <div style={{
            background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8,
            fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            maxHeight: 400, overflow: 'auto',
          }}>
            {currentStreamContent}
            {loading && <Spin size="small" style={{ marginLeft: 8 }} />}
            <div ref={streamEndRef} />
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => handleGenerate(showDualVersion ? 'both' : undefined)}>
            重新生成
          </Button>
        </div>
      </div>
    );
  }

  // --- State: storyboards_ready ---
  if (state === 'storyboards_ready') {
    const totalDuration = filteredStoryboards.reduce((sum, sb) => sum + (sb.duration || 0), 0);
    const seedanceCount = storyboards.filter(sb => sb.version === 'seedance').length;
    const soraCount = storyboards.filter(sb => sb.version === 'sora').length;

    return (
      <div>
        <Title level={4}>分镜预览</Title>
        <Alert
          message={showDualVersion
            ? `分镜生成完成：Seedance ${seedanceCount} 个 + Sora-2 ${soraCount} 个`
            : `分镜生成完成，共 ${storyboards.length} 个分镜，总时长约 ${totalDuration} 秒`}
          type="success" showIcon style={{ marginBottom: 16 }}
        />

        {showDualVersion && (
          <Tabs
            activeKey={activeVersion}
            onChange={setActiveVersion}
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

        {filteredStoryboards.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            {Array.from(grouped.entries()).map(([groupKey, sbs]) => (
              <div key={groupKey} style={{ marginBottom: 20 }}>
                <Title level={5} style={{ marginBottom: 8 }}>{groupKey}</Title>
                <Row gutter={[12, 12]}>
                  {sbs.map(sb => (
                    <Col key={sb.id} xs={24} sm={12} md={8} lg={6}>
                      <Card
                        size="small"
                        title={sb.title || `分镜 #${sb.order_index + 1}`}
                        hoverable
                        onClick={() => openModal(sb)}
                        extra={<ExpandOutlined style={{ color: '#999' }} />}
                      >
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Text type="secondary" ellipsis={{ rows: 2 }}>
                            {sb.description}
                          </Text>
                          <Space size={8} wrap>
                            <Tag icon={<ClockCircleOutlined />} color="blue">{sb.duration}秒</Tag>
                            <Tag icon={<CameraOutlined />} color="green">{sb.camera_angle}</Tag>
                            {sb.camera_movement && sb.camera_movement !== 'static' && sb.camera_movement !== '固定' && (
                              <Tag color="orange">{sb.camera_movement}</Tag>
                            )}
                          </Space>
                          {(sb.seedance_prompt || sb.sora_prompt) && (
                            <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                              {(sb.seedance_prompt || sb.sora_prompt || '').slice(0, 80)}...
                            </Text>
                          )}
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => handleGenerate(showDualVersion ? 'both' : undefined)}>重新生成</Button>
            <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading} onClick={handleNextStep}>
              下一步：生成首尾帧图片
            </Button>
          </Space>
        </div>

        {/* Detail Modal */}
        <Modal
          title={selectedSb?.title || '分镜详情'}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          footer={null}
          width={800}
          style={{ top: 20 }}
        >
          {selectedSb && (
            <div>
              <Space wrap style={{ marginBottom: 16 }}>
                <Tag icon={<ClockCircleOutlined />} color="blue">{selectedSb.duration}秒</Tag>
                <Tag icon={<CameraOutlined />} color="green">{selectedSb.camera_angle}</Tag>
                {selectedSb.camera_movement && selectedSb.camera_movement !== 'static' && selectedSb.camera_movement !== '固定' && (
                  <Tag color="orange">{selectedSb.camera_movement}</Tag>
                )}
                <Tag>{selectedSb.transition_type}</Tag>
                <Tag color={selectedSb.version === 'seedance' ? 'purple' : 'cyan'}>
                  {selectedSb.version === 'seedance' ? 'Seedance 2.0' : selectedSb.version === 'sora' ? 'Sora-2' : 'Standard'}
                </Tag>
              </Space>

              <Paragraph>
                <Text strong>场景：</Text>
                {selectedSb.chapter_title} &gt; {selectedSb.scene_title}
              </Paragraph>

              <Card title="镜头描述" size="small" style={{ marginBottom: 12 }}>
                <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{selectedSb.description}</Paragraph>
              </Card>

              {(selectedSb.seedance_prompt || selectedSb.sora_prompt) && (
                <Card title={selectedSb.version === 'seedance' ? 'Seedance 2.0 完整提示词' : 'Sora-2 完整提示词'} size="small" style={{ marginBottom: 12 }}>
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
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    {selectedSb.seedance_prompt || selectedSb.sora_prompt}
                  </Paragraph>
                </Card>
              )}
            </div>
          )}
        </Modal>
      </div>
    );
  }

  // --- State: generating_keyframes / completed ---
  if (['generating_keyframes', 'completed'].includes(state)) {
    const seedanceCount = storyboards.filter(sb => sb.version === 'seedance').length;
    const soraCount = storyboards.filter(sb => sb.version === 'sora').length;

    return (
      <div>
        <Title level={4}>分镜结果</Title>
        {showDualVersion ? (
          <>
            <Alert
              message={`双版本分镜完成：Seedance ${seedanceCount} 个 + Sora-2 ${soraCount} 个`}
              description="分镜已生成并进入首尾帧阶段。可重新生成覆盖现有分镜。"
              type="success" showIcon style={{ marginBottom: 16 }}
            />
            <Tabs
              activeKey={activeVersion}
              onChange={setActiveVersion}
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
            {filteredStoryboards.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                {Array.from(grouped.entries()).map(([groupKey, sbs]) => (
                  <div key={groupKey} style={{ marginBottom: 20 }}>
                    <Title level={5} style={{ marginBottom: 8 }}>{groupKey}</Title>
                    <Row gutter={[12, 12]}>
                      {sbs.map(sb => (
                        <Col key={sb.id} xs={24} sm={12} md={8} lg={6}>
                          <Card
                            size="small"
                            title={sb.title || `分镜 #${sb.order_index + 1}`}
                            hoverable
                            onClick={() => openModal(sb)}
                            extra={<ExpandOutlined style={{ color: '#999' }} />}
                          >
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Text type="secondary" ellipsis={{ rows: 2 }}>{sb.description}</Text>
                              <Space size={8} wrap>
                                <Tag icon={<ClockCircleOutlined />} color="blue">{sb.duration}秒</Tag>
                                <Tag icon={<CameraOutlined />} color="green">{sb.camera_angle}</Tag>
                                {sb.camera_movement && sb.camera_movement !== 'static' && sb.camera_movement !== '固定' && (
                                  <Tag color="orange">{sb.camera_movement}</Tag>
                                )}
                              </Space>
                            </Space>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  </div>
                ))}
              </div>
            )}

            <div style={{ textAlign: 'center' }}>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => handleGenerate('both')}>
                重新生成双版本分镜
              </Button>
            </div>
          </>
        ) : (
          <>
            <Alert
              message={`分镜生成完成，共 ${storyboards.length} 个分镜`}
              description="分镜 JSON 已生成。可重新生成覆盖现有分镜。"
              type="success" showIcon style={{ marginBottom: 16 }}
            />
            <div style={{ textAlign: 'center' }}>
              <Button icon={<ReloadOutlined />} onClick={() => handleGenerate()}>重新生成</Button>
            </div>
          </>
        )}

        <Modal
          title={selectedSb?.title || '分镜详情'}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          footer={null}
          width={800}
          style={{ top: 20 }}
        >
          {selectedSb && (
            <div>
              <Space wrap style={{ marginBottom: 16 }}>
                <Tag icon={<ClockCircleOutlined />} color="blue">{selectedSb.duration}秒</Tag>
                <Tag icon={<CameraOutlined />} color="green">{selectedSb.camera_angle}</Tag>
                {selectedSb.camera_movement && selectedSb.camera_movement !== 'static' && selectedSb.camera_movement !== '固定' && (
                  <Tag color="orange">{selectedSb.camera_movement}</Tag>
                )}
                <Tag color={selectedSb.version === 'seedance' ? 'purple' : 'cyan'}>
                  {selectedSb.version === 'seedance' ? 'Seedance 2.0' : selectedSb.version === 'sora' ? 'Sora-2' : 'Standard'}
                </Tag>
              </Space>

              <Card title="镜头描述" size="small" style={{ marginBottom: 12 }}>
                <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{selectedSb.description}</Paragraph>
              </Card>

              {(selectedSb.seedance_prompt || selectedSb.sora_prompt) && (
                <Card title={selectedSb.version === 'seedance' ? 'Seedance 2.0 完整提示词' : 'Sora-2 完整提示词'} size="small">
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
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    {selectedSb.seedance_prompt || selectedSb.sora_prompt}
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

export default Step3Storyboards;
