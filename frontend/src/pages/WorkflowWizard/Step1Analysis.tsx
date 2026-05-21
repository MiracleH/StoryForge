import React, { useState, useRef, useEffect } from 'react';
import { Button, Alert, Spin, Typography, Card, Descriptions, Input, Space, Divider, List } from 'antd';
import { BulbOutlined, CheckCircleOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { useWorkflowStore, useEpisodeWorkflowStore } from '../../stores';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Props {
  projectId: number;
  episodeId?: number;
}

const Step1Analysis: React.FC<Props> = ({ projectId, episodeId }) => {
  const isEpisodeMode = !!episodeId;
  const projectStore = useWorkflowStore();
  const episodeStore = useEpisodeWorkflowStore();

  const store = isEpisodeMode ? episodeStore : projectStore;
  const entityId = isEpisodeMode ? episodeId! : projectId;

  const { status, loading, streamContent } = store;
  const script = status?.script;
  const startAnalysis = isEpisodeMode ? episodeStore.startAnalysis : projectStore.startAnalysis;
  const startAnalysisTypeChat = isEpisodeMode ? episodeStore.startAnalysisTypeChat : projectStore.startAnalysisTypeChat;
  const reviewScriptStream = isEpisodeMode ? episodeStore.reviewScriptStream : projectStore.reviewScriptStream;
  const reviewTypeChat = isEpisodeMode ? episodeStore.reviewTypeChat : projectStore.reviewTypeChat;
  const reviseScriptStream = isEpisodeMode ? episodeStore.reviseScriptStream : projectStore.reviseScriptStream;
  const approveScript = isEpisodeMode ? episodeStore.approveScript : projectStore.approveScript;

  const [feedback, setFeedback] = useState('');
  const [reviseResult, setReviseResult] = useState<any>(null);
  const [reviewDone, setReviewDone] = useState(false);
  const streamEndRef = useRef<HTMLDivElement>(null);

  const state = status?.state || 'idle';
  const analysis = status?.analysis;

  useEffect(() => {
    if (streamContent) {
      streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamContent]);

  const handleAnalyze = async () => {
    setReviewDone(false);
    setReviseResult(null);
    try { await startAnalysis(entityId); } catch {}
  };

  const handleAnalyzeTypeChat = async () => {
    setReviewDone(false);
    setReviseResult(null);
    try { await startAnalysisTypeChat(entityId); } catch {}
  };

  const handleReviewTypeChat = async () => {
    setReviseResult(null);
    try {
      const result = await reviewTypeChat(entityId);
      if (result) {
        setReviseResult({ review: result });
      }
      setReviewDone(true);
    } catch {}
  };

  const handleReview = async () => {
    setReviseResult(null);
    try {
      const result = await reviewScriptStream(entityId);
      if (result?.review) {
        setReviseResult({ review: result.review });
      }
      setReviewDone(true);
    } catch {}
  };

  const handleRevise = async () => {
    if (!feedback.trim()) return;
    setReviseResult(null);
    try {
      const result = await reviseScriptStream(entityId, feedback);
      if (result) setReviseResult(result);
      setFeedback('');
    } catch {}
  };

  const handleApprove = async () => {
    try { await approveScript(entityId); } catch {}
  };

  if (state === 'idle') {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <BulbOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
        <Title level={4}>AI 剧本分析</Title>
        <Paragraph type="secondary">
          {isEpisodeMode
            ? 'AI 将分析本集的小说文本片段，提取章节、场景、角色、对白，并自动生成素材提示词。'
            : 'AI 将分析小说文本，提取章节、场景、角色、对白，并自动生成素材提示词。'}
        </Paragraph>
        <Space size="large">
          <Button type="primary" size="large" loading={loading} onClick={handleAnalyze}>
            流式分析
          </Button>
          <Button size="large" loading={loading} onClick={handleAnalyzeTypeChat}>
            TypeChat 分析
          </Button>
        </Space>
      </div>
    );
  }

  if (state === 'analyzing') {
    return (
      <div>
        <Alert message="AI 正在分析剧本" description="正在提取章节、场景、角色、对白信息，并生成素材提示词" type="info" showIcon style={{ marginBottom: 16 }} />
        {streamContent && (
          <Card
            size="small"
            title="AI 分析输出"
            style={{ marginBottom: 16, maxHeight: 400, overflow: 'auto' }}
            styles={{ body: { fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 } }}
          >
            {streamContent}
            {loading && <Spin size="small" style={{ marginLeft: 8 }} />}
            <div ref={streamEndRef} />
          </Card>
        )}
        {!streamContent && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>等待 AI 响应...</Text>
          </div>
        )}
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Alert message="分析失败" description={status?.error} type="error" showIcon style={{ marginBottom: 16 }} />
        <Button icon={<ReloadOutlined />} onClick={handleAnalyze}>重新分析</Button>
      </div>
    );
  }

  if (state === 'reviewing') {
    return (
      <div>
        <Title level={4}>剧本审核</Title>

        {analysis && (
          <Card size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={4} size="small">
              <Descriptions.Item label="章节数">{analysis.chapters}</Descriptions.Item>
              <Descriptions.Item label="角色数">{analysis.characters}</Descriptions.Item>
              <Descriptions.Item label="道具数">{analysis.props || 0}</Descriptions.Item>
              <Descriptions.Item label="对白数">{analysis.dialogues}</Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        {script && (
          <Card size="small" title="漫剧剧本" style={{ marginBottom: 16, maxHeight: 400, overflow: 'auto' }}
            styles={{ body: { fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 } }}>
            {script}
          </Card>
        )}

        {/* 审核按钮 */}
        {!reviewDone && !loading && !streamContent && (
          <div style={{ textAlign: 'center', padding: '20px 0', marginBottom: 16 }}>
            <Space size="large">
              <Button type="primary" size="large" icon={<BulbOutlined />} onClick={handleReview} loading={loading}>
                流式审核
              </Button>
              <Button size="large" icon={<BulbOutlined />} onClick={handleReviewTypeChat} loading={loading}>
                TypeChat 审核
              </Button>
            </Space>
          </div>
        )}

        {/* 流式输出区域 */}
        {streamContent && (
          <Card
            size="small"
            title="AI 审核输出"
            style={{ marginBottom: 16, maxHeight: 400, overflow: 'auto' }}
            styles={{ body: { fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 } }}
          >
            {streamContent}
            {loading && <Spin size="small" style={{ marginLeft: 8 }} />}
            <div ref={streamEndRef} />
          </Card>
        )}

        {/* 审核结果 */}
        {reviseResult?.review && (
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {reviseResult.review.approved ? (
                <Alert message="AI 审核通过" type="success" showIcon />
              ) : (
                <Alert message="AI 审核发现问题" type="warning" showIcon />
              )}

              {reviseResult.review.issues?.length > 0 && (
                <div>
                  <Text strong>问题：</Text>
                  <List size="small" dataSource={reviseResult.review.issues}
                    renderItem={(item: string) => <List.Item><Text type="danger">{item}</Text></List.Item>} />
                </div>
              )}

              {reviseResult.review.suggestions?.length > 0 && (
                <div>
                  <Text strong>建议：</Text>
                  <List size="small" dataSource={reviseResult.review.suggestions}
                    renderItem={(item: string) => <List.Item><Text type="secondary">{item}</Text></List.Item>} />
                </div>
              )}
            </Space>
          </Card>
        )}

        <Divider />

        <Card title="修改方案" size="small" style={{ marginBottom: 16 }}>
          <TextArea
            rows={3}
            placeholder="输入修改意见，例如：第三章的场景描述需要更详细，角色A的性格应该更果断..."
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <Space>
            <Button icon={<EditOutlined />} loading={loading} disabled={!feedback.trim()} onClick={handleRevise}>
              提交修改
            </Button>
            <Button type="primary" icon={<CheckCircleOutlined />} disabled={loading} onClick={handleApprove}>
              确认通过，开始生成素材
            </Button>
          </Space>
        </Card>
      </div>
    );
  }

  // 已完成的步骤 - 显示分析结果摘要
  if (analysis) {
    return (
      <div>
        <Title level={4}>剧本分析结果</Title>
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={4} size="small">
            <Descriptions.Item label="章节数">{analysis.chapters}</Descriptions.Item>
            <Descriptions.Item label="角色数">{analysis.characters}</Descriptions.Item>
            <Descriptions.Item label="道具数">{analysis.props || 0}</Descriptions.Item>
            <Descriptions.Item label="对白数">{analysis.dialogues}</Descriptions.Item>
          </Descriptions>
        </Card>
        {script && (
          <Card size="small" title="漫剧剧本" style={{ marginBottom: 16, maxHeight: 400, overflow: 'auto' }}
            styles={{ body: { fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 } }}>
            {script}
          </Card>
        )}
        <Alert message="剧本分析已完成" description="当前步骤已完成，可以点击上方步骤条查看其他步骤。" type="success" showIcon />
      </div>
    );
  }

  return null;
};

export default Step1Analysis;
