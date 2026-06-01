import React, { useEffect, useState } from 'react';
import { Button, Typography, Progress, Card, Row, Col, Tag, Alert, Space, Tabs, Input, message, Modal, Image, Radio, Select, Spin } from 'antd';
import { PictureOutlined, RocketOutlined, SoundOutlined, ReloadOutlined, EditOutlined, WarningOutlined, BulbOutlined } from '@ant-design/icons';
import { useWorkflowStore, useEpisodeWorkflowStore, useProjectStore } from '../../stores';
import { workflowAPI, episodeWorkflowAPI } from '../../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const AssetImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff2f0' }}>
        <div style={{ textAlign: 'center' }}>
          <WarningOutlined style={{ fontSize: 32, color: '#faad14' }} />
          <br /><Text type="warning" style={{ fontSize: 12 }}>图片加载失败</Text>
        </div>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      style={{ height: 160, objectFit: 'cover' }}
      preview={{ mask: '点击预览' }}
      onError={() => setError(true)}
    />
  );
};

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
  const approveScript = isEpisodeMode ? episodeStore.approveScript : projectStore.approveScript;
  const startAssetGeneration = isEpisodeMode ? episodeStore.startAssetGeneration : projectStore.startAssetGeneration;
  const createAssetCards = isEpisodeMode ? episodeStore.createAssetCards : projectStore.createAssetCards;
  const recreateAssetCards = isEpisodeMode ? episodeStore.recreateAssetCards : projectStore.recreateAssetCards;
  const generateSingleAsset = isEpisodeMode ? episodeStore.generateSingleAsset : projectStore.generateSingleAsset;
  const startStoryboardGenerationStream = isEpisodeMode ? episodeStore.startStoryboardGenerationStream : projectStore.startStoryboardGenerationStream;
  const retryFailed = isEpisodeMode ? episodeStore.retryFailed : projectStore.retryFailed;
  const entityId = isEpisodeMode ? episodeId! : projectId;
  const api = isEpisodeMode ? episodeWorkflowAPI : workflowAPI;

  const { currentProject } = useProjectStore();
  const [assets, setAssets] = useState<AssetCard[]>([]);
  const [editingAsset, setEditingAsset] = useState<AssetCard | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editVoicePrompt, setEditVoicePrompt] = useState('');
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [styleRecs, setStyleRecs] = useState<any[]>([]);
  const [styleAnalysis, setStyleAnalysis] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleOptions, setStyleOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [promptModal, setPromptModal] = useState<{ title: string; prompt: string } | null>(null);

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

  useEffect(() => {
    if (state === 'reviewing') {
      setStyleLoading(true);
      api.suggestStyles(entityId, {})
        .then((res: any) => {
          setStyleRecs(res.data.recommendations || []);
          setStyleAnalysis(res.data.analysis || '');
          setSelectedStyle(res.data.current || (res.data.recommendations?.[0]?.style_key) || 'anime');
        })
        .catch(() => {})
        .finally(() => setStyleLoading(false));
    }
  }, [state, entityId]);

  // 加载可选风格列表（用于 assets_ready 阶段的风格切换）
  useEffect(() => {
    workflowAPI.getStyleOptions().then((res: any) => {
      setStyleOptions((res.data || res).style_presets || []);
    }).catch(() => {});
  }, []);

  // 首次进入 assets_ready 时，从 status 同步当前风格到 selectedStyle
  useEffect(() => {
    if (!selectedStyle && status?.style_preset) {
      setSelectedStyle(status.style_preset);
    }
  }, [status?.style_preset, selectedStyle]);

  const handleApproveAndEnterAssets = async () => {
    if (selectedStyle) {
      try { await api.setStyle(entityId, selectedStyle); } catch {}
    }
    try { await approveScript(entityId); } catch {}
  };

  const handleGenerate = async () => {
    if (selectedStyle) {
      try { await api.setStyle(entityId, selectedStyle); } catch {}
    }
    try { await startAssetGeneration(entityId); } catch {}
  };

  const handleCreateCards = async () => {
    if (selectedStyle) {
      try { await api.setStyle(entityId, selectedStyle); } catch {}
    }
    try {
      await createAssetCards(entityId);
      fetchAssets();
    } catch {}
  };

  const handleRecreateCards = async () => {
    try {
      await recreateAssetCards(entityId, selectedStyle);
      message.success('素材卡片已重新生成');
      fetchAssets();
    } catch {
      message.error('重生成素材卡片失败');
    }
  };

  const handleNextStep = async () => {
    try {
      await startStoryboardGenerationStream(entityId);
    } catch {
      message.error('启动分镜生成失败');
    }
  };

  const handleGenerateSingle = async (assetId: number) => {
    setGeneratingIds(prev => new Set(prev).add(assetId));
    try {
      await generateSingleAsset(entityId, assetId);
      message.success('素材生成已完成');
      fetchAssets();
    } catch {
      message.error('素材生成失败');
    } finally {
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    }
  };

  const handleRegenerate = async (assetId: number) => {
    try {
      await api.regenerateAsset(entityId, assetId);
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
            <AssetImage src={asset.image_url} alt={asset.name} />
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
              {asset.status === 'failed' ? (
                <div style={{ textAlign: 'center' }}>
                  <PictureOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />
                  <br /><Text type="danger" style={{ fontSize: 12 }}>生成失败</Text>
                </div>
              ) : (
                <PictureOutlined style={{ fontSize: 32, color: '#ccc' }} />
              )}
            </div>
          )
        }
        actions={[
          asset.status === 'pending' || generatingIds.has(asset.id) ? (
            <Button key="gen" type="link" size="small" icon={<RocketOutlined />}
              loading={generatingIds.has(asset.id)}
              disabled={generatingIds.has(asset.id)}
              onClick={() => handleGenerateSingle(asset.id)}
            >{generatingIds.has(asset.id) ? '生成中' : '生成'}</Button>
          ) : (
            <Button key="edit" type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(asset)}>编辑</Button>
          ),
          asset.status !== 'pending' && !generatingIds.has(asset.id) && (
            <Button key="regen" type="link" size="small" icon={<ReloadOutlined />} onClick={() => handleRegenerate(asset.id)}>重生成</Button>
          ),
          asset.voice_prompt ? (
            <Button key="audio" type="link" size="small" icon={<SoundOutlined />} onClick={() => handleGenerateAudio(asset.id)}>语音</Button>
          ) : <span key="no-audio" />,
        ].filter(Boolean)}
      >
        <Card.Meta
          title={
            <Space>
              {asset.name}
              {generatingIds.has(asset.id) ? (
                <Tag color="processing">生成中</Tag>
              ) : (
                <Tag color={asset.status === 'completed' ? 'green' : asset.status === 'failed' ? 'red' : asset.status === 'generating' ? 'processing' : 'blue'}>{asset.status}</Tag>
              )}
            </Space>
          }
          description={
            <>
              <Text type="secondary" ellipsis={{ tooltip: true }}>{asset.description}</Text>
              {asset.prompt && (
                <div style={{ marginTop: 4 }}>
                  <Button type="link" size="small" style={{ padding: 0, fontSize: 11, height: 'auto' }}
                    onClick={() => setPromptModal({ title: asset.name, prompt: asset.prompt })}>
                    查看生成提示词
                  </Button>
                </div>
              )}
            </>
          }
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
        <div style={{ textAlign: 'center', padding: 20 }}>
          <PictureOutlined style={{ fontSize: 48, color: '#722ed1', marginBottom: 16 }} />
          <Paragraph type="secondary" style={{ maxWidth: 500, margin: '0 auto 16px' }}>
            选择视觉风格，AI 将据此生成统一风格的素材图。
          </Paragraph>

          {styleLoading ? (
            <div style={{ padding: 40 }}><Spin tip="AI 正在分析故事推荐风格..." /></div>
          ) : styleRecs.length > 0 && (
            <div style={{ maxWidth: 700, margin: '0 auto 24px' }}>
              {styleAnalysis && (
                <Alert message={styleAnalysis} type="info" showIcon icon={<BulbOutlined />} style={{ marginBottom: 16, textAlign: 'left' }} />
              )}
              <Radio.Group value={selectedStyle} onChange={e => setSelectedStyle(e.target.value)} style={{ width: '100%' }}>
                <Row gutter={[12, 12]}>
                  {styleRecs.map((s: any) => (
                    <Col key={s.style_key} xs={24} sm={12}>
                      <Radio.Button value={s.style_key} style={{ width: '100%', height: '100%', borderRadius: 8, padding: 12 }}>
                        <div style={{ textAlign: 'left' }}>
                          <Text strong>{s.label}</Text>
                          <Tag style={{ marginLeft: 8 }}>{s.style_key}</Tag>
                          {s.reason && <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>{s.reason}</Paragraph>}
                        </div>
                      </Radio.Button>
                    </Col>
                  ))}
                </Row>
              </Radio.Group>
            </div>
          )}

          <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading} onClick={handleApproveAndEnterAssets}
            disabled={!selectedStyle || styleLoading}>
            确认风格并进入素材生成
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
          {characters.length === 0 && backgrounds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Button type="primary" size="large" icon={<PictureOutlined />} loading={loading} onClick={handleCreateCards}>
                创建素材卡片
              </Button>
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                从角色库和场景库生成素材卡片，然后逐个生成图片
              </Text>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <Space>
                  <Text strong>切换风格：</Text>
                  <Select
                    value={selectedStyle || status?.style_preset || 'anime'}
                    onChange={setSelectedStyle}
                    style={{ width: 160 }}
                    options={styleOptions}
                  />
                  <Button icon={<ReloadOutlined />} loading={loading} onClick={handleRecreateCards}>
                    重新生成素材卡（应用新风格）
                  </Button>
                </Space>
              </div>
              {assets.some(a => a.status === 'pending') && (
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading || state === 'generating_assets'} disabled={loading || state === 'generating_assets'} onClick={handleGenerate}>
                    {loading || state === 'generating_assets' ? '正在生成...' : '一键生成全部图片'}
                  </Button>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {assets.some(a => a.status === 'pending') ? (
                  <Text type="secondary">点击卡片上的"生成"按钮逐个生成图片，或点击"一键生成全部图片"批量生成。</Text>
                ) : (
                  <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading} onClick={handleNextStep}>
                    下一步：生成分镜
                  </Button>
                )}
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
            </>
          )}
        </div>
      )}

      <Modal title={`提示词 - ${promptModal?.title || ''}`} open={!!promptModal} onCancel={() => setPromptModal(null)} footer={null} width={700}>
        {promptModal && (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13, lineHeight: 1.8, maxHeight: 500, overflow: 'auto', background: '#fafafa', padding: 16, borderRadius: 8 }}>
            {promptModal.prompt}
          </div>
        )}
      </Modal>

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
